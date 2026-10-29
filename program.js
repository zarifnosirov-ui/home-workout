// The training program. Edit this file to change exercises, ranges or progressions.
// Each "track" is a ladder of progressively harder variations. You train one level of
// each track; when you hit the top of the rep range on every set, you move up a level.

window.PROGRAM = {
  // Workouts alternate A, B, A, B... every other day.
  workouts: {
    A: { name: 'Workout A', focus: 'Push-ups · Squats · Rows · Plank', tracks: ['push', 'squat', 'row', 'plank'] },
    B: { name: 'Workout B', focus: 'Pike push-ups · Glutes · Back · Leg raises', tracks: ['pike', 'hinge', 'back', 'legraise'] },
  },

  // unit: 'reps' or 'sec'. side: true = per side (do both sides, log one side's count).
  tracks: {
    push: {
      title: 'Push', start: 1, levels: [
        { name: 'Incline push-up', cue: 'Hands on a bed or sturdy chair. Body in a straight line, chest to the edge.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Push-up', cue: 'Hands just wider than shoulders, elbows ~45°. Chest touches the floor, full lockout at top. Squeeze glutes.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Decline push-up', cue: 'Feet on a chair or bed. Keep the hips in line, chest to floor.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Diamond push-up', cue: 'Thumbs and index fingers form a diamond under your chest. Elbows stay close.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Archer push-up', cue: 'Very wide hands. Lower toward one hand while the other arm stays straight.', sets: 3, min: 5, max: 10, unit: 'reps', side: true },
        { name: 'Pseudo-planche push-up', cue: 'Hands by your hips, fingers turned out, lean forward over your hands.', sets: 3, min: 5, max: 12, unit: 'reps' },
      ],
    },
    squat: {
      title: 'Legs', start: 0, levels: [
        { name: 'Bodyweight squat', cue: 'Feet shoulder-width, sit back and down until thighs are below parallel. Knees track over toes. 2 seconds down.', sets: 3, min: 12, max: 20, unit: 'reps' },
        { name: 'Split squat', cue: 'Long stance, back knee lowers to just above the floor. Torso upright.', sets: 3, min: 8, max: 12, unit: 'reps', side: true },
        { name: 'Bulgarian split squat', cue: 'Rear foot on a chair or couch. Front shin roughly vertical. Slow down, drive up.', sets: 3, min: 8, max: 12, unit: 'reps', side: true },
        { name: 'Assisted shrimp squat', cue: 'Hold a doorframe. Bend one knee back and hold the foot, lower the knee to a pillow.', sets: 3, min: 5, max: 8, unit: 'reps', side: true },
        { name: 'Assisted pistol squat', cue: 'Hold a doorframe, one leg straight out in front, sit all the way down on one leg.', sets: 3, min: 5, max: 8, unit: 'reps', side: true },
        { name: 'Pistol squat', cue: 'No support. Arms forward for balance. Control the bottom.', sets: 3, min: 3, max: 8, unit: 'reps', side: true },
      ],
    },
    row: {
      title: 'Pull', start: 0, levels: [
        { name: 'Doorframe row', cue: 'Grip both sides of a doorframe, feet close to the frame, lean back with straight arms, pull chest to the frame. Squeeze shoulder blades.', sets: 3, min: 10, max: 15, unit: 'reps' },
        { name: 'Single-arm doorframe row', cue: 'Same as doorframe row with one hand. Do not rotate the torso.', sets: 3, min: 8, max: 12, unit: 'reps', side: true },
        { name: 'Table row (knees bent)', cue: 'Lie under a STURDY table, grip the edge, feet flat, pull chest to the table. Test the table first!', sets: 3, min: 8, max: 12, unit: 'reps' },
        { name: 'Table row (legs straight)', cue: 'As before, legs straight, body like a plank.', sets: 3, min: 8, max: 12, unit: 'reps' },
        { name: 'Table row (feet elevated)', cue: 'Heels on a chair. Body straight, pull until chest touches.', sets: 3, min: 6, max: 12, unit: 'reps' },
      ],
    },
    plank: {
      title: 'Core', start: 0, levels: [
        { name: 'Plank', cue: 'Forearms down, squeeze glutes and quads, ribs down. No sagging hips.', sets: 3, min: 30, max: 60, unit: 'sec' },
        { name: 'Tuck hollow hold', cue: 'On your back, lower back pressed into floor, knees tucked, shoulders off the floor.', sets: 3, min: 20, max: 40, unit: 'sec' },
        { name: 'Hollow body hold', cue: 'Arms overhead, legs straight and low, lower back glued to the floor.', sets: 3, min: 20, max: 45, unit: 'sec' },
        { name: 'Hollow rocks', cue: 'Hold the hollow position and rock from shoulders to hips.', sets: 3, min: 10, max: 20, unit: 'reps' },
      ],
    },
    pike: {
      title: 'Shoulders', start: 0, levels: [
        { name: 'Pike push-up', cue: 'Hips high (upside-down V). Lower the top of your head toward the floor in front of your hands.', sets: 3, min: 6, max: 12, unit: 'reps' },
        { name: 'Elevated pike push-up', cue: 'Feet on a chair, hips stacked over shoulders as much as possible.', sets: 3, min: 6, max: 12, unit: 'reps' },
        { name: 'Wall handstand hold', cue: 'Kick up or walk up the wall, chest facing the wall. Arms locked, body tight.', sets: 3, min: 20, max: 45, unit: 'sec' },
        { name: 'Wall handstand push-up negative', cue: 'From a wall handstand, lower your head to the floor over 3–5 seconds, come down.', sets: 3, min: 3, max: 6, unit: 'reps' },
        { name: 'Wall handstand push-up', cue: 'Full range: head to floor and press back to lockout.', sets: 3, min: 3, max: 8, unit: 'reps' },
      ],
    },
    hinge: {
      title: 'Glutes & hamstrings', start: 0, levels: [
        { name: 'Glute bridge', cue: 'On your back, feet close to your glutes. Drive hips up, squeeze 2 seconds at the top.', sets: 3, min: 12, max: 20, unit: 'reps' },
        { name: 'Single-leg glute bridge', cue: 'One foot down, other leg up. Keep hips level.', sets: 3, min: 8, max: 15, unit: 'reps', side: true },
        { name: 'Single-leg hip thrust', cue: 'Shoulders on the couch edge, one foot down. Full hip extension.', sets: 3, min: 8, max: 15, unit: 'reps', side: true },
        { name: 'Nordic curl negative', cue: 'Kneel on a pillow, heels anchored under a couch. Lower your body forward as slowly as possible, catch with hands.', sets: 3, min: 3, max: 6, unit: 'reps' },
      ],
    },
    back: {
      title: 'Back', start: 0, levels: [
        { name: 'Superman hold', cue: 'Face down, lift arms, chest and legs. Squeeze glutes and upper back.', sets: 3, min: 20, max: 40, unit: 'sec' },
        { name: 'Prone Y-T-W raises', cue: 'Face down, lift arms into Y, then T, then W shape = 1 rep. Thumbs up, hold each 1 second.', sets: 3, min: 6, max: 12, unit: 'reps' },
        { name: 'Reverse snow angels', cue: 'Face down, arms hover off the floor, sweep from hips to overhead and back. Slow.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Superman pulls', cue: 'In superman position, pull elbows down to ribs like a pull-up, then reach back overhead.', sets: 3, min: 10, max: 20, unit: 'reps' },
      ],
    },
    legraise: {
      title: 'Lower abs', start: 0, levels: [
        { name: 'Lying knee raise', cue: 'On your back, hands under hips. Bring knees to chest, lower slowly without arching your back.', sets: 3, min: 10, max: 20, unit: 'reps' },
        { name: 'Lying leg raise', cue: 'Legs straight, lower until just above the floor with your lower back pressed down.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Reverse crunch', cue: 'Raise legs, then curl your hips off the floor toward your face. Control on the way down.', sets: 3, min: 8, max: 15, unit: 'reps' },
        { name: 'Dragon flag negative', cue: 'Hold a heavy couch behind your head. From shoulder stand, lower a rigid body slowly.', sets: 3, min: 3, max: 6, unit: 'reps' },
      ],
    },
  },

  warmup: [
    { name: 'Jumping jacks (or marching on the spot)', sec: 45 },
    { name: 'Arm circles, forward then back', sec: 30 },
    { name: 'Hip circles', sec: 30 },
    { name: 'Cat-cow', sec: 30 },
    { name: 'Inchworms', sec: 45 },
    { name: 'Bodyweight squats, slow', sec: 30 },
    { name: 'Scapular push-ups (shoulder blades only)', sec: 30 },
    { name: 'Glute bridges', sec: 30 },
  ],

  cooldown: [
    { name: 'Doorway chest stretch', sec: 30 },
    { name: 'Hip flexor stretch — left', sec: 30 },
    { name: 'Hip flexor stretch — right', sec: 30 },
    { name: 'Seated hamstring stretch', sec: 30 },
    { name: "Child's pose, breathe into your belly", sec: 45 },
  ],

  // Kegel: done every day (on workout days, at the end of the workout).
  // A session = 3 rounds of [slow holds, quick flicks], then reverse kegels to fully relax.
  kegel: {
    sessionsToLevelUp: 14,
    levels: [
      { name: 'Level 1 — Foundation', hold: 3, relax: 3, holds: 10, flicks: 10, rounds: 3 },
      { name: 'Level 2 — Building', hold: 5, relax: 5, holds: 10, flicks: 10, rounds: 3 },
      { name: 'Level 3 — Endurance', hold: 8, relax: 8, holds: 10, flicks: 15, rounds: 3 },
      { name: 'Level 4 — Mastery', hold: 10, relax: 10, holds: 10, flicks: 20, rounds: 3 },
    ],
    roundRest: 30,
    reverseBreaths: 5, // 4s inhale + let pelvic floor drop, 4s exhale
  },
};
