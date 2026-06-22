// ============================================================================
//  Particles — lightweight hit sparks, dust, KO bursts. Pure visual.
// ============================================================================

export class Particles {
  constructor() { this.list = []; }

  spawn(x, y, opts = {}) {
    const {
      count = 8, color = '#fff', speed = 4, life = 24,
      size = 3, gravity = 0.15, spread = Math.PI * 2, dir = 0,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, maxLife: life,
        size: size * (0.6 + Math.random() * 0.8),
        color, gravity,
      });
    }
  }

  hitSpark(x, y, heavy = false) {
    this.spawn(x, y, {
      count: heavy ? 16 : 9,
      color: heavy ? '#ffd23f' : '#fff7c2',
      speed: heavy ? 7 : 4.5,
      life: heavy ? 26 : 18,
      size: heavy ? 4 : 3,
      gravity: 0.05,
    });
    this.spawn(x, y, { count: heavy ? 8 : 4, color: '#ff5d5d', speed: heavy ? 5 : 3, life: 16, size: 3, gravity: 0.05 });
  }

  dust(x, y) {
    this.spawn(x, y, { count: 6, color: '#cfcfe8', speed: 2, life: 16, size: 2.5, gravity: -0.02, spread: Math.PI, dir: -Math.PI / 2 });
  }

  koBurst(x, y, color = '#ffd23f') {
    this.spawn(x, y, { count: 40, color, speed: 11, life: 40, size: 5, gravity: 0.08 });
    this.spawn(x, y, { count: 24, color: '#ffffff', speed: 7, life: 30, size: 4, gravity: 0.05 });
  }

  trail(x, y, color) {
    this.list.push({ x, y, vx: 0, vy: 0, life: 12, maxLife: 12, size: 4, color, gravity: 0 });
  }

  spawnText(x, y, txt, color = '#ff4757') {
    this.list.push({
      x, y, txt,
      vx: (Math.random() - 0.5) * 2,
      vy: -4 - Math.random() * 2,
      life: 40, maxLife: 40,
      size: 16 + Math.random() * 4,
      color,
      gravity: 0.15,
      isText: true
    });
  }

  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.gravity;
      p.life--;
      if (p.life <= 0) this.list.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      if (p.isText) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 10)); // fade out fast at the end
        ctx.fillStyle = p.color;
        ctx.font = `bold ${Math.round(p.size)}px monospace`;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(p.txt, Math.round(p.x), Math.round(p.y));
        ctx.fillText(p.txt, Math.round(p.x), Math.round(p.y));
      } else {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        const s = p.size;
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s));
      }
    }
    ctx.globalAlpha = 1;
  }
}
