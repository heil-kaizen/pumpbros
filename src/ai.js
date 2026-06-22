// ============================================================================
//  AI — produces an `intent` for a CPU fighter. Behaviour: approach nearest
//  opponent, attack in range, recover when knocked off-stage, occasionally
//  jump/shield/special. `level` (0..1) scales reaction & aggression.
// ============================================================================
import { GAME, STAGE } from './config.js';

export class AIController {
  constructor(fighter, level = 0.7) {
    this.f = fighter;
    this.level = level;
    this.cooldown = 0;
    this.jumpTimer = 0;
    this.decisionTimer = 0;
    this.wantAttack = null;
  }

  // returns intent object for fighter.update()
  think(world) {
    const f = this.f;
    const intent = blank();
    if (f.dead) return intent;

    const target = this.nearest(world);
    if (!target) return intent;

    const dx = target.cx - f.cx;
    const dy = target.cy - f.cy;
    const adx = Math.abs(dx);

    // -- recovery: if off the main stage, prioritise getting back --
    const ground = STAGE.platforms[0];
    const offStage = f.cx < ground.x - 10 || f.cx > ground.x + ground.w + 10;
    const below = f.cy > ground.y + 30;
    if ((offStage || below) && !f.onGround) {
      const center = GAME.WIDTH / 2;
      intent.moveX = f.cx < center ? 1 : -1;
      // jump / special to recover
      if (f.vy > 1 || f.cy > ground.y) {
        if (this.jumpTimer <= 0) { intent.jump = true; this.jumpTimer = 18; }
        if (f.cy > ground.y + 60 && Math.random() < 0.3) intent.special = true;
      }
      this.tickTimers();
      return intent;
    }

    // -- approach --
    const desiredGap = 34;
    if (adx > desiredGap) {
      intent.moveX = dx > 0 ? 1 : -1;
    } else {
      // in range — maybe back off a touch sometimes
      if (Math.random() < 0.02) intent.moveX = dx > 0 ? -1 : 1;
    }
    f.facing; // face handled by movement; ensure facing target when attacking
    if (adx <= desiredGap) {
      // face the target even if not moving
      intent.moveX = intent.moveX || (dx > 0 ? 0.0001 : -0.0001);
    }

    // jump if target is clearly above, or to platform
    if (dy < -55 && f.onGround && this.jumpTimer <= 0 && Math.random() < 0.06 * (0.5 + this.level)) {
      intent.jump = true; this.jumpTimer = 30;
    }

    // -- attack decision --
    if (this.cooldown <= 0 && adx < 52 && Math.abs(dy) < 50) {
      const r = Math.random();
      if (r < 0.45) intent.heavy = true;        // smash
      else if (r < 0.8) intent.light = true;     // jab
      else { intent.special = true; }            // mix-up
      if (dy < -25) intent.up = true;
      else if (dy > 25) intent.down = true;
      this.cooldown = Math.floor(22 - this.level * 10 + Math.random() * 14);
    } else if (this.cooldown <= 0 && adx < 240 && adx > 70 && Math.random() < 0.02 + this.level * 0.03) {
      // ranged poke
      intent.special = true;
      this.cooldown = 40;
    }

    // -- shield if opponent is attacking nearby --
    if (target.attack && adx < 64 && f.onGround && Math.random() < 0.04 + this.level * 0.06) {
      intent.shield = true;
      intent.light = intent.heavy = intent.special = false;
    }

    this.tickTimers();
    return intent;
  }

  tickTimers() {
    if (this.cooldown > 0) this.cooldown--;
    if (this.jumpTimer > 0) this.jumpTimer--;
  }

  nearest(world) {
    let best = null, bd = Infinity;
    for (const o of world.fighters) {
      if (o === this.f || o.dead) continue;
      const d = Math.abs(o.cx - this.f.cx) + Math.abs(o.cy - this.f.cy) * 0.6;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
}

function blank() {
  return { moveX: 0, up: false, down: false, jump: false, light: false, heavy: false, special: false, shield: false, dropTap: false };
}
