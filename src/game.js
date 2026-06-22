// ============================================================================
//  Game — state machine (TITLE → SELECT → BATTLE → RESULT), HUD, menus, loop.
// ============================================================================
import { GAME, STAGE, RULES, CHARACTERS, CONTROLS, getCharacter } from './config.js';
import { SPRITE_FRAMES } from './frames.js';
import { input } from './input.js';
import { sfx } from './audio.js';
import { Particles } from './particles.js';
import { Stage } from './stage.js';
import { Fighter } from './fighter.js';
import { AIController } from './ai.js';
import { wallet } from './wallet.js';
import { showWalletModal, hideWalletModal, isModalOpen } from './walletUI.js';
import { network } from './network.js';

const PLAYER_COLORS = ['#4fd2ff', '#ff5d8f', '#ffd23f', '#6dff8f'];
const PLAYER_LABELS = ['P1', 'P2', 'CPU', 'CPU'];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.state = 'TITLE'; // TITLE, WAGER, STORE, SELECT, ESCROW, QUEUE, BATTLE, PAUSE, RESULT
    this.titleItems = ['1V1', 'ONLINE', 'STORE'];
    this.titleIndex = 0;
    this.t = 0;

    this.stage = new Stage();
    this.particles = new Particles();
    this.shakeAmt = 0;

    // select-screen state
    this.cursors = [];           // {idx, locked}
    this.selecting = 1;          // how many human pickers

    // matchmaking state
    this.wagerAmounts = ['0.01', '0.10', '0.25', '0.40', '0.50'];
    this.wagerIndex = 0;
    this.selectedWager = null;
    this.networkData = null;
    this.treasuryPublicKey = null;
    this.escrowTimer = 0;
    this.escrowStatus = ''; // WAITING, DEPOSITING, FAILED

    // battle state
    this.fighters = [];
    this.ais = [];
    this.projectiles = [];
    this.countdown = 0;
    this.winner = null;
    this.resultTimer = 0;
    this.stocks = 3;

    this.world = {
      platforms: STAGE.platforms,
      particles: this.particles,
      projectiles: this.projectiles,
      fighters: this.fighters,
      sfx,
      shake: (a) => { this.shakeAmt = Math.max(this.shakeAmt, a); },
    };

    this._raf = null;
    this._acc = 0;
    this._last = 0;
    window.gameInstance = this;
  }

  start() {
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const step = 1000 / GAME.FPS;
      this._acc += Math.min(now - this._last, 100);
      this._last = now;
      while (this._acc >= step) {
        this.update();
        input.update();
        this._acc -= step;
      }
      this.render();
    };
    this._raf = requestAnimationFrame(loop);
  }

  // ==========================================================================
  //  UPDATE
  // ==========================================================================
  update() {
    this.t++;

    const hud = document.getElementById('hud-container');
    if (hud) {
      hud.style.display = (this.state === 'TITLE' && !this.popup) ? 'flex' : 'none';
    }

    if (this.state !== 'PAUSE' && !this.popup) {
      this.stage.update();
      if (this.shakeAmt > 0) this.shakeAmt *= 0.85;
      this.particles.update();
    }

    if (this.popup) {
      if (input.wasPressed('Escape') || input.wasPressed('Enter') || input.wasPressed('Space') || input.pointerPressed) {
        this.popup = null;
        sfx.back();
      }
      return;
    }

    switch (this.state) {
      case 'TITLE': this.updateTitle(); break;
      case 'WAGER': this.updateWager(); break;
      case 'STORE': this.updateStore(); break;
      case 'SELECT': this.updateSelect(); break;
      case 'ESCROW': this.updateEscrow(); break;
      case 'QUEUE': this.updateQueue(); break;
      case 'BATTLE': this.updateBattle(); break;
      case 'PAUSE': this.updatePause(); break;
      case 'RESULT': this.updateResult(); break;
    }
  }

  updateTitle() {
    if (isModalOpen()) return;

    const c1 = CONTROLS.p1;
    if (input.wasPressed(c1.up) || input.wasPressed('ArrowUp')) { this.titleIndex = (this.titleIndex - 1 + this.titleItems.length) % this.titleItems.length; sfx.select(); }
    if (input.wasPressed(c1.down) || input.wasPressed('ArrowDown')) { this.titleIndex = (this.titleIndex + 1) % this.titleItems.length; sfx.select(); }
    
    if (input.pointerPressed) {
      const px = input.pointer.x, py = input.pointer.y;
      const optsY = [310, 370, 430];
      for (let i = 0; i < 3; i++) {
        if (Math.abs(py - optsY[i]) < 30 && Math.abs(px - (GAME.WIDTH / 2)) < 180) {
          this.titleIndex = i;
          this.attemptEnterNext();
          return;
        }
      }
    }

    if (input.wasPressed('Enter') || input.wasPressed('Space')) this.attemptEnterNext();
  }

  attemptEnterNext() {
    if (this.titleIndex === 0) { // LOCAL VS
      this.mode = 'LOCAL';
      this.state = 'SELECT';
      this.enterSelect();
    } else if (this.titleIndex === 1) { // ONLINE VS
      if (!wallet.authenticated) {
        if (!wallet.authenticating) showWalletModal();
        return;
      }
      this.mode = 'ONLINE';
      this.state = 'WAGER';
    } else if (this.titleIndex === 2) { // STORE
      this.state = 'STORE';
      this.storeIndex = 0;
      this.storeItems = CHARACTERS.filter(c => c.isStoreItem);
    }
    sfx.select();
  }

  updateWager() {
    if (input.wasPressed('Escape') || input.wasPressed(CONTROLS.p1.special)) {
      sfx.back();
      this.state = 'TITLE';
      return;
    }
    const c1 = CONTROLS.p1;
    if (input.wasPressed(c1.up) || input.wasPressed('ArrowUp')) { this.wagerIndex = (this.wagerIndex - 1 + this.wagerAmounts.length) % this.wagerAmounts.length; sfx.select(); }
    if (input.wasPressed(c1.down) || input.wasPressed('ArrowDown')) { this.wagerIndex = (this.wagerIndex + 1) % this.wagerAmounts.length; sfx.select(); }

    if (input.pointerPressed) {
      const px = input.pointer.x, py = input.pointer.y;
      const cx = GAME.WIDTH / 2, startY = 200;
      for (let i = 0; i < this.wagerAmounts.length; i++) {
        const y = startY + i * 45;
        if (Math.abs(py - y) < 22 && Math.abs(px - cx) < 100) {
          this.wagerIndex = i;
          sfx.start();
          this.selectedWager = this.wagerAmounts[this.wagerIndex];
          this.enterSelect();
          return;
        }
      }
    }

    if (input.wasPressed('Enter') || input.wasPressed('Space') || input.wasPressed(c1.light)) {
      sfx.start();
      this.selectedWager = this.wagerAmounts[this.wagerIndex];
      this.enterSelect();
    }
  }

  updateStore() {
    if (input.wasPressed('Escape')) { sfx.back(); this.state = 'TITLE'; return; }
    const c1 = CONTROLS.p1;
    if (input.wasPressed(c1.left)) { this.storeIndex = (this.storeIndex - 1 + this.storeItems.length) % this.storeItems.length; sfx.select(); }
    if (input.wasPressed(c1.right)) { this.storeIndex = (this.storeIndex + 1) % this.storeItems.length; sfx.select(); }
    if (input.pointerPressed) {
      const px = input.pointer.x, py = input.pointer.y;
      const cx = GAME.WIDTH / 2, cy = GAME.HEIGHT / 2, spacing = 180;
      const startX = cx - (this.storeItems.length * spacing) / 2 + spacing / 2;
      for (let i = 0; i < this.storeItems.length; i++) {
        const x = startX + i * spacing;
        // Check yellow buy button specifically
        if (px >= x - 75 && px <= x + 75 && py >= cy + 115 && py <= cy + 155) {
          this.storeIndex = i;
          this._attemptStorePurchase(this.storeItems[i]);
          break;
        }
        
        // Check character portrait just for selection
        if (px >= x - 60 && px <= x + 60 && py >= cy - 80 && py < cy + 115) {
          if (this.storeIndex !== i) {
            this.storeIndex = i;
            sfx.select();
          }
          break;
        }
      }
    }

    if (input.wasPressed(c1.light) || input.wasPressed('Enter')) {
      this._attemptStorePurchase(this.storeItems[this.storeIndex]);
    }
  }

  _attemptStorePurchase(item) {
    if (this.purchasing) return;
    this.purchasing = true;

    if (!network.ownedCharacters.includes(item.id)) {
      if (!wallet.authenticated) {
        showWalletModal();
        this.purchasing = false;
        return;
      }
      this.purchasing = true;
      wallet.purchaseCharacter(item.id, () => {
        this.popup = { title: 'VERIFYING', message: 'Waiting for blockchain confirmation...' };
      })
        .then(() => { 
          sfx.start(); 
          this.purchasing = false;
        })
        .catch(err => {
          console.error(err);
          this.popup = { title: 'PURCHASE FAILED', message: err.message || 'Transaction rejected' };
          sfx.back();
          this.purchasing = false;
        });
    } else {
      sfx.back(); // Already owned
      this.purchasing = false;
    }
  }

  enterSelect() {
    this.selecting = this.mode === '2P' ? 2 : 1;
    this.cursors = [];
    for (let i = 0; i < this.selecting; i++) {
      this.cursors.push({ idx: 0, locked: false });
    }
    this.availableCharacters = CHARACTERS.filter(c => !c.isStoreItem || network.ownedCharacters.includes(c.id));
    this.state = 'SELECT';
  }

  updateSelect() {
    if (input.wasPressed('Escape')) { 
        this.state = this.mode === 'ONLINE' ? 'WAGER' : 'TITLE'; 
        sfx.back(); 
        return; 
    }

    const schemes = [CONTROLS.p1, CONTROLS.p2];
    const cols = 6;
    for (let i = 0; i < this.cursors.length; i++) {
      const cur = this.cursors[i];
      const sc = schemes[i];
      if (cur.locked) {
        if (input.wasPressed(sc.special) || input.wasPressed(sc.shield)) { cur.locked = false; sfx.back(); }
        continue;
      }
      let moved = false;
      if (input.wasPressed(sc.right) || input.wasPressed('ArrowRight')) { cur.idx = (cur.idx + 1) % this.availableCharacters.length; moved = true; }
      if (input.wasPressed(sc.left) || input.wasPressed('ArrowLeft')) { cur.idx = (cur.idx - 1 + this.availableCharacters.length) % this.availableCharacters.length; moved = true; }
      if (input.wasPressed(sc.down) || input.wasPressed('ArrowDown')) { cur.idx = (cur.idx + cols) % this.availableCharacters.length; moved = true; }
      if (input.wasPressed(sc.up) || input.wasPressed('ArrowUp')) { cur.idx = (cur.idx - cols + this.availableCharacters.length) % this.availableCharacters.length; moved = true; }
      if (moved) sfx.select();
      if (input.wasPressed(sc.light)) {
        const char = this.availableCharacters[cur.idx];
        if (char.isStoreItem && !network.ownedCharacters.includes(char.id)) {
          sfx.back();
          return;
        }
        cur.locked = true;
        sfx.start();
      }
    }

    if (input.pointerPressed) {
      const px = input.pointer.x, py = input.pointer.y;
      const cw = 110, ch = 105, gx = 10, gy = 10, cols = 6;
      const gridW = cols * cw + (cols - 1) * gx;
      const startX = (GAME.WIDTH - gridW) / 2, startY = 110;
      for (let i = 0; i < this.availableCharacters.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = startX + col * (cw + gx), y = startY + row * (ch + gy);
        if (px >= x && px <= x + cw && py >= y && py <= y + ch) {
          let activeCur = this.cursors.find(c => !c.locked);
          if (activeCur) {
            activeCur.idx = i;
            const char = this.availableCharacters[i];
            if (!(char.isStoreItem && !network.ownedCharacters.includes(char.id))) {
              activeCur.locked = true;
              sfx.start();
            } else {
              sfx.back();
            }
          }
          break;
        }
      }
    }

    if (this.cursors.length && this.cursors.every((c) => c.locked)) {
      if (this.mode === 'ONLINE') { this.enterQueue(); } else { this.beginBattle(); }
    }
  }

  enterQueue() {
    this.state = 'QUEUE';
    network.onError = (msg) => { this.popup = { title: 'MATCHMAKING ERROR', message: msg }; network.disconnect(); this.state = 'TITLE'; };
    network.onDisconnect = () => { this.popup = { title: 'DISCONNECTED', message: 'Connection to server lost.' }; network.disconnect(); this.state = 'TITLE'; };
    network.onMatchFound = (data) => { sfx.start(); this.networkData = data; this.enterEscrow(); };
    network.connect();
    network.socket?.on('match_start', () => { this.beginOnlineBattle(); });
    setTimeout(() => { network.joinQueue(this.selectedWager, this.availableCharacters[this.cursors[0].idx].id); }, 200);
  }

  enterEscrow() {
    this.state = 'ESCROW';
    this.escrowTimer = 2700; // 45 seconds at 60fps
    this.escrowStatus = 'WAITING_FOR_SIGNATURE';
    if (!this.treasuryPublicKey) {
      fetch('/api/config').then(r => r.json()).then(d => { 
        this.treasuryPublicKey = d.treasuryPublicKey; 
        if (d.rpcUrl) wallet.updateConnection(d.rpcUrl);
        this.processDeposit(); 
      }).catch(console.error);
    } else { this.processDeposit(); }
  }

  updateEscrow() {
    if (this.escrowStatus === 'WAITING_FOR_SIGNATURE' || this.escrowStatus === 'DEPOSITING') {
      this.escrowTimer--;
      if (this.escrowTimer <= 0) {
        this.escrowStatus = 'FAILED';
        this.popup = { title: 'DEPOSIT TIMEOUT', message: 'You did not sign the transaction in time.' };
        network.disconnect();
        this.state = 'TITLE';
      }
    } else if (this.escrowStatus === 'FAILED') {
      if (input.wasPressed('Escape') || input.wasPressed('Enter')) this.state = 'TITLE';
    }
  }

  async processDeposit() {
    this.escrowStatus = 'DEPOSITING';
    try {
      const sig = await wallet.sendWager(parseFloat(this.selectedWager), this.treasuryPublicKey);
      network.sendDeposit(sig);
      this.escrowStatus = 'WAITING_OPPONENT';
    } catch (err) { this.popup = { title: 'DEPOSIT FAILED', message: err.message }; this.escrowStatus = 'FAILED'; }
  }

  updateQueue() {
    if (input.wasPressed('Escape')) { sfx.back(); network.disconnect(); this.state = 'WAGER'; }
  }

  beginOnlineBattle() {
    const data = this.networkData;
    const myChar = this.availableCharacters[this.cursors[0].idx];
    const oppChar = getCharacter(data.opponent.character);
    this.fighters.length = 0;
    this.projectiles.length = 0;
    const myIndex = data.playerIndex;
    const oppIndex = myIndex === 0 ? 1 : 0;
    const meF = new Fighter(myChar, myIndex, { ...STAGE.spawns[myIndex] }, this.stocks, PLAYER_COLORS[myIndex]);
    meF.label = 'PLAYER';
    const oppF = new Fighter(oppChar, oppIndex, { ...STAGE.spawns[oppIndex] }, this.stocks, PLAYER_COLORS[oppIndex]);
    oppF.label = 'OPPONENT';
    if (myIndex === 0) this.fighters.push(meF, oppF); else this.fighters.push(oppF, meF);
    this.countdown = 180;
    
    // Networking initialization
    this.frame = 0;
    this.inputFrame = 0;
    this.localInputQueue = [];
    this.accumulatedIntent = frozenIntent();
    this.lockstepWaiting = false;
    this.matchResultSent = false;
    network.resetLockstep();
    network.playerIndex = myIndex;
    
    network.onOpponentDisconnected = () => {
       if (this.state === 'BATTLE') {
           this.winner = meF;
           this.state = 'RESULT';
           this.resultTimer = 0;
       }
    };
    network.onMatchResolved = (resolveData) => {
       const alive = this.fighters.filter(f => !f.dead);
       this.winner = alive.length === 1 ? alive[0] : meF;
       this.state = 'RESULT';
       this.resultTimer = 0;
    };

    this.state = 'BATTLE';
  }

  beginBattle() {
    const picks = this.cursors.map(c => this.availableCharacters[c.idx].id);
    if (this.mode === 'LOCAL' && this.selecting === 1) picks.push(CHARACTERS[Math.floor(this.t * 7) % CHARACTERS.length].id);
    this.fighters.length = 0;
    for (let i = 0; i < picks.length; i++) {
      const f = new Fighter(getCharacter(picks[i]), i, { ...STAGE.spawns[i % STAGE.spawns.length] }, this.stocks, PLAYER_COLORS[i]);
      f.isHuman = i < this.selecting;
      f.label = f.isHuman ? (this.selecting === 1 ? 'PLAYER' : `P${i + 1}`) : 'CPU';
      this.fighters.push(f);
      if (!f.isHuman) this.ais.push(new AIController(f, 0.7));
    }
    this.countdown = 180;
    this.frame = 0;
    this.matchResultSent = false;
    this.state = 'BATTLE';
  }

  updateBattle() {
    if (input.wasPressed('Escape')) { this.state = 'PAUSE'; return; }
    if (this.countdown > 0) {
      this.countdown--;
      for (const f of this.fighters) {
        if (!f.dead) f.update(frozenIntent(), this.world);
      }
      return;
    }

    if (this.mode === 'ONLINE') {
        const myIndex = network.playerIndex;
        const DELAY = 4; // 4 frames input delay (~66ms)

        const currentIntent = humanIntent(CONTROLS.p1);
        if (!this.accumulatedIntent) this.accumulatedIntent = frozenIntent();
        
        // Merge current intent into accumulated intent to preserve edge triggers during pauses
        if (currentIntent.moveX !== 0) this.accumulatedIntent.moveX = currentIntent.moveX;
        this.accumulatedIntent.up = this.accumulatedIntent.up || currentIntent.up;
        this.accumulatedIntent.down = this.accumulatedIntent.down || currentIntent.down;
        this.accumulatedIntent.jump = this.accumulatedIntent.jump || currentIntent.jump;
        this.accumulatedIntent.light = this.accumulatedIntent.light || currentIntent.light;
        this.accumulatedIntent.heavy = this.accumulatedIntent.heavy || currentIntent.heavy;
        this.accumulatedIntent.special = this.accumulatedIntent.special || currentIntent.special;
        this.accumulatedIntent.shield = this.accumulatedIntent.shield || currentIntent.shield;
        this.accumulatedIntent.dropTap = this.accumulatedIntent.dropTap || currentIntent.dropTap;

        // Sample and send inputs up to DELAY frames ahead
        while (this.inputFrame < this.frame + DELAY) {
            const intentToSend = { ...this.accumulatedIntent };
            this.localInputQueue.push({ frame: this.inputFrame, intent: intentToSend });
            network.sendInput(this.inputFrame, intentToSend);
            
            this.inputFrame++;
            // Reset accumulator to current hold state
            const rightHeld = input.isDown(CONTROLS.p1.right);
            const leftHeld = input.isDown(CONTROLS.p1.left);
            this.accumulatedIntent = { 
               moveX: (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0),
               up: input.isDown(CONTROLS.p1.up),
               down: input.isDown(CONTROLS.p1.down),
               jump: false, light: false, heavy: false, special: false,
               shield: input.isDown(CONTROLS.p1.shield),
               dropTap: false
            };
        }

        const myInput = this.localInputQueue.find(i => i.frame === this.frame);
        const oppInput = network.opponentInputQueue.find(i => i.frame === this.frame);

        if (!myInput || !oppInput) {
            this.lockstepWaiting = true;
            return;
        }

        this.lockstepWaiting = false;

        // Keep queues clean
        this.localInputQueue = this.localInputQueue.filter(i => i.frame > this.frame);
        network.opponentInputQueue = network.opponentInputQueue.filter(i => i.frame > this.frame);

        for (const f of this.fighters) {
            if (f.dead) continue;
            if (f.playerIndex === myIndex) {
                f.update(myInput.intent, this.world);
            } else {
                f.update(oppInput.intent, this.world);
            }
        }
        this.frame++;
    } else {
        for (const f of this.fighters) {
            if (f.dead) continue;
            f.update(f.isHuman ? humanIntent(CONTROLS[`p${f.playerIndex + 1}`]) : this.ais.find(a => a.f === f).think(this.world), this.world);
        }
    }

    this.stepProjectiles();

    let alive = this.fighters.filter(f => !f.dead);
    if (alive.length <= 1 && !this.matchResultSent) {
       this.matchResultSent = true;
       if (this.mode === 'ONLINE') {
           if (alive.length === 1) {
               network.sendMatchResult(alive[0].playerIndex, this.frame);
           }
           // wait for match_resolved
       } else {
           this.winner = alive[0];
           
           if (this.mode === 'LOCAL' && this.winner.playerIndex === 0 && wallet.authenticated) {
               fetch('/api/leaderboards/local_win', { method: 'POST' }).catch(console.error);
           }

           this.state = 'RESULT';
           this.resultTimer = 0;
       }
    }
  }

  stepProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].update(this.world);
      if (this.projectiles[i].dead) this.projectiles.splice(i, 1);
    }
  }

  updateLeaderboard() {
    if (input.wasPressed('Escape') || input.wasPressed('Enter')) { sfx.back(); this.state = 'TITLE'; return; }
  }

  updateResult() {
    if (this.resultTimer++ > 30 && (input.wasPressed('Escape') || input.wasPressed('Enter') || input.wasPressed('Space') || input.pointerPressed)) this.state = 'TITLE';
  }

  updatePause() {
    if (this.pauseIndex === undefined) this.pauseIndex = 0;
    const opts = ['RESUME', 'RESTART MATCH', 'MAIN MENU'];
    
    if (input.wasPressed('Escape')) { this.state = 'BATTLE'; return; }
    
    const c1 = CONTROLS.p1;
    if (input.wasPressed(c1.up) || input.wasPressed('ArrowUp')) { this.pauseIndex = (this.pauseIndex - 1 + opts.length) % opts.length; sfx.select(); }
    if (input.wasPressed(c1.down) || input.wasPressed('ArrowDown')) { this.pauseIndex = (this.pauseIndex + 1) % opts.length; sfx.select(); }
    
    if (input.pointerPressed) {
      const px = input.pointer.x, py = input.pointer.y;
      const cx = GAME.WIDTH / 2, cy = GAME.HEIGHT / 2;
      for (let i = 0; i < opts.length; i++) {
        const y = cy - 20 + i * 45;
        if (Math.abs(py - y) < 20 && Math.abs(px - cx) < 100) {
          this.pauseIndex = i;
          this._executePauseAction(i);
          return;
        }
      }
    }

    if (input.wasPressed(c1.light) || input.wasPressed('Enter') || input.wasPressed('Space')) {
      this._executePauseAction(this.pauseIndex);
    }
  }

  _executePauseAction(index) {
    sfx.start();
    if (index === 0) { this.state = 'BATTLE'; }
    else if (index === 1) { this.beginBattle(); }
    else if (index === 2) { this.state = 'TITLE'; }
  }

  render() {
    this.stage.drawBg(this.ctx);
    switch (this.state) {
      case 'TITLE': this.renderTitle(this.ctx); break;
      case 'WAGER': this.renderWager(this.ctx); break;
      case 'STORE': this.renderStore(this.ctx); break;
      case 'SELECT': this.renderSelect(this.ctx); break;
      case 'QUEUE': this.renderQueue(this.ctx); break;
      case 'ESCROW': this.renderEscrow(this.ctx); break;
      case 'BATTLE': this.renderBattle(this.ctx); break;
      case 'PAUSE': this.renderBattle(this.ctx); this.renderPause(this.ctx); break;
      case 'RESULT': this.renderBattle(this.ctx); this.renderResult(this.ctx); break;
    }
    
    if (this.popup && !this.popup.htmlModal) {
      this.renderPopup(this.ctx);
    }
  }

  renderQueue(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('MATCHMAKING...', cx, cy - 20);

    const dots = '.'.repeat(Math.floor(this.t / 20) % 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText('Looking for opponent' + dots, cx, cy + 30);
    
    ctx.fillStyle = '#9ca3af';
    ctx.font = '16px monospace';
    ctx.fillText('Press ESC to cancel', cx, cy + 80);
  }

  renderEscrow(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('OPPONENT FOUND!', cx, cy - 40);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    
    if (this.escrowStatus === 'WAITING_FOR_SIGNATURE') {
       ctx.fillText(`Please approve the ${(parseFloat(this.selectedWager) * 1.05).toFixed(3)} SOL deposit (incl 5% fee)...`, cx, cy + 20);
    } else if (this.escrowStatus === 'DEPOSITING') {
       ctx.fillText('Processing deposit...', cx, cy + 20);
    } else if (this.escrowStatus === 'WAITING_OPPONENT') {
       ctx.fillText('Waiting for opponent to deposit...', cx, cy + 20);
    } else if (this.escrowStatus === 'FAILED') {
       ctx.fillStyle = '#ef4444';
       ctx.fillText('Deposit failed or cancelled.', cx, cy + 20);
       ctx.fillStyle = '#9ca3af';
       ctx.font = '16px monospace';
       ctx.fillText('Press ENTER or ESC to return', cx, cy + 60);
    }
  }

  renderPopup(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;
    
    const isSuccess = this.popup.title.includes('SUCCESS');
    const isVerifying = this.popup.title.includes('VERIFYING');
    const color = isSuccess ? '#22c55e' : (isVerifying ? '#eab308' : '#ef4444');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx - 300, cy - 100, 600, 200);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - 300, cy - 100, 600, 200);

    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = 'bold 32px monospace';
    ctx.fillText(this.popup.title, cx, cy - 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px monospace';
    ctx.fillText(this.popup.message, cx, cy + 20);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px monospace';
    ctx.fillText('Press ENTER to close', cx, cy + 70);
  }

  renderTitle(ctx) {
      // ... (existing title rendering logic)
  }

  renderStore(ctx) {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 40px monospace';
    ctx.fillText('CHARACTER STORE', cx, 80);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px monospace';
    ctx.fillText('Purchase exclusive meme fighters with SOL', cx, 110);

    if (this.storeItems.length === 0) {
      ctx.fillText('Store is currently empty.', cx, cy);
      return;
    }

    const spacing = 180;
    const startX = cx - (this.storeItems.length * spacing) / 2 + spacing / 2;

    this.storeItems.forEach((char, i) => {
      const x = startX + i * spacing;
      const isSelected = i === this.storeIndex;
      const isOwned = network.ownedCharacters.includes(char.id);

      ctx.fillStyle = isSelected ? '#3b82f6' : '#1e293b';
      ctx.fillRect(x - 60, cy - 80, 120, 160);

      if (isSelected) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 60, cy - 80, 120, 160);
      }

      // Draw portrait/sprite centered properly
      this.drawIdle(ctx, char, x, cy - 25, 2.0);

      // Name with black box behind it
      ctx.fillStyle = '#000000';
      ctx.fillRect(x - 55, cy + 90, 110, 26);
      
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(char.name.toUpperCase(), x, cy + 108);

      // Price Button
      if (isOwned) {
        ctx.fillStyle = '#16a34a'; // Green button
        ctx.fillRect(x - 65, cy + 122, 130, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('OWNED', x, cy + 142);
      } else {
        ctx.fillStyle = '#fde047'; // Yellow button
        ctx.fillRect(x - 70, cy + 122, 140, 30);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(`BUY ${char.price} SOL`, x, cy + 142);
      }
    });

    ctx.font = 'bold 16px monospace';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.strokeText('Use LEFT/RIGHT to select, ENTER to buy, ESC to return', cx, GAME.HEIGHT - 40);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Use LEFT/RIGHT to select, ENTER to buy, ESC to return', cx, GAME.HEIGHT - 40);
  }

  renderSelect(ctx) {
    const cy = GAME.HEIGHT / 2;
    const spacing = 120;
    const startX = GAME.WIDTH / 2 - (this.availableCharacters.length * spacing) / 2 + spacing / 2;

    this.availableCharacters.forEach((char, i) => {
      const x = startX + i * spacing;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 40, cy - 40, 80, 80);
      // We no longer draw locks because unowned are hidden
      // Draw idle portrait
      this.drawIdle(ctx, char, x, cy - 10, 1.2);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(char.name, x, cy + 55);
    });
    
    this.cursors.forEach((c, i) => {
      ctx.strokeStyle = PLAYER_COLORS[i];
      ctx.lineWidth = 5;
      const x = startX + c.idx * spacing;
      ctx.strokeRect(x - 45, cy - 45, 90, 90);
    });
  }


  renderBattle(ctx) {
    this.stage.drawPlatforms(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    for (const f of this.fighters) f.draw(ctx);
    this.particles.draw(ctx);
    this.drawHUD(ctx);

    if (this.countdown > 0) {
      const n = Math.ceil((this.countdown - 30) / 50);
      let txt = n > 0 ? String(n) : 'GO!';
      if (this.countdown <= 30) txt = 'GO!';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 90px monospace';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#222'; ctx.lineWidth = 10;
      ctx.strokeText(txt, GAME.WIDTH / 2, GAME.HEIGHT / 2 + 10);
      ctx.fillStyle = txt === 'GO!' ? '#39ff14' : '#ffdb3c';
      ctx.fillText(txt, GAME.WIDTH / 2, GAME.HEIGHT / 2 + 10);
      ctx.restore();
    }
  }

  drawHUD(ctx) {
    const n = this.fighters.length;
    
    for (let i = 0; i < n; i++) {
      const f = this.fighters[i];
      const isP1 = i === 0;
      
      const boxW = 280;
      const x = isP1 ? 30 : GAME.WIDTH - boxW - 30;
      const y = 30;
      
      // background panel
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, y, boxW, 58);
      ctx.strokeStyle = f.accentColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, boxW - 3, 55);

      const portX = isP1 ? x + 10 : x + boxW - 42;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(portX, y + 10, 32, 32);
      
      ctx.save();
      ctx.beginPath();
      ctx.rect(portX, y + 10, 32, 32);
      ctx.clip();
      this.drawIdle(ctx, f.char, portX + 16, y - 5, 0.8);
      ctx.restore();
      
      ctx.strokeStyle = f.accentColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(portX, y + 10, 32, 32);

      // names
      ctx.textAlign = isP1 ? 'left' : 'right';
      ctx.fillStyle = f.accentColor;
      ctx.font = 'bold 15px monospace';
      
      const textX = isP1 ? x + 50 : x + boxW - 50;
      ctx.fillText(`${f.label} - ${f.char.name}`, textX, y + 22);

      if (f.dead) {
        ctx.fillStyle = '#555';
        ctx.font = 'bold 24px monospace';
        ctx.fillText('OUT', textX, y + 48);
      } else {
        // health bar config
        const maxDmg = 150;
        const fillPct = Math.max(0, 1 - f.damage / maxDmg);
        const barW = 180;
        const barH = 16;
        
        const barX = isP1 ? x + 50 : x + boxW - 50 - barW;
        
        // border & bg
        ctx.fillStyle = '#222';
        ctx.fillRect(barX, y + 30, barW, barH);
        
        ctx.fillStyle = fillPct > 0.5 ? '#2ed573' : fillPct > 0.25 ? '#ffa502' : '#ff4757';
        
        const innerW = Math.max(0, Math.floor((barW - 2) * fillPct));
        // fill towards center of screen
        if (isP1) {
            ctx.fillRect(barX + 1, y + 31, innerW, barH - 2);
        } else {
            ctx.fillRect(barX + barW - 1 - innerW, y + 31, innerW, barH - 2);
        }
        
        // percentage badge
        const pct = Math.floor(f.damage);
        ctx.fillStyle = damageColor(f.damage);
        ctx.font = 'bold 14px monospace';
        const pctX = isP1 ? barX + barW + 8 : barX - 8;
        ctx.textAlign = isP1 ? 'left' : 'right';
        ctx.fillText(`${pct}%`, pctX, y + 43);
      }

      // stock icons
      for (let s = 0; s < f.stocks; s++) {
        ctx.fillStyle = '#ff4757'; // Red heart color
        ctx.font = 'bold 14px monospace';
        const sx = isP1 ? (x + 10 + s * 16) : (x + boxW - 20 - s * 16);
        ctx.fillText('♥', sx, y + 54);
      }
    }
  }

  // ---- TITLE ----
  renderTitle(ctx) {
    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;
    const bob = Math.sin(this.t * 0.05) * 6;

    // big title with chunky outline
    ctx.font = 'italic bold 68px monospace';
    ctx.lineJoin = 'round';
    
    // Pixel-text shadow effect manually drawn
    ctx.fillStyle = '#cbd5e1';  // shadow
    ctx.fillText('PUMPBROS', cx + 6, 170 + bob + 6);

    ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
    ctx.strokeText('PUMPBROS', cx, 170 + bob);
    ctx.fillStyle = '#fbbf24'; // yellow
    ctx.fillText('PUMPBROS', cx, 170 + bob);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 300, 210 + bob, 600, 36);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
    ctx.strokeRect(cx - 300, 210 + bob, 600, 36);

    ctx.fillStyle = '#2563eb'; // blue
    ctx.font = 'bold 20px monospace';
    ctx.fillText('★ ONCHAIN BRAWLER · POWERED BY PUMP ★', cx, 235 + bob);

    // WALLET BUTTON REMOVED

    const opts = this.titleItems;
    
    // Background box for options to improve visibility
    const optsY = [310, 370, 430];

    for (let i = 0; i < opts.length; i++) {
      const sel = i === this.titleIndex;
      const barY = optsY[i];
      const w = 360;
      const h = 50;
      const skew = 20;
      const startX = cx - w/2;
      const startY = barY - h/2;

      ctx.beginPath();
      ctx.moveTo(startX + skew, startY);
      ctx.lineTo(startX + w + skew, startY);
      ctx.lineTo(startX + w - skew, startY + h);
      ctx.lineTo(startX - skew, startY + h);
      ctx.closePath();

      // Determine availability
      let avail = true;
      if (opts[i] === 'ONLINE' && !wallet.authenticated) {
        avail = false;
      }

      // Slanted box background
      const grad = ctx.createLinearGradient(0, startY, 0, startY + h);
      if (sel) {
        grad.addColorStop(0, '#eb6363');
        grad.addColorStop(0.5, '#d14343');
        grad.addColorStop(1, '#a82a2a');
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 4;
      } else {
        // Ash gray color for all unselected options
        grad.addColorStop(0, '#6b7280');
        grad.addColorStop(0.5, '#4b5563');
        grad.addColorStop(1, '#374151');
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 3;
      }
      
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      ctx.stroke();

      // Inner highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX + skew + 2, startY + 4);
      ctx.lineTo(startX + w + skew - 8, startY + 4);
      ctx.stroke();

      ctx.font = `bold ${sel ? 30 : 26}px monospace`;
      const prefix = sel ? '▶ ' : '';
      
      const textY = barY + 10;
      
      // Thick black outline for text
      ctx.strokeStyle = '#000000'; 
      ctx.lineWidth = 6; 
      ctx.strokeText(prefix + opts[i], cx, textY); 

      // Text fill
      ctx.fillStyle = sel ? '#ffffff' : '#f3f4f6';
      ctx.fillText(prefix + opts[i], cx, textY);
    }
  }

  // ---- WALLET BUTTON ----
  renderWalletButton(ctx) {
    const btnX = GAME.WIDTH - 220;
    const btnY = 16;
    const btnW = 200;
    const btnH = 34;
    const skew = 10;

    ctx.save();

    // Slanted shape
    ctx.beginPath();
    ctx.moveTo(btnX + skew, btnY);
    ctx.lineTo(btnX + btnW, btnY);
    ctx.lineTo(btnX + btnW - skew, btnY + btnH);
    ctx.lineTo(btnX, btnY + btnH);
    ctx.closePath();

    if (wallet.connected) {
      // Connected state — green gradient
      const grad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      grad.addColorStop(0, '#065f46');
      grad.addColorStop(1, '#064e3b');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulsing green dot
      const pulse = 0.6 + Math.sin(this.t * 0.08) * 0.4;
      ctx.fillStyle = `rgba(52, 211, 153, ${pulse})`;
      ctx.beginPath();
      ctx.arc(btnX + 18, btnY + btnH / 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(btnX + 18, btnY + btnH / 2, 3, 0, Math.PI * 2);
      ctx.fill();

      // Address + balance text
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = '#d1fae5';
      ctx.fillText(wallet.shortAddress, btnX + 30, btnY + 15);

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText(wallet.balanceDisplay, btnX + 30, btnY + 28);

      // Network badge
      ctx.textAlign = 'right';
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#5eead4';
      ctx.fillText(wallet.networkLabel.toUpperCase(), btnX + btnW - 14, btnY + 14);

      // Disconnect hint
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('CLICK TO DISCONNECT', btnX + btnW - 14, btnY + 28);

    } else if (wallet.connecting) {
      // Connecting state — amber pulse
      const grad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      grad.addColorStop(0, '#78350f');
      grad.addColorStop(1, '#451a03');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = 'bold 13px monospace';
      const dots = '.'.repeat((Math.floor(this.t / 20) % 3) + 1);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('CONNECTING' + dots, btnX + btnW / 2, btnY + btnH / 2 + 4);

    } else {
      // Disconnected state — dark purple/blue gradient
      const hover = Math.sin(this.t * 0.06) * 0.06;
      const grad = ctx.createLinearGradient(0, btnY, 0, btnY + btnH);
      grad.addColorStop(0, `rgba(88, 28, 135, ${0.9 + hover})`);
      grad.addColorStop(1, `rgba(59, 7, 100, ${0.95 + hover})`);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(btnX + skew + 2, btnY + 3);
      ctx.lineTo(btnX + btnW - 4, btnY + 3);
      ctx.stroke();

      // Wallet icon (simple ◈ glyph)
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#c4b5fd';
      ctx.fillText('◈', btnX + 18, btnY + btnH / 2 + 5);

      // Text
      ctx.font = 'bold 13px monospace';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText('CONNECT WALLET', btnX + btnW / 2 + 6, btnY + btnH / 2 + 5);
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('CONNECT WALLET', btnX + btnW / 2 + 6, btnY + btnH / 2 + 5);
    }

    ctx.restore();
  }

  // ---- WAGER ----
  renderWager(ctx) {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    // overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

    // Wager menu box
    const bw = 360, bh = 340;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('SELECT WAGER', cx, cy - bh / 2 + 50);

    const startY = 200;
    for (let i = 0; i < this.wagerAmounts.length; i++) {
      const sel = i === this.wagerIndex;
      const y = startY + i * 45;

      if (sel) {
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(cx - 100, y - 20, 200, 32);
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#64748b';
      }

      ctx.font = 'bold 20px monospace';
      ctx.fillText(`${this.wagerAmounts[i]} SOL`, cx, y + 4);
    }
  }

  // ---- SELECT ----
  renderSelect(ctx) {
    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;
    ctx.font = 'bold 34px monospace';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
    ctx.strokeText('CHOOSE YOUR FIGHTER', cx, 70);
    ctx.fillStyle = '#fcd34d'; // yellow
    ctx.fillText('CHOOSE YOUR FIGHTER', cx, 70);

    const cols = 6;
    const cw = 110, ch = 105, gx = 10, gy = 10;
    const gridW = cols * cw + (cols - 1) * gx;
    const startX = (GAME.WIDTH - gridW) / 2;
    const startY = 110;

    for (let i = 0; i < this.availableCharacters.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (cw + gx);
      const y = startY + row * (ch + gy);
      const c = this.availableCharacters[i];

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);

      // smaller sprite, fitted at the top/center
      this.drawIdle(ctx, c, x + cw / 2, y + 10, 1.3);

      // High-contrast background strip for the text to improve readability
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(x, y + ch - 28, cw, 28);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 16px "Arial Black", sans-serif';
      ctx.fillText(c.name.toUpperCase(), x + cw / 2, y + ch - 8);
    }

    // cursors
    for (let i = 0; i < this.cursors.length; i++) {
      const cur = this.cursors[i];
      const col = cur.idx % cols, row = Math.floor(cur.idx / cols);
      const x = startX + col * (cw + gx);
      const y = startY + row * (ch + gy);
      const pad = i === 1 ? 4 : 0;
      
      // Dark border behind for high contrast
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = cur.locked ? 8 : 6;
      ctx.strokeRect(x - 2 + pad, y - 2 + pad, cw + 4 - pad * 2, ch + 4 - pad * 2);
      
      // Colored player border
      ctx.strokeStyle = PLAYER_COLORS[i];
      ctx.lineWidth = cur.locked ? 5 : 3;
      ctx.strokeRect(x - 2 + pad, y - 2 + pad, cw + 4 - pad * 2, ch + 4 - pad * 2);
      ctx.fillStyle = PLAYER_COLORS[i];
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(cur.locked ? `P${i + 1} ✓` : `P${i + 1}`, x + 4, y + 14);
      ctx.textAlign = 'center';
    }

    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    const hint = this.mode === '2P'
      ? 'P1: Arrows move, X confirm  ·  P2: WASD move, J confirm'
      : 'Arrows move  ·  X confirm  ·  ESC menu';
      
    // Add outline for better visibility
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(hint, cx, GAME.HEIGHT - 24);
    
    ctx.fillStyle = '#fff';
    ctx.fillText(hint, cx, GAME.HEIGHT - 24);
  }

  // ---- ESCROW ----
  renderEscrow(ctx) {
    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    ctx.font = 'bold 36px monospace';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
    
    if (this.escrowStatus === 'DEPOSITING' || this.escrowStatus === 'WAITING_FOR_SIGNATURE') {
      ctx.strokeText('MATCH FOUND! DEPOSIT WAGER', cx, cy - 20);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('MATCH FOUND! DEPOSIT WAGER', cx, cy - 20);

      const seconds = Math.max(0, Math.ceil(this.escrowTimer / 60));
      ctx.font = 'bold 80px monospace';
      ctx.strokeText(seconds, cx, cy + 80);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(seconds, cx, cy + 80);

      ctx.font = '18px monospace';
      ctx.fillStyle = '#d1d5db';
      ctx.fillText(`Please sign the transaction in your wallet.`, cx, cy + 120);
    } else if (this.escrowStatus === 'WAITING_OPPONENT') {
      ctx.strokeText('DEPOSIT CONFIRMED!', cx, cy - 20);
      ctx.fillStyle = '#10b981';
      ctx.fillText('DEPOSIT CONFIRMED!', cx, cy - 20);

      ctx.font = '18px monospace';
      ctx.fillStyle = '#d1d5db';
      ctx.fillText(`Waiting for opponent to deposit...`, cx, cy + 20);
    } else if (this.escrowStatus === 'FAILED') {
      ctx.strokeText('TRANSACTION FAILED/TIMEOUT', cx, cy - 20);
      ctx.fillStyle = '#ef4444';
      ctx.fillText('TRANSACTION FAILED/TIMEOUT', cx, cy - 20);

      ctx.font = '18px monospace';
      ctx.fillStyle = '#d1d5db';
      ctx.fillText(`Press any key to return`, cx, cy + 40);
    }
  }

  // ---- QUEUE ----
  renderQueue(ctx) {
    // Subtle dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    ctx.font = 'bold 36px monospace';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#222'; ctx.lineWidth = 6;
    ctx.strokeText('MATCHMAKING...', cx, cy - 20);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('MATCHMAKING...', cx, cy - 20);

    ctx.font = 'bold 20px monospace';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.strokeText(`Bracket: ${this.selectedWager} SOL`, cx, cy + 20);
    ctx.fillStyle = '#d1d5db';
    ctx.fillText(`Bracket: ${this.selectedWager} SOL`, cx, cy + 20);

    const dots = '.'.repeat((Math.floor(this.t / 15) % 3) + 1);
    ctx.strokeText(`Waiting for opponent${dots}`, cx, cy + 60);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`Waiting for opponent${dots}`, cx, cy + 60);

    ctx.font = 'bold 16px monospace';
    ctx.strokeText('Press ESC to cancel', cx, GAME.HEIGHT - 30);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Press ESC to cancel', cx, GAME.HEIGHT - 30);
  }

  drawIdle(ctx, c, cx, top, scale, animRow = 0, animate = false) {
    if (c.img && c.img.width > 0) {
      const framesData = SPRITE_FRAMES[c.id] || SPRITE_FRAMES['punch'];
      if (!framesData || !framesData[0] || framesData[0].length === 0) {
        this.drawPortrait(ctx, c, cx, top, scale);
        return;
      }
      
      // If we ask for win animation (8) but character only has 9 rows, row 8 is actually their dead animation.
      if (animRow === 8 && framesData.length === 9) {
        animRow = 0;
      }
      
      const actualRow = (animRow < framesData.length && framesData[animRow] && framesData[animRow].length > 0) ? animRow : 0;
      const rowData = framesData[actualRow];
      const animFrame = animate ? Math.floor(this.t / 8) % rowData.length : 0;
      const frameRect = rowData[animFrame];
      
      const ratioX = c.spriteRatioX || 1;
      const ratioY = c.spriteRatioY || 1;
      const charScale = c.spriteScale || 0.30;
      
      const sx = frameRect.x * ratioX;
      const sy = frameRect.y * ratioY;
      const sw = frameRect.w * ratioX;
      let sh = frameRect.h * ratioY;
      
      if (!c.spriteRatioX) {
        let maxBottom = sy + sh;
        for (let r = actualRow + 1; r < framesData.length; r++) {
          for (const otherF of framesData[r]) {
            const otherSx = otherF.x * ratioX;
            const otherSw = otherF.w * ratioX;
            const otherSy = otherF.y * ratioY;
            if (sx < otherSx + otherSw && sx + sw > otherSx) {
              if (sy < otherSy) maxBottom = Math.min(maxBottom, otherSy);
            }
          }
        }
        if (sy + sh > maxBottom) sh = maxBottom - sy;
      }

      const finalScale = charScale * (scale / 1.7) * 0.9;
      const destW = frameRect.w * finalScale;
      const destH = (sh / ratioY) * finalScale;
      
      const ox = (frameRect.ox !== undefined ? frameRect.ox : frameRect.w / 2) * finalScale;
      const oy = (frameRect.oy !== undefined ? frameRect.oy : frameRect.h) * finalScale;
      
      ctx.save();
      const feetY = top + 48 * scale; // adjust feet placement to sit directly above the text box
      ctx.translate(cx, feetY);
      ctx.drawImage(c.img, sx, sy, sw, sh, -ox, -oy, destW, destH);
      ctx.restore();
    } else {
      this.drawPortrait(ctx, c, cx, top, scale);
    }
  }

  drawPortrait(ctx, c, cx, top, scale) {
    const p = c.palette;
    const w = 30 * scale, h = 40 * scale;
    const x = cx - w / 2, y = top;
    ctx.fillStyle = p.body;
    ctx.fillRect(x, y + 8, w, h - 8);
    ctx.fillRect(x + 6, y, w - 12, 14);
    ctx.fillStyle = p.trim;
    ctx.fillRect(x + 6, y + h * 0.55, w - 12, 6);
    ctx.fillStyle = p.eye;
    ctx.fillRect(x + w - 20, y + 6, 6, 7);
    ctx.fillRect(x + w - 11, y + 6, 6, 7);
    ctx.fillStyle = p.accent;
    ctx.fillRect(x, y + 8, 7, h - 8);
  }

  // ---- PAUSE ----
  renderPause(ctx) {
    const cx = GAME.WIDTH / 2;
    const cy = GAME.HEIGHT / 2;

    // overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);

    // Pause menu box
    const bw = 300, bh = 240;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('PAUSED', cx, cy - 60);

    const opts = ['RESUME', 'RESTART MATCH', 'MAIN MENU'];
    for (let i = 0; i < opts.length; i++) {
      if (this.pauseIndex === i) {
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(cx - 100, cy - 20 + i * 45 - 20, 200, 32);
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#64748b';
      }
      ctx.font = 'bold 20px monospace';
      ctx.fillText(opts[i], cx, cy - 20 + i * 45 + 4);
    }
  }

  // ---- RESULT ----
  renderResult(ctx) {
    if (this.resultTimer < 30) return;
    
    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, GAME.WIDTH, GAME.HEIGHT);
    ctx.textAlign = 'center';
    const cx = GAME.WIDTH / 2;

    if (this.winner) {
      if (this.mode === '1P') {
        if (this.winner.isHuman) {
          ctx.fillStyle = '#4ade80'; // Green
          ctx.font = 'bold 64px monospace';
          ctx.fillText('WINNER!', cx, 200);
          this.drawIdle(ctx, this.winner.char, cx, 210, 2, 8, true);
        } else {
          ctx.fillStyle = '#ef4444'; // Red
          ctx.font = 'bold 64px monospace';
          ctx.fillText('GAME OVER', cx, 200);
          this.drawIdle(ctx, this.winner.char, cx, 210, 2);
        }
      } else {
        ctx.fillStyle = this.winner.accentColor;
        ctx.font = 'bold 32px monospace';
        ctx.fillText(`${this.winner.label} WINS`, cx, 160);
        this.drawIdle(ctx, this.winner.char, cx, 150, 2.5, 8, true);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px monospace';
        ctx.fillText(this.winner.char.name + '!', cx, 310);
      }
    } else {
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 64px monospace';
      ctx.fillText('DRAW!', cx, 240);
    }

    const blink = Math.floor(this.t / 30) % 2 === 0;
    
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px monospace';
    
    // RESTART BUTTON
    ctx.fillStyle = blink ? '#3b82f6' : '#2563eb';
    ctx.fillRect(cx - 120, 340, 240, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('RESTART', cx, 373);
    
    // MENU BUTTON
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - 120, 410, 240, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MAIN MENU', cx, 443);
  }
}

// ---- intent helpers --------------------------------------------------------
function humanIntent(sc) {
  return {
    moveX: (input.isDown(sc.right) ? 1 : 0) - (input.isDown(sc.left) ? 1 : 0),
    up: input.isDown(sc.up),
    down: input.isDown(sc.down),
    jump: input.wasPressed(sc.up),
    light: input.wasPressed(sc.light),
    heavy: input.wasPressed(sc.heavy),
    special: input.wasPressed(sc.special),
    shield: input.isDown(sc.shield),
    dropTap: input.wasPressed(sc.down),
  };
}

function frozenIntent() {
  return { moveX: 0, up: false, down: false, jump: false, light: false, heavy: false, special: false, shield: false, dropTap: false };
}

function damageColor(d) {
  const t = Math.min(1, d / 150);
  const r = Math.round(120 + t * 135);
  const g = Math.round(230 - t * 200);
  const b = Math.round(90 - t * 70);
  return `rgb(${r},${g},${b})`;
}
