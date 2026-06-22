// ============================================================================
//  Stage — video background
// ============================================================================
import { STAGE, GAME } from './config.js';

export class Stage {
  constructor() {
    this.t = 0;

    this.video = document.createElement('video');
    this.video.src = 'https://cdn.jsdelivr.net/gh/heil-kaizen/assets-for-smashfun@main/assets/chara%20assets%20sprite%20sheets/grok-video-ef5fe0a6-50e6-4770-8854-d5a3a83ce103%20(1).webm';
    this.video.loop = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.crossOrigin = 'anonymous';
    this.video.play().catch(e => console.warn('Video autoplay failed:', e));
  }

  update() { this.t++; }

  drawBg(ctx) {
    if (this.video && this.video.readyState >= 2) {
      ctx.drawImage(this.video, 0, 0, GAME.WIDTH, GAME.HEIGHT);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    }
  }

  drawPlatforms(ctx) {
    for (let i = 0; i < STAGE.platforms.length; i++) {
      const p = STAGE.platforms[i];
      if (p.passable) {
        // floating grassy ledge on a wooden base
        ctx.fillStyle = '#8b5a2b';            // wood
        ctx.fillRect(p.x, p.y + 4, p.w, p.h - 2);
        ctx.fillStyle = '#5a3a1b';
        ctx.fillRect(p.x, p.y + p.h, p.w, 4);
        ctx.fillStyle = '#7cfc00';            // bright grass
        ctx.fillRect(p.x, p.y, p.w, 6);
        ctx.fillStyle = '#32cd32';
        ctx.fillRect(p.x, p.y, p.w, 2);
        this.grassBlades(ctx, p.x, p.y, p.w, '#32cd32');
      } else {
        // main ground
        ctx.fillStyle = '#8b6a4f';            // dirt body
        ctx.fillRect(p.x, p.y, p.w, p.h);
        // dirt speckles
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let gx = p.x + 10; gx < p.x + p.w; gx += 22) {
          for (let gy = p.y + 22; gy < p.y + p.h; gy += 20) {
            ctx.fillRect(gx + ((gy / 20) % 2) * 8, gy, 4, 4);
          }
        }
        // grass top
        ctx.fillStyle = '#7cfc00';
        ctx.fillRect(p.x, p.y, p.w, 12);
        ctx.fillStyle = '#32cd32';
        ctx.fillRect(p.x, p.y, p.w, 5);
        this.grassBlades(ctx, p.x, p.y, p.w, '#32cd32');
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(p.x, p.y + 12, p.w, 3);
      }
    }
  }

  grassBlades(ctx, x, y, w, color = '#7ad96a') {
    ctx.fillStyle = color;
    for (let gx = x + 6; gx < x + w - 4; gx += 14) {
      const sway = Math.sin(this.t * 0.06 + gx * 0.3) > 0 ? 1 : 0;
      ctx.fillRect(gx + sway, y - 3, 2, 3);
      ctx.fillRect(gx + 6 - sway, y - 2, 2, 2);
    }
  }
}
