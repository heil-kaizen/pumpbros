import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { getOrCreateUser } from './supabase.js';
import { checkHeliusToken } from './helius.js';

export const authRouter = express.Router();

// Store nonces temporarily in memory (in production, use Redis or DB)
const nonces = new Map();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_pumpbros_dev';
const REQUIRED_TOKEN_ADDRESS = process.env.REQUIRED_TOKEN_ADDRESS || '';
const REQUIRED_AMOUNT = 100000;

authRouter.get('/nonce', (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Address required' });

  const nonce = `Sign this message to authenticate with PumpBros: ${crypto.randomBytes(16).toString('hex')}`;
  nonces.set(address, nonce);

  res.json({ nonce });
});

authRouter.post('/verify', async (req, res) => {
  const { address, signature } = req.body;
  if (!address || !signature) {
    return res.status(400).json({ error: 'Address and signature required' });
  }

  const message = nonces.get(address);
  if (!message) {
    return res.status(400).json({ error: 'Nonce not found or expired. Request a new one.' });
  }

  try {
    // Determine if signature is array or base58 string
    let signatureUint8;
    if (Array.isArray(signature)) {
      signatureUint8 = new Uint8Array(signature);
    } else {
      signatureUint8 = bs58.decode(signature);
    }

    const publicKeyUint8 = bs58.decode(address);
    const messageUint8 = new TextEncoder().encode(message);

    // Verify signature
    const isValid = nacl.sign.detached.verify(messageUint8, signatureUint8, publicKeyUint8);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Token Gate Check
    const hasEnoughTokens = await checkHeliusToken(address, REQUIRED_TOKEN_ADDRESS, REQUIRED_AMOUNT);
    if (!hasEnoughTokens) {
      return res.status(403).json({ error: `Insufficient tokens. You need at least ${REQUIRED_AMOUNT} to play.` });
    }

    // Clear nonce
    nonces.delete(address);

    // Get or Create user in Supabase
    const user = await getOrCreateUser(address);

    // Issue JWT
    const token = jwt.sign({ address, id: user.id || address }, JWT_SECRET, { expiresIn: '24h' });

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ success: true, user });
  } catch (err) {
    console.error('[Auth] Verify error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('jwt');
  res.json({ success: true });
});

authRouter.get('/me', (req, res) => {
  const token = req.cookies?.jwt;
  if (!token) return res.json({ user: null });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (err) {
    res.json({ user: null });
  }
});

import { updateUsername } from './supabase.js';

authRouter.post('/setUsername', async (req, res) => {
  const token = req.cookies?.jwt;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { username } = req.body;
    
    if (!username || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    await updateUsername(decoded.address, username.trim());
    
    // We might want to send the updated user back, but success is enough
    res.json({ success: true, username: username.trim() });
  } catch (err) {
    console.error('[Auth] setUsername error:', err);
    res.status(500).json({ error: err.message || 'Failed to set username' });
  }
});
