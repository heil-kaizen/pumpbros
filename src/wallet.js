// ============================================================================
//  Wallet Manager — Solana wallet integration (vanilla JS, no React)
//  Uses direct window injection for Phantom, Solflare, Backpack.
// ============================================================================
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { CHARACTERS } from './config.js';
import { network } from './network.js';

// ---------------------------------------------------------------------------
//  Config
// ---------------------------------------------------------------------------
const NETWORK = 'mainnet-beta'; // 'devnet' | 'mainnet-beta'
const RPC_URL = clusterApiUrl(NETWORK);

// ---------------------------------------------------------------------------
//  WalletManager
// ---------------------------------------------------------------------------
class WalletManager {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    // Fetch config asynchronously to get the Helius RPC URL
    fetch('/api/config').then(r => r.json()).then(d => {
      if (d.rpcUrl) {
        this.connection = new Connection(d.rpcUrl, 'confirmed');
        if (this.connected) this.fetchBalance(); // Refresh balance if already connected
      }
    }).catch(console.error);
    this.provider = null;
    this.publicKey = null;
    this.connected = false;
    this.connecting = false;
    this.authenticating = false;
    this.authenticated = false;
    this.balance = null;       // SOL (number) or null
    this.balanceLoading = false;
    this.error = null;

    this._adapters = [];
    this._detectStandardWallets();
  }

  updateConnection(rpcUrl) {
    if (rpcUrl && rpcUrl !== this.connection.rpcEndpoint) {
      console.log(`[Wallet] Updating RPC connection to: ${rpcUrl}`);
      this.connection = new Connection(rpcUrl, 'confirmed');
    }
  }

  // -------------------------------------------------------------------------
  //  Wallet detection
  // -------------------------------------------------------------------------

  /** Detect wallets injected into window (Phantom, Solflare, Backpack) */
  _detectStandardWallets() {
    // 1. Phantom
    if (window.phantom?.solana?.isPhantom) {
      this._adapters.push({
        name: 'Phantom',
        readyState: 'Installed',
        getProvider: () => window.phantom.solana,
        icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/phantom/images/icon.png',
      });
    } else {
      this._adapters.push({ name: 'Phantom', readyState: 'NotDetected', url: 'https://phantom.app/' });
    }

    // 2. Solflare
    if (window.solflare?.isSolflare) {
      this._adapters.push({
        name: 'Solflare',
        readyState: 'Installed',
        getProvider: () => window.solflare,
        icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/solflare/images/icon.svg',
      });
    }

    // 3. Backpack
    if (window.backpack) {
      this._adapters.push({
        name: 'Backpack',
        readyState: 'Installed',
        getProvider: () => window.backpack,
        icon: 'https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/backpack/images/icon.svg',
      });
    }
  }

  getAvailableWallets() {
    return this._adapters.filter((a) => a.readyState === 'Installed');
  }

  getAllWallets() {
    return this._adapters;
  }

  // -------------------------------------------------------------------------
  //  Connect / Disconnect
  // -------------------------------------------------------------------------

  async connect(adapter, providedUsername) {
    if (this.connecting) return;
    this.connecting = true;
    this.error = null;

    try {
      this.provider = adapter.getProvider();

      // Listen for disconnect events
      if (this.provider.on) {
        this.provider.on('disconnect', () => {
          this._onDisconnect();
        });
      }

      const resp = await this.provider.connect();
      // Phantom returns { publicKey } directly, Solflare might be slightly different
      // but generally provider.publicKey is populated
      this.publicKey = new PublicKey((resp.publicKey || this.provider.publicKey).toString());
      this.connected = true;
      this.connecting = false;

      console.log('[Wallet] Connected:', this.publicKey.toBase58());

      // Fetch balance in background
      this.fetchBalance();

      // Initiate authentication / signature flow
      await this.login(providedUsername);
    } catch (err) {
      console.error('[Wallet] Connect failed:', err);
      this.error = err.message || 'Connection failed';
      this.provider = null;
      this.connecting = false;
    }
  }

  async disconnect() {
    if (this.provider) {
      try {
        await this.provider.disconnect();
      } catch (e) {
        console.warn('[Wallet] Disconnect error:', e);
      }
    }
    this._onDisconnect();
  }

  _onDisconnect() {
    this.provider = null;
    this.publicKey = null;
    this.connected = false;
    this.connecting = false;
    this.authenticating = false;
    this.authenticated = false;
    this.balance = null;
    this.error = null;
    console.log('[Wallet] Disconnected');
  }

  // -------------------------------------------------------------------------

  async autoConnect() {
    try {
      const resp = await fetch('/api/auth/me');
      const data = await resp.json();
      if (data.user) {
        // We have a session! Try to reconnect provider silently.
        // Wait a tiny bit for Phantom to inject window.solana
        await new Promise(r => setTimeout(r, 100));
        const provider = window.phantom?.solana || window.solana;
        if (provider?.isPhantom) {
          const connectResp = await provider.connect({ onlyIfTrusted: true });
          this.provider = provider;
          this.publicKey = new PublicKey(connectResp.publicKey.toString());
          this.connected = true;
          this.authenticated = true; // /me succeeded, so we are authenticated
          console.log('[Wallet] Auto-connected:', this.publicKey.toBase58());
          this.fetchBalance();
          network.connect();
        }
      }
    } catch (e) {
      console.log('[Wallet] Auto-connect skipped or failed:', e.message);
    }
  }

  // -------------------------------------------------------------------------
  //  Auth & Balance
  // -------------------------------------------------------------------------

  async login(providedUsername) {
    if (!this.publicKey || !this.provider) return false;
    this.authenticating = true;
    
    try {
      const address = this.publicKey.toBase58();
      
      // 1. Get nonce
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
      const { nonce, error: nonceErr } = await nonceRes.json();
      if (nonceErr || !nonce) throw new Error(nonceErr || 'Failed to get nonce');

      // 2. Sign message
      const message = new TextEncoder().encode(nonce);
      let signature;

      if (this.provider.signMessage) {
        const signedMessage = await this.provider.signMessage(message, 'utf8');
        // Phantom and Solflare return signature as Uint8Array inside an object or directly
        signature = signedMessage.signature || signedMessage;
      } else {
        throw new Error('Wallet does not support signMessage');
      }

      // 3. Verify
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          signature: Array.from(signature)
        })
      });

      const data = await verifyRes.json();
      if (!data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      if (data.user && !data.user.username) {
        let username = providedUsername || prompt("Welcome to PumpBros! Please enter a username for the leaderboard:");
        while (!username || username.trim().length === 0) {
          username = prompt("A valid username is required. Please enter a username:");
          if (username === null) throw new Error('Username setup cancelled'); // if they click cancel
        }
        
        const setUsernameRes = await fetch('/api/auth/setUsername', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim() })
        });
        
        const setUsernameData = await setUsernameRes.json();
        if (!setUsernameData.success) {
           throw new Error(setUsernameData.error || 'Failed to set username');
        }
      }

      console.log('[Wallet] Authenticated successfully');
      this.authenticating = false;
      this.authenticated = true;
      network.connect();
      return true;
    } catch (err) {
      console.error('[Wallet] Login error:', err);
      this.error = err.message || 'Authentication failed';
      this.authenticating = false;
      this.authenticated = false;
      // If auth fails, we probably want to disconnect to enforce token gating
      this.disconnect();
      return false;
    }
  }

  async fetchBalance() {
    if (!this.publicKey) return;
    this.balanceLoading = true;
    try {
      const lamports = await this.connection.getBalance(this.publicKey);
      this.balance = lamports / LAMPORTS_PER_SOL;
      this.balanceLoading = false;
    } catch (err) {
      console.error('[Wallet] Balance fetch failed:', err);
      this.balance = null;
      this.balanceLoading = false;
    }
  }

  // -------------------------------------------------------------------------
  //  Transactions
  // -------------------------------------------------------------------------

  async sendWager(amountSol, treasuryPubKeyString) {
    if (!this.publicKey || !this.provider) throw new Error('Wallet not connected');

    const treasuryPubKey = new PublicKey(treasuryPubKeyString);
    const amountWithFee = amountSol * 1.05;
    const lamports = Math.round(amountWithFee * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.publicKey,
        toPubkey: treasuryPubKey,
        lamports,
      })
    );

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.publicKey;

    try {
      console.log(`[Wallet] Sending ${amountWithFee} SOL (incl. 5% fee) to ${treasuryPubKeyString}`);
      const { signature } = await this.provider.signAndSendTransaction(transaction);
      
      console.log(`[Wallet] Transaction sent. Signature: ${signature}`);
      
      // We no longer wait for confirmation here on the frontend.
      // Phantom has broadcasted the transaction. We immediately pass the 
      // signature to the backend, which will poll and wait for confirmation.

      console.log(`[Wallet] Transaction confirmed!`);
      return signature;
    } catch (err) {
      console.error('[Wallet] Transaction failed:', err);
      throw err;
    }
  }

  async purchaseCharacter(characterId, onTxSent) {
    if (!this.connected || !this.publicKey) throw new Error('Not connected');
    
    const char = CHARACTERS.find(c => c.id === characterId);
    if (!char || !char.isStoreItem) throw new Error('Invalid character');
    
    let treasuryPubkeyString = null;
    try {
      const r = await fetch('/api/config');
      const d = await r.json();
      treasuryPubkeyString = d.storeTreasuryPublicKey;
      if (d.rpcUrl) this.connection = new Connection(d.rpcUrl, 'confirmed');
    } catch (e) {
      throw new Error('Failed to fetch treasury configuration');
    }
    
    if (!treasuryPubkeyString) throw new Error('Treasury not configured');

    const signature = await this.sendWager(char.price, treasuryPubkeyString);
    
    if (onTxSent) onTxSent();

    if (!network.socket) {
      network.connect();
    }

    return new Promise((resolve, reject) => {
      network.socket.emit('buy_character', { characterId, signature });
      
      const timeout = setTimeout(() => {
        network.socket.off('purchase_success', onSuccess);
        network.socket.off('error', onError);
        reject(new Error('Backend verification timed out. The purchase is processing in the background.'));
      }, 20000);

      const onSuccess = (charId) => {
        if (charId === characterId) {
          clearTimeout(timeout);
          network.socket.off('purchase_success', onSuccess);
          network.socket.off('error', onError);
          resolve(signature);
        }
      };
      
      const onError = (msg) => {
        clearTimeout(timeout);
        network.socket.off('purchase_success', onSuccess);
        network.socket.off('error', onError);
        reject(new Error(msg));
      };

      network.socket.on('purchase_success', onSuccess);
      network.socket.on('error', onError);
    });
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  get shortAddress() {
    if (!this.publicKey) return '';
    const full = this.publicKey.toBase58();
    return full.slice(0, 4) + '...' + full.slice(-4);
  }

  get balanceDisplay() {
    if (this.balance === null) return '...';
    return this.balance.toFixed(2) + ' SOL';
  }

  get networkLabel() {
    return NETWORK === 'mainnet-beta' ? 'Mainnet' : 'Devnet';
  }
}

export const wallet = new WalletManager();
