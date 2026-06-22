// ============================================================================
//  Bootstrap — wire up canvas, resume audio on first gesture, start the game.
// ============================================================================
import { Game } from './game.js';
import { sfx } from './audio.js';
import { initUI } from './ui.js';
import { wallet } from './wallet.js';
import { input } from './input.js';

document.body.style.display = 'none';

wallet.autoConnect().then(() => {
    if (!wallet.authenticated) {
        window.location.href = '/auth.html';
        return;
    }

    document.body.style.display = 'flex';

    const canvas = document.getElementById('game');
    input.bindCanvas(canvas);
    const game = new Game(canvas);

    // unlock WebAudio on first interaction (browser autoplay policy)
    function unlock() {
      sfx.resume();
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
    }
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);

    // focus so keys register immediately
    canvas.tabIndex = 0;
    canvas.focus();
    window.addEventListener('pointerdown', () => canvas.focus());

    game.start();
    initUI();

    // expose for debugging
    window.__game = game;
});
