import { io } from 'socket.io-client';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.playerIndex = null;
    this.opponent = null; // { address, character }
    
    // Callbacks
    this.onMatchFound = null;
    this.onMatchStart = null;
    this.onMatchResolved = null;
    this.onOpponentDisconnected = null;
    this.onOpponentInput = null;
    this.onError = null;

    // Lockstep State
    this.opponentInputQueue = [];

    // Store State
    this.ownedCharacters = [];
  }

  connect() {
    if (this.socket) return;
    this.socket = io({ 
      path: '/socket.io',
      withCredentials: true
    });

    this.socket.on('connect', () => {
      console.log('[Network] Connected to matchmaking server');
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Network] Connection Error:', err.message);
      if (this.onError) this.onError(err.message);
    });

    this.socket.on('match_found', (data) => {
      console.log('[Network] Match found!', data);
      this.roomId = data.roomId;
      this.playerIndex = data.playerIndex;
      this.opponent = data.opponent;
      if (this.onMatchFound) this.onMatchFound(data);
    });

    this.socket.on('disconnect', () => {
      console.log('[Network] Disconnected from server');
      if (this.onDisconnect) this.onDisconnect();
    });

    this.socket.on('opponent_disconnected', () => {
      console.log('[Network] Opponent disconnected');
      if (this.onOpponentDisconnected) this.onOpponentDisconnected();
    });

    this.socket.on('opponent_input', (data) => {
      this.opponentInputQueue.push(data);
      if (this.onOpponentInput) this.onOpponentInput(data);
    });

    this.socket.on('match_resolved', (data) => {
      console.log('[Network] Match resolved!', data);
      if (this.onMatchResolved) this.onMatchResolved(data);
    });
    
    this.socket.on('error', (msg) => {
      console.error('[Network] Error:', msg);
      if (this.onError) this.onError(msg);
    });

    this.socket.on('owned_characters', (chars) => {
      console.log('[Store] Received owned characters:', chars);
      this.ownedCharacters = chars;
    });

    this.socket.on('purchase_success', (charId) => {
      console.log('[Store] Purchase successful:', charId);
      if (window.gameInstance) {
        window.gameInstance.popup = {
          title: 'PURCHASE SUCCESSFUL',
          message: `You now own ${charId.toUpperCase()}!`
        };
        window.gameInstance.state = 'TITLE';
      }
    });
  }

  joinQueue(bracket, character) {
    if (!this.socket) this.connect();
    this.socket.emit('join_queue', { bracket, character });
  }

  sendDeposit(signature) {
    if (this.socket) {
      this.socket.emit('wager_deposited', { roomId: this.roomId, signature });
    }
  }

  sendInput(frame, intent) {
    if (this.socket) {
      this.socket.emit('player_input', { frame, intent });
    }
  }

  sendMatchResult(winnerIndex, finalFrame) {
    if (this.socket) {
      this.socket.emit('match_result', { roomId: this.roomId, winnerIndex, finalFrame });
    }
  }

  resetLockstep() {
    this.opponentInputQueue = [];
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.roomId = null;
      this.playerIndex = null;
      this.opponent = null;
      this.resetLockstep();
    }
  }
}

export const network = new NetworkManager();
