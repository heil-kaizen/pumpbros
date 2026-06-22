// ============================================================================
//  Input — keyboard state with edge detection (pressed-this-frame).
//  Call input.update() once at the END of each game tick to roll the buffers.
// ============================================================================

class Input {
  constructor() {
    this.down = new Set();      // keys currently held
    this.pressed = new Set();   // keys that went down since last update()
    this.released = new Set();  // keys that went up since last update()
    this._queueDown = new Set();
    this._queueUp = new Set();

    // Pointer state
    this.pointer = { x: 0, y: 0 };
    this.pointerDown = false;
    this.pointerPressed = false;
    this._pointerQueueDown = false;

    window.addEventListener('keydown', (e) => {
      // prevent page scroll on arrows / space
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.down.has(e.code)) this._queueDown.add(e.code);
      this.down.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this._queueUp.add(e.code);
    });

    // drop everything if the tab loses focus (avoids stuck keys)
    window.addEventListener('blur', () => {
      this.down.clear();
      this.pointerDown = false;
    });
  }

  bindCanvas(canvas) {
    const updatePointer = (e) => {
      e.preventDefault(); // prevent default touch actions like pull-to-refresh
      const rect = canvas.getBoundingClientRect();
      // Calculate coordinates respecting potential CSS scaling
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      this.pointer.x = (clientX - rect.left) * scaleX;
      this.pointer.y = (clientY - rect.top) * scaleY;
    };

    canvas.addEventListener('mousedown', (e) => {
      updatePointer(e);
      if (!this.pointerDown) this._pointerQueueDown = true;
      this.pointerDown = true;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.pointerDown) updatePointer(e);
      else {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        this.pointer.x = (e.clientX - rect.left) * scaleX;
        this.pointer.y = (e.clientY - rect.top) * scaleY;
      }
    });
    canvas.addEventListener('mouseup', () => {
      this.pointerDown = false;
    });

    canvas.addEventListener('touchstart', (e) => {
      updatePointer(e);
      if (!this.pointerDown) this._pointerQueueDown = true;
      this.pointerDown = true;
    }, {passive: false});
    canvas.addEventListener('touchmove', (e) => {
      updatePointer(e);
    }, {passive: false});
    canvas.addEventListener('touchend', () => {
      this.pointerDown = false;
    }, {passive: false});
    canvas.addEventListener('touchcancel', () => {
      this.pointerDown = false;
    }, {passive: false});
  }

  // roll edge buffers — must run after all consumers have read them this frame
  update() {
    this.pressed = this._queueDown;
    this.released = this._queueUp;
    this._queueDown = new Set();
    this._queueUp = new Set();
    
    this.pointerPressed = this._pointerQueueDown;
    this._pointerQueueDown = false;
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }
}

export const input = new Input();

