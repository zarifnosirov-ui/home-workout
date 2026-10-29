'use strict';
const P = window.PROGRAM;
const $app = document.getElementById('app');
const $tabs = document.getElementById('tabs');

let DATA = null;
let tab = 'home';
let player = null; // active workout or kegel session
let timerHandle = null;

// ---------- utils ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^A-Za-z0-9_-]/g, '');
const dayKey = d => new Date(d).toLocaleDateString('en-CA'); // YYYY-MM-DD local
const today = () => dayKey(new Date());
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const unitLabel = l => (l.unit === 'sec' ? 's' : ' reps') + (l.side ? ' / side' : '');
const level = trackId => P.tracks[trackId].levels[DATA.levels[trackId]];

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ---------- sound / haptics ----------
let audioCtx = null;
function beep(freq = 880, ms = 150) {
  if (!DATA?.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch {}
}
function buzz(pattern) { if (DATA?.settings.vibrate && navigator.vibrate) navigator.vibrate(pattern); }

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}

// ---------- storage: everything lives on this device ----------
const STORE_KEY = 'hw_data';

function emptyData() {
  return {
    version: 1, createdAt: new Date().toISOString(), lastBackup: null,
    levels: null, kegelLevel: 0,
    settings: { restSeconds: 75, sound: true, vibrate: true },
    workouts: [], kegel: [], body: [],
  };
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DATA)); }
  catch (e) { toast('Could not save: ' + e.message); }
}
const saveState = persist;

function load() {
  try { DATA = JSON.parse(localStorage.getItem(STORE_KEY)); } catch {}
  DATA = { ...emptyData(), ...(DATA || {}) };
  if (!DATA.levels) DATA.levels = {};
  for (const [k, t] of Object.entries(P.tracks)) if (DATA.levels[k] == null) DATA.levels[k] = t.start;
  persist();
  // ask the browser not to clear our data when the phone is low on space
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  $tabs.hidden = false;
  render();
}

// Backup = a JSON file you save to iCloud Drive / Files / Google Drive, or AirDrop to your laptop.
async function backup() {
  const name = `workout-backup-${today()}.json`;
  const file = new File([JSON.stringify(DATA, null, 2)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Workout backup' }); }
    catch (e) { if (e.name === 'AbortError') return; toast('Backup failed: ' + e.message); return; }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  DATA.lastBackup = new Date().toISOString();
  persist();
  toast('Backup saved');
  render();
}

function restore(file) {
  file.text().then(text => {
    const b = JSON.parse(text);
    if (!Array.isArray(b.workouts) || !Array.isArray(b.kegel)) throw new Error('Not a workout backup file');
    if (!confirm(`Replace ALL current data with this backup (${b.workouts.length} workouts, ${b.kegel.length} Kegel sessions)?`)) return;
    DATA = { ...emptyData(), ...b };
    persist();
    toast('Backup restored');
    load();
  }).catch(err => toast('Restore failed: ' + err.message));
}

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

$tabs.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  if (player && !confirm('Leave the current session? Progress in this session will be lost.')) return;
  stopPlayer();
  tab = b.dataset.tab;
  render();
});

function render() {
  for (const b of $tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === tab && !player);
  if (player) return player.render();
  ({ home: renderHome, kegel: renderKegelHome, progress: renderProgress, settings: renderSettings })[tab]();
  window.scrollTo(0, 0);
}

// ---------- schedule ----------
function lastWorkout() { return DATA.workouts[DATA.workouts.length - 1]; }
function nextWorkoutType() { const l = lastWorkout(); return l ? (l.type === 'A' ? 'B' : 'A') : 'A'; }
function daysUntilDue() {
  const l = lastWorkout();
  if (!l) return 0;
  return 2 - daysBetween(dayKey(l.date), today());
}
function kegelDoneToday() { return DATA.kegel.some(k => dayKey(k.date) === today()); }
function kegelStreak() {
  const days = new Set(DATA.kegel.map(k => dayKey(k.date)));
  let n = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break the streak
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function workoutsLast7() {
  return DATA.workouts.filter(w => daysBetween(dayKey(w.date), today()) < 7).length;
}
function sessionsAtKegelLevel() { return DATA.kegel.filter(k => k.level === DATA.kegelLevel).length; }

// ---------- HOME ----------
function notices() {
  let out = '';
  let hidden = false;
  try { hidden = localStorage.getItem('hw_hide_install') === '1'; } catch {}
  if (!isInstalled() && !hidden) {
    const how = isIOS()
      ? 'In Safari, tap the <b>Share</b> button <b>⎙</b>, then <b>Add to Home Screen</b>.'
      : 'In Chrome, tap <b>⋮</b> then <b>Add to Home screen</b> / <b>Install app</b>.';
    out += `<div class="card stack"><h3 style="margin:0">📲 Put this on your home screen</h3>
      <p class="small" style="margin:0">${how} It then opens like a normal app, full screen, and works offline.</p>
      <button class="ghost small" id="ninst" style="align-self:flex-start;padding:0;min-height:auto">Got it, hide this</button></div>`;
  }
  const entries = DATA.workouts.length + DATA.kegel.length;
  const since = DATA.lastBackup ? daysBetween(dayKey(DATA.lastBackup), today()) : Infinity;
  if (entries >= 3 && since >= 7) {
    out += `<div class="card stack"><h3 style="margin:0">💾 Time for a backup</h3>
      <p class="small muted" style="margin:0">${DATA.lastBackup ? `Last one was ${since} days ago.` : 'You haven\'t saved one yet.'} Your data only lives on this phone — save a copy to iCloud Drive / Files.</p>
      <button id="nbak">Save backup</button></div>`;
  }
  return out;
}

function renderHome() {
  const type = nextWorkoutType();
  const w = P.workouts[type];
  const due = daysUntilDue();
  const dueText = due <= 0 ? (due < 0 ? `<span class="tag warn">${-due} day${due === -1 ? '' : 's'} overdue</span>` : '<span class="tag good">Due today</span>')
    : `<span class="tag">Rest day — next in ${due} day${due > 1 ? 's' : ''}</span>`;
  const kDone = kegelDoneToday();
  const kl = P.kegel.levels[DATA.kegelLevel];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  $app.innerHTML = `
    <h1>${greet}</h1>
    <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    ${notices()}

    <div class="card hero stack">
      <div class="row spread"><h2 style="margin:0">${w.name}</h2>${dueText}</div>
      <p class="muted" style="margin:0">${w.focus} · ~35 min</p>
      <ul class="list">
        ${w.tracks.map(t => { const l = level(t); return `<li class="row spread"><span>${esc(l.name)}</span><span class="muted small">${l.sets}×${l.min}–${l.max}${unitLabel(l)}</span></li>`; }).join('')}
      </ul>
      <button class="primary block big" id="start">${due > 0 ? 'Start anyway' : 'Start workout'}</button>
      ${due > 0 ? '<p class="small muted center" style="margin:0">Rest days are when muscle is built. A walk or stretching is perfect today.</p>' : ''}
    </div>

    <div class="card kegel stack">
      <div class="row spread"><h2 style="margin:0">Daily Kegel</h2>${kDone ? '<span class="tag good">Done today ✓</span>' : '<span class="tag">Not done yet</span>'}</div>
      <p class="muted" style="margin:0">${esc(kl.name)} · ${kl.hold}s holds · ~${Math.round(kegelSessionSeconds() / 60)} min</p>
      <button class="kegel-btn block" id="kegel">${kDone ? 'Do another session' : 'Start Kegel session'}</button>
    </div>

    <div class="stats">
      <div class="stat"><b>${DATA.workouts.length}</b><span>workouts total</span></div>
      <div class="stat"><b>${workoutsLast7()}</b><span>workouts, last 7 days</span></div>
      <div class="stat"><b>${kegelStreak()}</b><span>day Kegel streak</span></div>
      <div class="stat"><b>${DATA.kegel.length}</b><span>Kegel sessions</span></div>
    </div>`;
  document.getElementById('start').onclick = () => startWorkout(type);
  const bak = document.getElementById('nbak');
  if (bak) bak.onclick = backup;
  const hide = document.getElementById('ninst');
  if (hide) hide.onclick = () => { try { localStorage.setItem('hw_hide_install', '1'); } catch {} render(); };
  document.getElementById('kegel').onclick = () => startKegel(null);
}

// ---------- WORKOUT PLAYER ----------
function lastSetsFor(trackId, lvl) {
  for (let i = DATA.workouts.length - 1; i >= 0; i--) {
    const ex = DATA.workouts[i].exercises.find(e => e.track === trackId && e.level === lvl);
    if (ex) return ex.sets;
  }
  return null;
}

function startWorkout(type) {
  const w = P.workouts[type];
  const p = player = {
    kind: 'workout', type, started: Date.now(),
    phase: 'warmup', idx: 0, // warmup/cooldown item index, or exercise index
    set: 0, remaining: P.warmup[0].sec, paused: false,
    exercises: w.tracks.map(t => ({ track: t, level: DATA.levels[t], name: level(t).name, sets: [] })),
    value: 0, holding: false,
    render: renderWorkout,
  };
  prefill(p);
  keepAwake(true);
  beep(660);
  startTicker();
  render();
}

function prefill(p) {
  const ex = p.exercises[p.idx];
  if (!ex) return;
  const l = P.tracks[ex.track].levels[ex.level];
  const last = lastSetsFor(ex.track, ex.level);
  p.value = last?.[p.set] ?? (l.unit === 'sec' ? 0 : l.min);
  p.holding = false;
}

let lastTickAt = 0;
function startTicker() {
  clearInterval(timerHandle);
  lastTickAt = Date.now();
  timerHandle = setInterval(() => {
    // count real elapsed seconds, so timers stay correct if the phone throttles or pauses the app
    const now = Date.now();
    const n = Math.min(600, Math.max(1, Math.round((now - lastTickAt) / 1000)));
    lastTickAt = now;
    for (let i = 0; i < n && player && timerHandle; i++) tick();
  }, 1000);
}

function stopPlayer() {
  clearInterval(timerHandle);
  timerHandle = null;
  player = null;
  keepAwake(false);
}

function tick() {
  const p = player;
  if (!p || p.paused) return;
  if (p.kind === 'kegel') return kegelTick();
  if (p.phase === 'exercise' && p.holding) { p.value++; return updateValue(); }
  if (!['warmup', 'rest', 'cooldown'].includes(p.phase)) return;
  p.remaining--;
  if (p.remaining <= 3 && p.remaining > 0) beep(660, 80);
  if (p.remaining <= 0) { beep(990, 300); buzz(300); advanceTimed(); }
  else { const t = document.getElementById('t'); if (t) t.textContent = fmtTime(p.remaining); }
}

function advanceTimed() {
  const p = player;
  if (p.phase === 'warmup') {
    p.idx++;
    if (p.idx < P.warmup.length) p.remaining = P.warmup[p.idx].sec;
    else { p.phase = 'exercise'; p.idx = 0; p.set = 0; prefill(p); }
  } else if (p.phase === 'rest') {
    p.phase = 'exercise';
  } else if (p.phase === 'cooldown') {
    p.idx++;
    if (p.idx < P.cooldown.length) p.remaining = P.cooldown[p.idx].sec;
    else p.phase = 'summary';
  }
  render();
}

function logSet() {
  const p = player;
  const ex = p.exercises[p.idx];
  const l = P.tracks[ex.track].levels[ex.level];
  ex.sets.push(Math.max(0, p.value));
  p.holding = false;
  p.set++;
  if (p.set >= l.sets) { p.idx++; p.set = 0; }
  if (p.idx >= p.exercises.length) { p.phase = 'cooldown'; p.idx = 0; p.remaining = P.cooldown[0].sec; }
  else { p.phase = 'rest'; p.remaining = DATA.settings.restSeconds; prefill(p); }
  beep(770);
  render();
}

function skipExercise() {
  const p = player;
  p.idx++; p.set = 0;
  if (p.idx >= p.exercises.length) { p.phase = 'cooldown'; p.idx = 0; p.remaining = P.cooldown[0].sec; }
  else prefill(p);
  render();
}

function updateValue() {
  const el = document.getElementById('val');
  if (el) el.textContent = player.value;
}

function workoutProgress(p) {
  const totalSets = p.exercises.reduce((n, e) => n + P.tracks[e.track].levels[e.level].sets, 0);
  const done = p.exercises.reduce((n, e) => n + e.sets.length, 0);
  if (p.phase === 'warmup') return 0.1 * p.idx / P.warmup.length;
  if (p.phase === 'cooldown') return 0.9 + 0.1 * p.idx / P.cooldown.length;
  if (p.phase === 'summary') return 1;
  return 0.1 + 0.8 * done / totalSets;
}

function renderWorkout() {
  const p = player;
  const top = `
    <div class="top">
      <button class="ghost" id="quit">✕ Quit</button>
      <span class="muted small">${P.workouts[p.type].name} · ${fmtTime((Date.now() - p.started) / 1000)}</span>
      <button class="ghost" id="pause">${p.paused ? '▶ Resume' : '❚❚ Pause'}</button>
    </div>
    <div class="progress-bar"><div style="width:${workoutProgress(p) * 100}%"></div></div>`;
  let body = '';

  if (p.phase === 'warmup' || p.phase === 'cooldown') {
    const list = p.phase === 'warmup' ? P.warmup : P.cooldown;
    const item = list[p.idx];
    const next = list[p.idx + 1];
    body = `
      <p class="muted center">${p.phase === 'warmup' ? 'Warm-up' : 'Cool-down'} · ${p.idx + 1} of ${list.length}</p>
      <h1 class="center">${esc(item.name)}</h1>
      <div class="timer" id="t">${fmtTime(p.remaining)}</div>
      <p class="muted center">${next ? 'Next: ' + esc(next.name) : p.phase === 'warmup' ? 'Next: first exercise' : 'Last one'}</p>
      <div class="spacer"></div>
      <div class="row"><button class="block" id="skip">Skip →</button>${p.phase === 'warmup' ? '<button class="block ghost" id="skipall">Skip warm-up</button>' : ''}</div>`;
  } else if (p.phase === 'rest') {
    const ex = p.exercises[p.idx];
    const l = P.tracks[ex.track].levels[ex.level];
    body = `
      <p class="muted center">Rest</p>
      <div class="timer" id="t">${fmtTime(p.remaining)}</div>
      <p class="center">Up next: <b>${esc(l.name)}</b> — set ${p.set + 1} of ${l.sets}</p>
      <div class="spacer"></div>
      <div class="row"><button class="block" id="plus">+15 s</button><button class="block primary" id="skip">Start now</button></div>`;
  } else if (p.phase === 'exercise') {
    const ex = p.exercises[p.idx];
    const l = P.tracks[ex.track].levels[ex.level];
    const t = P.tracks[ex.track];
    const last = lastSetsFor(ex.track, ex.level);
    const isSec = l.unit === 'sec';
    body = `
      <p class="muted small" style="margin:0">${esc(t.title)} · level ${ex.level + 1} of ${t.levels.length}</p>
      <h1>${esc(l.name)}</h1>
      <p class="muted">${esc(l.cue)}</p>
      <p class="center" style="margin:6px 0 0"><b>Set ${p.set + 1} of ${l.sets}</b> · target ${l.min}–${l.max}${unitLabel(l)}</p>
      <div class="sets">${Array.from({ length: l.sets }, (_, i) => `<span class="${i < ex.sets.length ? 'done' : ''}">${ex.sets[i] ?? (last?.[i] != null ? `<span class="muted">${last[i]}</span>` : '–')}</span>`).join('')}</div>
      <p class="center small muted" style="margin:0">${last ? 'grey = last time' : ''}</p>
      <div class="counter">
        <button id="minus" aria-label="minus">−</button>
        <div class="value" id="val">${p.value}</div>
        <button id="plusv" aria-label="plus">+</button>
      </div>
      <p class="center muted small" style="margin-top:-12px">${isSec ? 'seconds' : l.side ? 'reps per side' : 'reps'}</p>
      ${isSec ? `<button class="block big" id="hold">${p.holding ? '■ Stop timer' : '▶ Start hold timer'}</button>` : ''}
      <div class="spacer"></div>
      <button class="primary block big" id="log" style="margin-top:12px">Log set ✓</button>
      <button class="ghost block" id="skipex">Skip this exercise</button>`;
  } else if (p.phase === 'summary') {
    return renderSummary();
  }

  $app.innerHTML = `<div class="player">${top}${body}</div>`;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('quit', () => { if (confirm('Quit workout? It will not be saved.')) { stopPlayer(); render(); } });
  on('pause', () => { p.paused = !p.paused; render(); });
  on('skip', () => { p.remaining = 0; advanceTimed(); });
  on('skipall', () => { p.idx = P.warmup.length; advanceTimed(); });
  on('plus', () => { p.remaining += 15; document.getElementById('t').textContent = fmtTime(p.remaining); });
  on('minus', () => { p.value = Math.max(0, p.value - 1); updateValue(); });
  on('plusv', () => { p.value++; updateValue(); });
  on('hold', () => {
    if (!p.holding) { p.value = 0; p.holding = true; beep(660); } else { p.holding = false; beep(990); }
    render();
  });
  on('log', logSet);
  on('skipex', skipExercise);
}

function readyToLevelUp(ex) {
  const l = P.tracks[ex.track].levels[ex.level];
  return ex.sets.length >= l.sets && ex.sets.every(v => v >= l.max) && ex.level < P.tracks[ex.track].levels.length - 1;
}

function renderSummary() {
  const p = player;
  const dur = Math.round((Date.now() - p.started) / 1000);
  const done = p.exercises.filter(e => e.sets.length);
  const ups = done.filter(readyToLevelUp);
  clearInterval(timerHandle);
  keepAwake(false);
  $app.innerHTML = `
    <h1>Workout complete 💪</h1>
    <p class="muted">${P.workouts[p.type].name} · ${fmtTime(dur)}</p>
    <div class="card">
      <ul class="list">
        ${done.map(e => { const l = P.tracks[e.track].levels[e.level]; return `<li class="row spread"><span>${esc(l.name)}</span><span class="muted">${e.sets.join(' · ')}${unitLabel(l)}</span></li>`; }).join('') || '<li class="muted">No sets logged</li>'}
      </ul>
    </div>
    ${ups.length ? `<div class="card hero stack"><h2>Level up! 🎉</h2><p class="muted" style="margin:0">You hit the top of the range on every set. Move to the next variation?</p>
      ${ups.map(e => { const next = P.tracks[e.track].levels[e.level + 1]; return `<label class="row" style="color:var(--text);font-size:1rem"><input type="checkbox" data-up="${e.track}" checked style="min-height:auto;width:22px;height:22px"> ${esc(P.tracks[e.track].levels[e.level].name)} → <b>${esc(next.name)}</b></label>`; }).join('')}</div>` : ''}
    <div class="card">
      <label for="rpe">How hard was it?</label>
      <select id="rpe" style="width:100%">
        <option value="2">Easy — could do much more</option>
        <option value="3" selected>Solid — challenging but good</option>
        <option value="4">Hard — near my limit</option>
        <option value="5">Too hard — struggled with form</option>
      </select>
      <label for="note" style="margin-top:10px">Note (optional)</label>
      <input id="note" style="width:100%" placeholder="e.g. left knee felt tight">
    </div>
    <button class="primary block big" id="save">Save workout</button>
    <button class="kegel-btn block" id="savek" style="margin-top:10px">Save &amp; do Kegel session</button>
    <button class="ghost block" id="discard" style="margin-top:6px">Discard</button>`;

  const saveIt = () => {
    const w = { id: uid(), date: new Date(p.started).toISOString(), type: p.type, durationSec: dur,
      rpe: Number(document.getElementById('rpe').value), note: document.getElementById('note').value.trim(),
      exercises: done.map(({ track, level, sets }) => ({ track, level, sets })) };
    DATA.workouts.push(w);
    let leveled = false;
    for (const cb of document.querySelectorAll('[data-up]')) if (cb.checked) { DATA.levels[cb.dataset.up]++; leveled = true; }
    stopPlayer();
    persist();
    toast(leveled ? 'Workout saved · level up! 🎉' : 'Workout saved');
  };
  document.getElementById('save').onclick = () => { saveIt(); tab = 'home'; render(); };
  document.getElementById('savek').onclick = () => { saveIt(); startKegel(null); };
  document.getElementById('discard').onclick = () => { if (confirm('Discard this workout?')) { stopPlayer(); render(); } };
}

// ---------- KEGEL ----------
function kegelSteps(lv) {
  const k = P.kegel, steps = [];
  for (let r = 0; r < lv.rounds; r++) {
    for (let i = 0; i < lv.holds; i++) {
      steps.push({ phase: 'squeeze', sec: lv.hold, label: 'SQUEEZE & LIFT', info: `Round ${r + 1}/${lv.rounds} · slow hold ${i + 1}/${lv.holds}` });
      steps.push({ phase: 'relax', sec: lv.relax, label: 'RELAX FULLY', info: `Round ${r + 1}/${lv.rounds} · slow hold ${i + 1}/${lv.holds}` });
    }
    for (let i = 0; i < lv.flicks; i++) {
      steps.push({ phase: 'squeeze flick', sec: 1, label: 'QUICK SQUEEZE', info: `Round ${r + 1}/${lv.rounds} · quick flick ${i + 1}/${lv.flicks}` });
      steps.push({ phase: 'relax flick', sec: 1, label: 'RELEASE', info: `Round ${r + 1}/${lv.rounds} · quick flick ${i + 1}/${lv.flicks}` });
    }
    if (r < lv.rounds - 1) steps.push({ phase: 'rest', sec: k.roundRest, label: 'REST', info: 'Breathe normally. Next round coming up.' });
  }
  for (let i = 0; i < k.reverseBreaths; i++) {
    steps.push({ phase: 'inhale', sec: 4, label: 'BREATHE IN · LET GO', info: `Reverse Kegel ${i + 1}/${k.reverseBreaths} — let the pelvic floor drop and soften` });
    steps.push({ phase: 'exhale', sec: 4, label: 'BREATHE OUT', info: `Reverse Kegel ${i + 1}/${k.reverseBreaths} — stay relaxed, don't squeeze` });
  }
  return steps;
}
function kegelSessionSeconds(lv = P.kegel.levels[DATA.kegelLevel]) { return kegelSteps(lv).reduce((n, s) => n + s.sec, 0); }

function renderKegelHome() {
  const lv = P.kegel.levels[DATA.kegelLevel];
  const atLevel = sessionsAtKegelLevel();
  const canUp = DATA.kegelLevel < P.kegel.levels.length - 1 && atLevel >= P.kegel.sessionsToLevelUp;
  $app.innerHTML = `
    <h1>Kegel training</h1>
    <p class="muted">Pelvic floor strength for bladder control, core stability and sexual health. Once a day, every day.</p>
    <div class="card kegel stack">
      <div class="row spread"><h2 style="margin:0">${esc(lv.name)}</h2>${kegelDoneToday() ? '<span class="tag good">Done today ✓</span>' : ''}</div>
      <p style="margin:0">${lv.rounds} rounds of: <b>${lv.holds} slow holds</b> (${lv.hold}s squeeze / ${lv.relax}s relax) + <b>${lv.flicks} quick flicks</b>, then ${P.kegel.reverseBreaths} relaxation breaths.</p>
      <p class="muted small" style="margin:0">~${Math.round(kegelSessionSeconds() / 60)} min · ${atLevel}/${P.kegel.sessionsToLevelUp} sessions at this level</p>
      <button class="kegel-btn block big" id="go">Start session</button>
    </div>
    ${canUp ? `<div class="card hero stack"><h2>Ready for ${esc(P.kegel.levels[DATA.kegelLevel + 1].name)}?</h2>
      <p class="muted" style="margin:0">You've done ${atLevel} sessions at this level. If the holds feel easy and you can fully relax between them, move up.</p>
      <button class="primary" id="up">Level up</button></div>` : ''}
    <div class="card">
      <h2>How to do it right</h2>
      <ul style="margin:0;padding-left:18px">
        <li><b>Find the muscle:</b> squeeze as if stopping urine and holding in gas at the same time — a lift <i>up and in</i>.</li>
        <li><b>Isolate it:</b> belly, buttocks and thighs stay relaxed. Keep breathing — never hold your breath.</li>
        <li><b>Relaxing matters as much as squeezing.</b> Let go completely between reps. The reverse Kegel breaths at the end train this — important for sexual performance and control.</li>
        <li><b>Don't</b> practise while actually urinating — it's only for finding the muscle once.</li>
        <li>Start lying down; once easy, do sessions sitting, then standing.</li>
        <li>Pain, or symptoms that get worse? Stop and see a doctor or pelvic floor physiotherapist.</li>
      </ul>
    </div>`;
  document.getElementById('go').onclick = () => startKegel(null);
  const up = document.getElementById('up');
  if (up) up.onclick = () => { DATA.kegelLevel++; saveState(); toast('Kegel level up!'); render(); };
}

function startKegel() {
  const lv = P.kegel.levels[DATA.kegelLevel];
  player = {
    kind: 'kegel', started: Date.now(), steps: kegelSteps(lv), i: 0, paused: false,
    render: renderKegelPlayer,
  };
  player.remaining = player.steps[0].sec;
  keepAwake(true);
  startTicker();
  render();
  cue(player.steps[0]);
}

function cue(step) {
  if (step.phase.startsWith('squeeze')) { beep(880, step.sec === 1 ? 60 : 150); buzz(step.sec === 1 ? 40 : 120); }
  else if (step.phase === 'relax') beep(520, 150);
  else if (step.phase === 'rest' || step.phase === 'inhale') beep(440, 200);
}

function kegelTick() {
  const p = player;
  p.remaining--;
  if (p.remaining > 0) { const t = document.getElementById('kt'); if (t) t.textContent = p.remaining; return; }
  p.i++;
  if (p.i >= p.steps.length) return finishKegel(true);
  p.remaining = p.steps[p.i].sec;
  cue(p.steps[p.i]);
  renderKegelPlayer();
}

function renderKegelPlayer() {
  const p = player;
  const s = p.steps[p.i];
  const pct = p.i / p.steps.length * 100;
  $app.innerHTML = `
    <div class="player">
      <div class="top">
        <button class="ghost" id="quit">✕ Stop</button>
        <span class="muted small">${esc(P.kegel.levels[DATA.kegelLevel].name)}</span>
        <button class="ghost" id="pause">${p.paused ? '▶ Resume' : '❚❚ Pause'}</button>
      </div>
      <div class="progress-bar"><div style="width:${pct}%;background:var(--kegel)"></div></div>
      <div class="phase">${p.paused ? 'PAUSED' : s.label}</div>
      <div class="orb-wrap"><div class="orb ${s.phase}" id="orb"><span id="kt">${p.remaining}</span></div></div>
      <p class="center muted">${esc(s.info)}</p>
      <div class="spacer"></div>
      <p class="center small muted">Keep breathing. Belly, glutes and thighs stay soft.</p>
    </div>`;
  document.getElementById('quit').onclick = () => {
    const doneFrac = p.i / p.steps.length;
    if (doneFrac > 0.5 ? confirm('Stop now? You did over half — it will be saved.') : confirm('Stop session? It will not be saved.')) finishKegel(doneFrac > 0.5);
  };
  document.getElementById('pause').onclick = () => { p.paused = !p.paused; renderKegelPlayer(); };
}

async function finishKegel(save) {
  const p = player;
  stopPlayer();
  if (save) {
    const k = { id: uid(), date: new Date(p.started).toISOString(), level: DATA.kegelLevel, durationSec: Math.round((Date.now() - p.started) / 1000), complete: p.i >= p.steps.length };
    DATA.kegel.push(k);
    beep(990, 400); buzz([100, 80, 100]);
    persist();
    toast(`Kegel session saved · ${kegelStreak()} day streak`);
  }
  tab = 'home';
  render();
}

// ---------- PROGRESS ----------
function lineChart(points, { unit = '', height = 160 } = {}) {
  if (points.length < 2) return '<p class="muted small">Log at least two sessions to see a chart.</p>';
  const W = 600, H = height, pl = 36, pr = 10, pt = 10, pb = 22;
  const ys = points.map(p => p.y);
  const max = Math.max(...ys), min = Math.min(0, ...ys);
  const x = i => pl + i * (W - pl - pr) / (points.length - 1);
  const y = v => pt + (H - pt - pb) * (1 - (v - min) / ((max - min) || 1));
  const ticks = [min, (min + max) / 2, max].map(Math.round);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">
    ${ticks.map(t => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${t}${unit}</text>`).join('')}
    <polyline class="line" points="${points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')}"/>
    ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.y)}" r="${p.mark ? 6 : 3.5}"><title>${esc(p.label)}: ${p.y}${unit}</title></circle>`).join('')}
    <text x="${pl}" y="${H - 4}">${esc(points[0].label)}</text>
    <text x="${W - pr}" y="${H - 4}" text-anchor="end">${esc(points[points.length - 1].label)}</text>
  </svg>`;
}

let progressTrack = 'push';
function renderProgress() {
  // 12-week calendar, Monday-first
  const start = new Date(); start.setDate(start.getDate() - 83 - ((start.getDay() + 6) % 7));
  const wDays = new Set(DATA.workouts.map(w => dayKey(w.date)));
  const kDays = new Set(DATA.kegel.map(k => dayKey(k.date)));
  const cells = [];
  for (let d = new Date(start), i = 0; i < 84 + 7; i++, d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    if (k > today() && cells.length % 7 === 0) break;
    const cls = (wDays.has(k) ? 'w' : '') + (kDays.has(k) ? 'k' : '');
    cells.push(`<div class="${cls === 'wk' ? 'kw' : cls}${k > today() ? ' future' : ''}" title="${k}"></div>`);
  }

  // chart for chosen track: total volume per session (reps or seconds); bigger dot = new level
  const t = P.tracks[progressTrack];
  let prevLevel = null;
  const pts = DATA.workouts.flatMap(w => w.exercises.filter(e => e.track === progressTrack).map(e => {
    const p = { y: e.sets.reduce((a, b) => a + b, 0), label: new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + t.levels[e.level].name, mark: prevLevel !== null && e.level !== prevLevel };
    prevLevel = e.level;
    return p;
  }));
  const unit = t.levels[DATA.levels[progressTrack]].unit === 'sec' ? 's' : '';

  const bodyPts = DATA.body.map(b => ({ y: b.weight, label: new Date(b.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }));
  const totalMin = Math.round(DATA.workouts.reduce((n, w) => n + (w.durationSec || 0), 0) / 60 + DATA.kegel.reduce((n, k) => n + (k.durationSec || 0), 0) / 60);

  $app.innerHTML = `
    <h1>Progress</h1>
    <div class="stats">
      <div class="stat"><b>${DATA.workouts.length}</b><span>workouts</span></div>
      <div class="stat"><b>${DATA.kegel.length}</b><span>Kegel sessions</span></div>
      <div class="stat"><b>${kegelStreak()}</b><span>Kegel streak</span></div>
      <div class="stat"><b>${totalMin}</b><span>minutes trained</span></div>
    </div>

    <div class="card">
      <h2>Last 12 weeks</h2>
      <div class="cal">${cells.join('')}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Workout</span><span><i style="background:var(--kegel)"></i>Kegel</span></div>
    </div>

    <div class="card">
      <div class="row spread wrap"><h2 style="margin:0">Strength</h2>
        <select id="track">${Object.entries(P.tracks).map(([k, tr]) => `<option value="${k}" ${k === progressTrack ? 'selected' : ''}>${esc(tr.title)}</option>`).join('')}</select></div>
      <p class="muted small">Total ${unit ? 'seconds' : 'reps'} per session. Big dot = moved to a harder variation (numbers drop, that's normal).</p>
      ${lineChart(pts, { unit })}
      <p class="small" style="margin:8px 0 0">Current: <b>${esc(t.levels[DATA.levels[progressTrack]].name)}</b> (level ${DATA.levels[progressTrack] + 1}/${t.levels.length})</p>
    </div>

    <div class="card">
      <h2>Body weight</h2>
      ${lineChart(bodyPts, { unit: '' })}
      <form id="bw" class="row" style="margin-top:10px"><input id="bwv" type="number" step="0.1" min="20" max="400" placeholder="kg" style="flex:1" required><button class="primary">Log</button></form>
    </div>

    <div class="card">
      <h2>History</h2>
      <ul class="list">
        ${[...DATA.workouts.map(w => ({ ...w, kind: 'workouts' })), ...DATA.kegel.map(k => ({ ...k, kind: 'kegel' }))]
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40).map(item => item.kind === 'workouts'
            ? `<li><div class="row spread"><b>${fmtDate(item.date)} · ${P.workouts[item.type]?.name || 'Workout'}</b><button class="ghost small danger" data-del="workouts/${item.id}">Delete</button></div>
               <div class="small muted">${item.exercises.map(e => `${esc(P.tracks[e.track]?.levels[e.level]?.name || e.track)}: ${e.sets.join('/')}`).join(' · ')}${item.note ? ' — ' + esc(item.note) : ''}</div></li>`
            : `<li><div class="row spread"><span>${fmtDate(item.date)} · <span style="color:var(--kegel)">Kegel</span> <span class="muted small">${esc(P.kegel.levels[item.level]?.name || '')}</span></span><button class="ghost small danger" data-del="kegel/${item.id}">Delete</button></div></li>`
          ).join('') || '<li class="muted">Nothing yet — go do your first workout!</li>'}
      </ul>
    </div>`;

  document.getElementById('track').onchange = e => { progressTrack = e.target.value; renderProgress(); };
  document.getElementById('bw').onsubmit = async e => {
    e.preventDefault();
    const b = { id: uid(), date: new Date().toISOString(), weight: Number(document.getElementById('bwv').value) };
    DATA.body.push(b);
    persist();
    renderProgress();
  };
  for (const btn of $app.querySelectorAll('[data-del]')) btn.onclick = async () => {
    if (!confirm('Delete this entry?')) return;
    const [coll, id] = btn.dataset.del.split('/');
    DATA[coll] = DATA[coll].filter(x => x.id !== id);
    persist();
    renderProgress();
  };
}

// ---------- SETTINGS ----------
function renderSettings() {
  const s = DATA.settings;
  $app.innerHTML = `
    <h1>Settings</h1>
    <div class="card stack">
      <div><label for="rest">Rest between sets (seconds)</label><input id="rest" type="number" min="15" max="300" step="15" value="${s.restSeconds}" style="width:100%"></div>
      <label class="row" style="color:var(--text);font-size:1rem"><input type="checkbox" id="sound" ${s.sound ? 'checked' : ''} style="min-height:auto;width:22px;height:22px"> Sound cues</label>
      <label class="row" style="color:var(--text);font-size:1rem"><input type="checkbox" id="vib" ${s.vibrate ? 'checked' : ''} style="min-height:auto;width:22px;height:22px"> Vibration (phones)</label>
    </div>

    <div class="card stack">
      <h2>Exercise levels</h2>
      <p class="muted small" style="margin:0">The app levels you up automatically. Change here if a variation is too easy or too hard.</p>
      ${Object.entries(P.tracks).map(([k, t]) => `<div><label for="lv-${k}">${esc(t.title)}</label>
        <select id="lv-${k}" data-track="${k}" style="width:100%">${t.levels.map((l, i) => `<option value="${i}" ${i === DATA.levels[k] ? 'selected' : ''}>${i + 1}. ${esc(l.name)}</option>`).join('')}</select></div>`).join('')}
      <div><label for="lv-kegel">Kegel</label>
        <select id="lv-kegel" style="width:100%">${P.kegel.levels.map((l, i) => `<option value="${i}" ${i === DATA.kegelLevel ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
    </div>

    <div class="card stack">
      <h2>Your data</h2>
      <p class="muted small" style="margin:0">Everything is stored only on this device — no account, no cloud. Save a backup now and then (to iCloud Drive / Files, or AirDrop it to your laptop) so you never lose your progress if the phone is lost or reset.</p>
      <p class="small" style="margin:0">Last backup: <b>${DATA.lastBackup ? fmtDate(DATA.lastBackup) : 'never'}</b></p>
      <div class="row wrap"><button class="primary" id="bak">Save backup</button><button id="imp">Restore from backup…</button></div>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <p class="center small muted">Home Workout · data on this device only</p>`;

  const saveSettings = () => {
    s.restSeconds = Math.min(300, Math.max(15, Number(document.getElementById('rest').value) || 75));
    s.sound = document.getElementById('sound').checked;
    s.vibrate = document.getElementById('vib').checked;
    for (const sel of $app.querySelectorAll('[data-track]')) DATA.levels[sel.dataset.track] = Number(sel.value);
    DATA.kegelLevel = Number(document.getElementById('lv-kegel').value);
    saveState();
    toast('Saved');
  };
  for (const el of $app.querySelectorAll('input:not([type=file]), select')) el.onchange = saveSettings;
  document.getElementById('bak').onclick = backup;
  document.getElementById('imp').onclick = () => document.getElementById('file').click();
  document.getElementById('file').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); };
}

// ---------- start ----------
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && player) keepAwake(true); });
load();
