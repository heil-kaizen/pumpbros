// ============================================================================
//  Fighter — the core combatant. Controller-agnostic: update() consumes an
//  `intent` object (produced by a human input map or the AI), so the same
//  code drives players and CPUs.
//
//  intent = { moveX:-1|0|1, up:bool, down:bool, jump:bool(edge),
//             light:bool(edge), heavy:bool(edge), special:bool(edge),
//             shield:bool(held) }
// ============================================================================
import { PHYS, ATTACKS, RULES, BLAST, GAME } from './config.js';
import { SPRITE_FRAMES } from './frames.js';

// extra attack defs not in the shared table
const DASH = { name: 'dash', startup: 3, active: 11, recovery: 16, damage: 9, baseKB: 6.0, kbScaling: 0.095, angle: -34, hbw: 46, hbh: 44, reach: 6, hitlag: 8 };

function aerialHeavy(base) {
  return { ...base, name: 'airheavy', damage: base.damage * 1.5, baseKB: base.baseKB * 1.35, kbScaling: base.kbScaling * 1.2, recovery: base.recovery + 6 };
}

export class Projectile {
  constructor(owner, x, y, dir) {
    this.owner = owner;
    this.x = x; this.y = y;
    this.vx = dir * 8.5;
    this.vy = 0;
    this.w = 16; this.h = 12;
    this.life = 70;
    this.dead = false;
    this.color = owner.char.palette.trim;
    this.damage = 6 * owner.char.dmgMult;
    this.baseKB = 4.5; this.kbScaling = 0.06; this.angle = -22;
    this.dir = dir;
  }
  update(world) {
    this.x += this.vx; this.y += this.vy;
    this.life--;
    world.particles.trail(this.x, this.y, this.color);
    if (this.life <= 0 || this.x < BLAST.LEFT || this.x > BLAST.RIGHT) { this.dead = true; return; }
    for (const f of world.fighters) {
      if (f === this.owner || f.dead || f.invincible > 0) continue;
      if (this.x < f.x + f.w && this.x + this.w > f.x && this.y < f.y + f.h && this.y + this.h > f.y) {
        f.takeHit(this, this.dir, world, this.x + this.w / 2, this.y + this.h / 2);
        this.dead = true;
        return;
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.w, this.h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(this.x + (this.dir > 0 ? this.w - 4 : 0)), Math.round(this.y + 4), 4, 4);
  }
}

export class Fighter {
  constructor(char, playerIndex, spawn, stocks, color) {
    this.char = char;
    this.playerIndex = playerIndex;
    this.accentColor = color; // player-tint ring color (P1/P2/CPU)
    this.w = 34; this.h = 46;
    this.x = spawn.x; this.y = spawn.y;
    this.vx = 0; this.vy = 0;
    this.facing = playerIndex % 2 === 0 ? 1 : -1;
    this.damage = 0;
    this.stocks = stocks;
    this.onGround = false;
    this.prevFeet = this.y + this.h;
    this.jumpsUsed = 0;
    this.attack = null;
    this.hitstun = 0;
    this.hitlag = 0;
    this.invincible = RULES.RESPAWN_INVINCIBILITY;
    this.dead = false;
    this.fastFalling = false;
    this.shieldHealth = 100;
    this.shielding = false;
    this.shieldBroken = 0;
    this.flash = 0;
    this.dropThrough = 0; // frames to ignore passable platforms
    this.anim = 0;        // walk-cycle timer
    this.respawnAnim = 0;

    if (this.char.sprite) {
      this.img = new Image();
      this.img.crossOrigin = 'anonymous';
      this.img.src = this.char.sprite;
      this.animFrame = 0;
      this.animTimer = 0;
    }
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // ---- combat: receive a hit from an attack def or projectile ---------------
  takeHit(def, attackerFacing, world, contactX, contactY) {
    if (this.invincible > 0 || this.dead) return;

    const heavy = (def.damage || 0) >= 11;

    // shield absorbs it
    if (this.shielding && this.shieldHealth > 0) {
      this.shieldHealth -= def.damage * 3.5 + 6;
      this.vx = attackerFacing * (1.5 + def.baseKB * 0.25);
      world.sfx.shield();
      world.particles.hitSpark(contactX, contactY, false);
      world.shake(3);
      if (this.shieldHealth <= 0) { this.shieldHealth = 0; this.shieldBroken = 120; this.shielding = false; this.hitstun = 70; this.vy = -6; }
      return;
    }

    this.damage += def.damage;
    let knock = (def.baseKB + this.damage * def.kbScaling) * (100 / this.char.weight);
    const rad = (def.angle * Math.PI) / 180;
    this.vx = Math.cos(rad) * knock * attackerFacing;
    this.vy = Math.sin(rad) * knock;
    this.hitstun = Math.max(12, Math.floor(knock * 2.4));
    this.hitlag = def.hitlag || 6;
    this.flash = this.hitlag + 2;
    this.attack = null;
    this.fastFalling = false;
    this.onGround = false;

    world.particles.hitSpark(contactX, contactY, heavy);
    
    // Spawn floating damage text
    const dmgText = Math.floor(def.damage).toString();
    const dmgColor = heavy ? '#ff4757' : '#ffa502';
    world.particles.spawnText(contactX, contactY - 20, dmgText, dmgColor);

    world.shake(heavy ? 9 : 5);
    heavy ? world.sfx.hitHeavy() : world.sfx.hitLight();
  }

  startAttack(def, world) {
    this.attack = { def, timer: 0, hit: new Set() };
    if (this.char.special && def.name === 'projectile') {
      // handled separately
    }
  }

  doSpecial(world) {
    const ch = this.char;
    // air specials also give a recovery boost
    if (!this.onGround && this.vy > -6) this.vy = -9.5;

    if (ch.special === 'projectile') {
      const px = this.facing > 0 ? this.x + this.w : this.x - 16;
      world.projectiles.push(new Projectile(this, px, this.y + 14, this.facing));
      world.sfx.shoot();
    } else { // dash
      this.vx = this.facing * 12;
      this.startAttack(DASH, world);
      world.sfx.jump();
    }
  }

  // ---- main per-frame update ------------------------------------------------
  update(intent, world) {
    if (this.dead) return;

    // hitlag = freeze frames (game-feel impact pause)
    if (this.hitlag > 0) { this.hitlag--; if (this.flash > 0) this.flash--; return; }
    if (this.invincible > 0) this.invincible--;
    if (this.flash > 0) this.flash--;
    if (this.shieldBroken > 0) this.shieldBroken--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.respawnAnim > 0) this.respawnAnim--;

    const controllable = this.hitstun <= 0;
    if (this.hitstun > 0) this.hitstun--;

    const attacking = this.attack && this.attack.timer < this.attack.def.startup + this.attack.def.active + this.attack.def.recovery;

    // -- shield (ground only, when not attacking) --
    this.shielding = false;
    if (controllable && !attacking && this.onGround && intent.shield && this.shieldBroken <= 0 && this.shieldHealth > 0) {
      this.shielding = true;
      this.shieldHealth = Math.max(0, this.shieldHealth - 0.55);
      if (this.shieldHealth <= 0) { this.shieldBroken = 120; this.shielding = false; }
    } else if (this.shieldHealth < 100) {
      this.shieldHealth = Math.min(100, this.shieldHealth + 0.3);
    }

    // -- horizontal movement --
    const maxSpd = (this.onGround ? PHYS.MAX_RUN : PHYS.MAX_AIR) * this.char.speedMult;
    const accel = this.onGround ? PHYS.RUN_ACCEL : PHYS.AIR_ACCEL;
    if (controllable && !this.shielding && intent.moveX !== 0 && !(attacking && this.onGround)) {
      this.vx += intent.moveX * accel;
      if (this.vx > maxSpd) this.vx = maxSpd;
      if (this.vx < -maxSpd) this.vx = -maxSpd;
      if (!attacking) this.facing = intent.moveX > 0 ? 1 : -1;
      if (this.onGround) this.anim += Math.abs(this.vx) * 0.12;
    } else {
      this.vx *= this.onGround ? PHYS.GROUND_FRICTION : PHYS.AIR_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }

    // -- jump --
    if (controllable && !this.shielding && intent.jump) {
      if (this.onGround) {
        this.vy = PHYS.JUMP_VELOCITY * this.char.jumpMult;
        this.jumpsUsed = 1; this.onGround = false; this.fastFalling = false;
        world.sfx.jump(); world.particles.dust(this.cx, this.y + this.h);
      } else if (this.jumpsUsed < PHYS.MAX_JUMPS) {
        this.vy = PHYS.DOUBLE_JUMP_VELOCITY * this.char.jumpMult;
        this.jumpsUsed++; this.fastFalling = false;
        world.sfx.jump(); world.particles.dust(this.cx, this.cy);
      }
    }

    // -- drop through passable platform (only when standing on one) --
    if (controllable && intent.dropTap && this.onGround) {
      const onPassable = world.platforms.some(
        (p) => p.passable && this.x + this.w > p.x + 4 && this.x < p.x + p.w - 4 && Math.abs((this.y + this.h) - p.y) < 4
      );
      if (onPassable) { this.dropThrough = 10; this.onGround = false; this.y += 3; }
    }

    // -- fast fall --
    if (controllable && intent.down && !this.onGround && this.vy > 0) this.fastFalling = true;

    // -- attacks --
    if (controllable && !this.shielding && !attacking) {
      if (intent.light) {
        this.startAttack(this.onGround ? ATTACKS.jab : ATTACKS.air, world);
      } else if (intent.heavy) {
        if (this.onGround) {
          this.startAttack(intent.up ? ATTACKS.up : intent.down ? ATTACKS.down : ATTACKS.side, world);
        } else {
          this.startAttack(aerialHeavy(ATTACKS.air), world);
        }
      } else if (intent.special) {
        this.doSpecial(world);
      }
    }

    // -- gravity --
    if (!this.onGround) {
      let g = PHYS.GRAVITY;
      if (this.fastFalling) g *= PHYS.FAST_FALL_MULT;
      this.vy += g;
      const maxFall = PHYS.MAX_FALL * (this.fastFalling ? PHYS.FAST_FALL_MULT : 1);
      if (this.vy > maxFall) this.vy = maxFall;
    }

    // -- integrate --
    const wasAir = !this.onGround;
    this.x += this.vx;
    this.y += this.vy;

    // -- platform collision (one-way top surfaces) --
    this.resolvePlatforms(world, wasAir);
    this.prevFeet = this.y + this.h;

    // -- attack progression + hit detection --
    if (this.attack) this.updateAttack(world);

    // -- blast zone / KO --
    if (this.cx < BLAST.LEFT || this.cx > BLAST.RIGHT || this.cy < BLAST.TOP || this.cy > BLAST.BOTTOM) {
      this.die(world);
    }
  }

  resolvePlatforms(world, wasAir) {
    const feet = this.y + this.h;
    const prevFeet = this.prevFeet;
    let landed = false;
    if (this.vy >= 0) {
      for (const p of world.platforms) {
        const overlapX = this.x + this.w > p.x + 4 && this.x < p.x + p.w - 4;
        if (!overlapX) continue;
        if (p.passable && this.dropThrough > 0) continue;
        // crossed the top surface this frame
        if (prevFeet <= p.y + 6 && feet >= p.y && feet <= p.y + (p.passable ? 18 : p.h)) {
          this.y = p.y - this.h;
          this.vy = 0;
          if (!this.onGround) {
            this.onGround = true;
            this.jumpsUsed = 0;
            this.fastFalling = false;
            if (wasAir) world.particles.dust(this.cx, this.y + this.h);
          }
          landed = true;
          break;
        }
      }
    }
    if (!landed) {
      // still grounded? check we're resting on a platform
      let resting = false;
      for (const p of world.platforms) {
        const overlapX = this.x + this.w > p.x + 4 && this.x < p.x + p.w - 4;
        if (overlapX && Math.abs((this.y + this.h) - p.y) < 2 && !(p.passable && this.dropThrough > 0)) { resting = true; break; }
      }
      if (!resting) this.onGround = false;
    }
  }

  updateAttack(world) {
    const a = this.attack;
    const d = a.def;
    a.timer++;
    const total = d.startup + d.active + d.recovery;
    const active = a.timer > d.startup && a.timer <= d.startup + d.active;
    if (active) {
      const hb = this.hitbox(d);
      for (const f of world.fighters) {
        if (f === this || f.dead || a.hit.has(f) || f.invincible > 0) continue;
        if (hb.x < f.x + f.w && hb.x + hb.w > f.x && hb.y < f.y + f.h && hb.y + hb.h > f.y) {
          a.hit.add(f);
          const cxv = Math.max(hb.x, Math.min(f.cx, hb.x + hb.w));
          const cyv = Math.max(hb.y, Math.min(f.cy, hb.y + hb.h));
          // scale damage by attacker power
          const scaled = { ...d, damage: d.damage * this.char.dmgMult };
          f.takeHit(scaled, this.facing, world, cxv, cyv);
          this.hitlag = d.hitlag || 6; // attacker also freezes
        }
      }
    }
    if (a.timer >= total) this.attack = null;
  }

  hitbox(d) {
    const front = this.facing > 0 ? this.x + this.w + d.reach : this.x - d.hbw - d.reach;
    let y = this.cy - d.hbh / 2;
    if (d.name === 'up') y = this.y - d.hbh + 8;
    if (d.name === 'down') y = this.y + this.h - d.hbh + 6;
    return { x: front, y, w: d.hbw, h: d.hbh };
  }

  die(world) {
    this.stocks--;
    world.particles.koBurst(this.cx, Math.max(40, Math.min(this.cy, GAME.HEIGHT - 40)), this.char.palette.body);
    world.sfx.ko();
    world.shake(16);
    if (this.stocks <= 0) {
      this.dead = true;
      return;
    }
    // respawn
    this.x = GAME.WIDTH / 2 - this.w / 2;
    this.y = RULES.RESPAWN_DROP_Y;
    this.vx = 0; this.vy = 0;
    this.damage = 0;
    this.hitstun = 0; this.hitlag = 0;
    this.attack = null;
    this.invincible = RULES.RESPAWN_INVINCIBILITY;
    this.onGround = false;
    this.jumpsUsed = 0;
    this.shieldHealth = 100;
    this.respawnAnim = 60;
    this.facing = this.cx < GAME.WIDTH / 2 ? 1 : -1;
  }

  // ---- rendering ------------------------------------------------------------
  draw(ctx) {
    if (this.dead) return;
    const blink = this.invincible > 0 && Math.floor(this.invincible / 4) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.35;

    const px = Math.round(this.x);
    const py = Math.round(this.y);
    
    if (this.img && this.img.complete && this.img.width > 0) {
      this.drawSprite(ctx, px, py);
    } else {
      this.drawPlaceholder(ctx, px, py);
    }

    // attack arm / swoosh
    if (this.attack) {
      const d = this.attack.def;
      const active = this.attack.timer > d.startup && this.attack.timer <= d.startup + d.active;
      if (active) {
        const hb = this.hitbox(d);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(Math.round(hb.x), Math.round(hb.y), hb.w, hb.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(hb.x) + 0.5, Math.round(hb.y) + 0.5, hb.w, hb.h);
      }
    }

    // shield bubble
    if (this.shielding) {
      const r = 22 + (this.shieldHealth / 100) * 12;
      ctx.fillStyle = `rgba(120,200,255,${0.18 + 0.18 * (this.shieldHealth / 100)})`;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPlaceholder(ctx, px, py) {
    const p = this.char.palette;
    const w = this.w, h = this.h;
    const f = this.facing;

    // damage tint: redder & brighter as % rises
    const dmgT = Math.min(1, this.damage / 150);

    // player accent ring under feet
    ctx.fillStyle = this.accentColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(px - 2, py + h - 2, w + 4, 4);
    ctx.globalAlpha = blendAlpha(this);

    // body
    const flashing = this.flash > 0;
    ctx.fillStyle = flashing ? '#ffffff' : p.body;
    ctx.fillRect(px, py + 8, w, h - 8);
    // head
    ctx.fillRect(px + 4, py, w - 8, 12);
    // shade
    if (!flashing) {
      ctx.fillStyle = mix(p.accent, '#ff4d4d', dmgT * 0.6);
      ctx.fillRect(px, py + 8, 6, h - 8);
      ctx.fillRect(px + w - 6, py + 8, 6, h - 8);
    }
    // trim band
    ctx.fillStyle = flashing ? '#ffffff' : p.trim;
    ctx.fillRect(px + 4, py + Math.floor(h * 0.55), w - 8, 5);

    // eyes (face direction)
    if (!flashing) {
      ctx.fillStyle = p.eye;
      const eyeY = py + 4;
      if (f > 0) {
        ctx.fillRect(px + w - 14, eyeY, 4, 5);
        ctx.fillRect(px + w - 8, eyeY, 4, 5);
      } else {
        ctx.fillRect(px + 4, eyeY, 4, 5);
        ctx.fillRect(px + 10, eyeY, 4, 5);
      }
      // little angry brow when attacking
      if (this.attack) {
        ctx.fillStyle = '#000';
        ctx.fillRect(px + (f > 0 ? w - 14 : 4), eyeY - 2, 10, 2);
      }
    }

    // arms — extend toward facing while attacking
    if (!flashing) {
      ctx.fillStyle = p.accent;
      const armY = py + 18;
      if (this.attack && this.attack.timer > this.attack.def.startup) {
        const reach = 10;
        ctx.fillRect(f > 0 ? px + w : px - reach, armY, reach, 6);
      } else {
        ctx.fillRect(f > 0 ? px + w - 2 : px - 4, armY, 6, 8);
      }
    }

    // legs (simple walk cycle)
    ctx.fillStyle = flashing ? '#ffffff' : mix(p.body, '#000', 0.25);
    const step = this.onGround && Math.abs(this.vx) > 0.4 ? Math.sin(this.anim) * 3 : 0;
    ctx.fillRect(px + 6, py + h - 6, 7, 6 + step);
    ctx.fillRect(px + w - 13, py + h - 6, 7, 6 - step);
  }

  drawSprite(ctx, px, py) {
    this.animTimer++;
    
    const framesData = SPRITE_FRAMES[this.char.id];
    if (!framesData) return; // shouldn't happen, but just in case
    
    let row = 0;
    let speed = 8;
    let framesCount = framesData[0].length;

    if (this.dead || this.respawnAnim > 0) {
      row = framesData.length === 9 ? 8 : 9; speed = 12;
    } else if (this.hitstun > 0 || this.flash > 0) {
      row = 7; speed = 6;
    } else if (this.shielding || this.shieldBroken > 0) {
      row = 6; speed = 10;
    } else if (this.attack) {
      speed = 5;
      if (this.attack.def.name === 'projectile') {
        row = 5;
      } else if (this.attack.def.name === 'side' || this.attack.def.name === 'airheavy') {
        row = 4;
      } else {
        row = 3;
      }
      framesCount = framesData[row].length;
      // sync animation with attack timer
      const a = this.attack;
      const total = a.def.startup + a.def.active + a.def.recovery;
      this.animFrame = Math.min(framesCount - 1, Math.floor((a.timer / total) * framesCount));
    } else if (!this.onGround) {
      row = 2; speed = 4;
    } else if (Math.abs(this.vx) > 0.5) {
      if (Math.abs(this.vx) > 3) {
        row = 2; speed = 4;
      } else {
        row = 1; speed = 6;
      }
    }

    // Default bounds check
    if (!framesData[row] || framesData[row].length === 0) {
        row = 0;
    }
    framesCount = framesData[row].length;

    if (!this.attack) { // Auto-loop for non-attacks
      if (this.animTimer >= speed) {
        this.animTimer = 0;
        this.animFrame = (this.animFrame + 1) % framesCount;
      }
    }

    if (!this.img || this.img.width === 0) return;

    // Safety clamp for frame
    if (this.animFrame >= framesCount) this.animFrame = 0;

    const frameRect = framesData[row][this.animFrame];

    // Per-character sprite coordinate mapping
    // Characters with spriteRatioX/Y have frames in a scaled-down coordinate space;
    // multiply by ratios to get actual sprite sheet pixel coords.
    // Characters without these fields have frames already in pixel coords (ratio=1).
    const ratioX = this.char.spriteRatioX || 1;
    const ratioY = this.char.spriteRatioY || 1;
    const charScale = this.char.spriteScale || 0.30;

    const sx = frameRect.x * ratioX;
    const sy = frameRect.y * ratioY;
    const sw = frameRect.w * ratioX;
    let sh = frameRect.h * ratioY;

    // Fix sprite bounding box bleed by clamping height against overlapping lower rows
    // (only needed for auto-generated frames without spriteRatio)
    if (!this.char.spriteRatioX) {
      let maxBottom = sy + sh;
      for (let r = row + 1; r < framesData.length; r++) {
        for (const otherF of framesData[r]) {
          const otherSx = otherF.x * ratioX;
          const otherSw = otherF.w * ratioX;
          const otherSy = otherF.y * ratioY;
          if (sx < otherSx + otherSw && sx + sw > otherSx) { // Horizontal overlap
            if (sy < otherSy) {
              maxBottom = Math.min(maxBottom, otherSy);
            }
          }
        }
      }
      if (sy + sh > maxBottom) {
        sh = maxBottom - sy;
      }
    }

    // Destination size on screen
    const destW = frameRect.w * charScale;
    const destH = (sh / ratioY) * charScale;  // use clamped sh mapped back to frame space

    ctx.save();
    
    // damage blinking
    const flashing = this.flash > 0;
    if (flashing) ctx.globalCompositeOperation = 'source-atop';

    // player accent ring under feet
    ctx.fillStyle = this.accentColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(px - 2, py + this.h - 2, this.w + 4, 4);
    ctx.globalAlpha = blendAlpha(this);

    // Anchor: use ox/oy if present (auto-generated), otherwise center-bottom (hand-tuned)
    const ox = (frameRect.ox !== undefined ? frameRect.ox : frameRect.w / 2) * charScale;
    const oy = (frameRect.oy !== undefined ? frameRect.oy : frameRect.h) * charScale;

    // To align properly, we draw upwards from the feet.
    const bottomY = this.h;
    
    // We want the character's logical body center (w/2) to line up with the sprite's root X origin (ox).
    // The sprite's root Y origin (oy) lines up with the bottom of the feet (bottomY + 6 padding for shadows).
    
    if (this.facing < 0) {
      ctx.translate(px + this.w / 2, py + bottomY + 6);
      ctx.scale(-1, 1);
      ctx.drawImage(this.img, sx, sy, sw, sh, -ox, -oy, destW, destH);
    } else {
      ctx.translate(px + this.w / 2, py + bottomY + 6);
      ctx.drawImage(this.img, sx, sy, sw, sh, -ox, -oy, destW, destH);
    }
    ctx.restore();
  }
}

function blendAlpha(f) { return f.invincible > 0 && Math.floor(f.invincible / 4) % 2 === 0 ? 0.35 : 1; }

// hex color mixing helper
function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hex(c) {
  if (c.startsWith('rgb')) { const m = c.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
