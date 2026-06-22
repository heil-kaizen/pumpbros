// ============================================================================
//  MEME SMASH — global config, constants, character roster, stage data
//  Everything tuning-related lives here. Characters are intentionally
//  data-driven so real meme sprite art can be dropped in later without
//  touching engine code (see `sprite` field + assets/sprites/).
// ============================================================================

export const GAME = {
  WIDTH: 960,
  HEIGHT: 540,
  FPS: 60,
};

// --- Physics (units are pixels / frame at 60fps) -----------------------------
export const PHYS = {
  GRAVITY: 0.62,
  MAX_FALL: 17,
  FAST_FALL_MULT: 1.7,
  GROUND_FRICTION: 0.78,
  AIR_FRICTION: 0.94,
  RUN_ACCEL: 1.1,
  AIR_ACCEL: 0.7,
  MAX_RUN: 5.4,
  MAX_AIR: 5.6,
  JUMP_VELOCITY: -13.2,
  DOUBLE_JUMP_VELOCITY: -12.0,
  MAX_JUMPS: 2,
};

// --- Stocks / KO -------------------------------------------------------------
export const RULES = {
  DEFAULT_STOCKS: 3,
  RESPAWN_INVINCIBILITY: 110, // frames
  RESPAWN_DROP_Y: -40,
};

// Blast zones: a fighter past these (relative to the camera world) is KO'd.
export const BLAST = {
  LEFT: -120,
  RIGHT: GAME.WIDTH + 120,
  TOP: -200,
  BOTTOM: GAME.HEIGHT + 180,
};

// --- The stage ---------------------------------------------------------------
// platforms: {x, y, w, passable}. y is the TOP surface fighters stand on.
export const STAGE = {
  name: 'SUNNY PARK',
  bg: ['#67B8EB', '#B9E4FB', '#E0F4FF'],
  platforms: [
    { x: 170, y: 410, w: 620, h: 220, passable: false }, // main ground
    { x: 250, y: 300, w: 160, h: 14, passable: true },   // left float
    { x: 550, y: 300, w: 160, h: 14, passable: true },   // right float
    { x: 410, y: 210, w: 140, h: 14, passable: true },   // top float
  ],
  // spawn points (x) on the main platform
  spawns: [
    { x: 320, y: 360 },
    { x: 620, y: 360 },
    { x: 460, y: 360 },
    { x: 480, y: 150 },
  ],
};

// ============================================================================
//  ATTACK DEFINITIONS
//  Timings are in frames. angle is the knockback launch angle in degrees,
//  where 0 = straight right, -90 = straight up. reach = horizontal hitbox
//  offset from the fighter's front edge.
// ============================================================================
export const ATTACKS = {
  jab: {
    name: 'jab', startup: 4, active: 4, recovery: 8,
    damage: 4, baseKB: 3.2, kbScaling: 0.05, angle: -18,
    hbw: 38, hbh: 30, reach: 2, hitlag: 5,
  },
  side: { // forward smash
    name: 'side', startup: 11, active: 5, recovery: 22,
    damage: 13, baseKB: 7.5, kbScaling: 0.11, angle: -28,
    hbw: 56, hbh: 40, reach: 6, hitlag: 9,
  },
  up: { // up smash / launcher
    name: 'up', startup: 9, active: 5, recovery: 20,
    damage: 11, baseKB: 7.0, kbScaling: 0.115, angle: -82,
    hbw: 50, hbh: 56, reach: -8, hitlag: 8,
  },
  down: { // sweep
    name: 'down', startup: 8, active: 6, recovery: 16,
    damage: 8, baseKB: 5.0, kbScaling: 0.07, angle: -10,
    hbw: 60, hbh: 26, reach: 4, hitlag: 7,
  },
  air: { // generic aerial
    name: 'air', startup: 5, active: 6, recovery: 10,
    damage: 7, baseKB: 4.5, kbScaling: 0.075, angle: -40,
    hbw: 48, hbh: 44, reach: 0, hitlag: 6,
  },
};

// ============================================================================
//  CHARACTER ROSTER  (meme-themed placeholders)
//  Visuals are drawn procedurally from `palette` (see fighter.js drawPlaceholder).
//  To use real art later: drop a sprite sheet in assets/sprites/<id>.png and
//  set `sprite: 'assets/sprites/<id>.png'` — the renderer will prefer it.
// ============================================================================
function mk(o) {
  const c = Object.assign({
    weight: 100,     // higher = takes less knockback, falls a bit harder
    speedMult: 1,    // run/air speed multiplier
    jumpMult: 1,     // jump strength multiplier
    dmgMult: 1,      // damage dealt multiplier
    special: 'projectile', // 'projectile' | 'dash'
    sprite: null,
    isStoreItem: false, // if true, must be purchased
    price: 0,           // price in SOL
  }, o);
  if (c.sprite && typeof Image !== 'undefined') {
    c.img = new Image();
    c.img.crossOrigin = 'anonymous';
    c.img.src = c.sprite;
  }
  return c;
}

// SPRITE_FRAMES are now in frames.js
export const CHARACTERS = [
  mk({
    id: 'punch', name: 'PUNCH',
    palette: { body: '#e8b558', accent: '#c9933b', eye: '#2b2b2b', trim: '#fff3d6' },
    weight: 105, speedMult: 1.0, jumpMult: 1.0, dmgMult: 1.0, special: 'dash',
    sprite: '/assets/punch-sprite.webp',
    blurb: 'Such balance. Very fighter.',
  }),
  mk({
    id: 'wojak', name: 'WOJAK',
    palette: { body: '#dfe6ec', accent: '#b8c2cc', eye: '#2b2b2b', trim: '#9aa7b3' },
    weight: 100, speedMult: 1.0, jumpMult: 1.04, dmgMult: 1.0, special: 'projectile',
    sprite: '/assets/Wojak-sprite.webp',
    blurb: 'Just wants to fight.',
  }),
  mk({
    id: 'shiba', name: 'SHIBA',
    palette: { body: '#f0913a', accent: '#cf7322', eye: '#2b2b2b', trim: '#ffe0b8' },
    weight: 90, speedMult: 1.18, jumpMult: 1.1, dmgMult: 0.94, special: 'dash',
    sprite: '/assets/Shiba-sprite.webp',
    blurb: 'Quick lil floof.',
  }),
  mk({
    id: 'troll', name: 'TROLL',
    palette: { body: '#f2f2f2', accent: '#cfcfcf', eye: '#1a1a1a', trim: '#1a1a1a' },
    weight: 96, speedMult: 1.05, jumpMult: 1.0, dmgMult: 0.96, special: 'projectile',
    sprite: '/assets/Troll-sprite.webp',
    blurb: 'Problem?',
  }),
  mk({
    id: 'whale', name: 'WHALE',
    palette: { body: '#ffffff', accent: '#bce4f5', eye: '#0b1626', trim: '#6fd2f5' },
    weight: 112, speedMult: 0.95, jumpMult: 1.0, dmgMult: 1.18, special: 'projectile',
    sprite: '/assets/whitewhale-sprite.webp',
    blurb: 'Number go up.',
  }),
  mk({
    id: 'alon', name: 'ALON',
    palette: { body: '#ffffff', accent: '#cccccc', eye: '#111111', trim: '#999999' },
    weight: 90, speedMult: 1.15, jumpMult: 1.1, dmgMult: 0.95, special: 'projectile',
    sprite: '/assets/Alon-sprite.webp',
    blurb: 'Fast and versatile combatant.',
  }),
  mk({
    id: 'gake', name: 'GAKE',
    palette: { body: '#7395bd', accent: '#465582', eye: '#ffffff', trim: '#282b3a' },
    weight: 128, speedMult: 0.86, jumpMult: 0.92, dmgMult: 1.28, special: 'dash',
    sprite: '/assets/Gake-sprite.webp',
    spriteRatioX: 1824/776, spriteRatioY: 2350/1000,
    spriteScale: 0.66,
    blurb: 'Raw strength.',
  }),
  mk({
    id: 'dogwif', name: 'DOGWIF',
    palette: { body: '#f0c495', accent: '#db9d5e', eye: '#111111', trim: '#fca5a5' },
    weight: 95, speedMult: 1.1, jumpMult: 1.05, dmgMult: 0.95, special: 'projectile',
    sprite: '/assets/Dog-wif-sprite.webp',
    spriteRatioX: 2048/1000, spriteRatioY: 2048/1000,
    spriteScale: 0.60,
    blurb: 'Has a hat.',
  }),
  mk({
    id: 'jotchua', name: 'JOTCHUA',
    palette: { body: '#eab308', accent: '#ca8a04', eye: '#111111', trim: '#fef08a' },
    weight: 110, speedMult: 0.9, jumpMult: 0.95, dmgMult: 1.15, special: 'projectile',
    sprite: '/assets/Jotchua.webp',
    spriteRatioX: 2048/1000, spriteRatioY: 2048/1000,
    spriteScale: 0.60,
    isStoreItem: true, price: 0.05,
    blurb: 'Very polite.',
  }),
  mk({
    id: 'gigachad', name: 'GIGACHAD',
    palette: { body: '#cfa78f', accent: '#7a5441', eye: '#ffffff', trim: '#222222' },
    weight: 150, speedMult: 0.85, jumpMult: 0.85, dmgMult: 1.4, special: 'dash',
    sprite: '/assets/Gigachad-sprite.webp',
    spriteRatioX: 2148/776, spriteRatioY: 1952/1000,
    spriteScale: 0.66,
    blurb: 'Can you feel my heart?',
  }),
  mk({
    id: 'pumpfun', name: 'PUMPFUN',
    palette: { body: '#33cc33', accent: '#22aa22', eye: '#ffffff', trim: '#111111' },
    weight: 100, speedMult: 1.0, jumpMult: 1.0, dmgMult: 1.0, special: 'projectile',
    sprite: '/assets/PumpFun.webp',
    isStoreItem: true, price: 0.1,
    blurb: 'Ready to pump it up!',
  }),
  mk({
    id: 'pudgy', name: 'PUDGY',
    palette: { body: '#ffffff', accent: '#0066cc', eye: '#000000', trim: '#888888' },
    weight: 120, speedMult: 0.9, jumpMult: 0.9, dmgMult: 1.2, special: 'dash',
    sprite: '/assets/Pudgy-sprite.webp',
    spriteScale: 0.35,
    isStoreItem: true, price: 0.15,
    blurb: 'Penguin power!',
  }),
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

// --- Control schemes ---------------------------------------------------------
// Codes use KeyboardEvent.code so layout is consistent.
export const CONTROLS = {
  p1: {
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    light: 'KeyX', heavy: 'KeyC', special: 'KeyZ', shield: 'KeyV',
  },
  p2: {
    left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
    light: 'KeyJ', heavy: 'KeyK', special: 'KeyL', shield: 'KeyI',
  },
};
