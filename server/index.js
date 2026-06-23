import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { authRouter } from './auth.js';
import { initSocket, getActivePlayersCount } from './socket.js';
import { getLeaderboards, incrementLocalWins, getGlobalStats } from './supabase.js';
import jwt from 'jsonwebtoken';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cookieParser());

// Serve static frontend files from the Vite build directory
app.use(express.static(path.join(__dirname, '../dist')));

app.use('/api/auth', authRouter);

initSocket(httpServer);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const rpcUrl = process.env.HELIUS_RPC_URL || 
                 (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com');
  
  res.json({ 
    treasuryPublicKey: process.env.TREASURY_PUBLIC_KEY,
    storeTreasuryPublicKey: process.env.STORE_TREASURY_PUBLIC_KEY || process.env.TREASURY_PUBLIC_KEY,
    rpcUrl: rpcUrl
  });
});

app.get('/api/leaderboards', async (req, res) => {
  try {
    const leaderboards = await getLeaderboards();
    res.json(leaderboards);
  } catch (err) {
    console.error('[API] getLeaderboards error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboards' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getGlobalStats();
    stats.players = getActivePlayersCount(); // Use real-time active battling players
    res.json(stats);
  } catch (err) {
    console.error('[API] getGlobalStats error:', err);
    res.status(500).json({ error: 'Failed to fetch global stats' });
  }
});

app.post('/api/leaderboards/local_win', async (req, res) => {
  const token = req.cookies?.jwt;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_pumpbros_dev';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    await incrementLocalWins(decoded.address);
    res.json({ success: true });
  } catch (err) {
    console.error('[API] incrementLocalWins error:', err);
    res.status(500).json({ error: 'Failed to increment local wins' });
  }
});

// Fallback to serve index.html for client-side routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});


httpServer.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
