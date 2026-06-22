# MEME SMASH — Onchain Brawler

A 2D pixel platform fighter (Super Smash Bros–style: damage %, knockback,
stocks, ring-outs) built in vanilla HTML5 Canvas + ES modules, now powered by a **Node.js backend** with full **Solana Web3 Integration**.

## Features

- **Classic Platform Fighting**: Fast-paced, physics-based combat with light attacks, heavy smashes, specials, shielding, and dropping through platforms.
- **Web3 Wallet Auth**: Connect via Phantom, Solflare, or any Solana wallet. Uses cryptographic message signing for secure authentication.
- **On-Chain Character Store**: Purchase premium meme fighters directly using SOL. Purchases are securely tracked in the backend database.
- **Online PvP w/ Wagers**: Queue up against other players online. Both players deposit a SOL wager into the server's Escrow.
- **Lockstep Netcode**: Custom frame-delay netcode ensures both players experience the exact same physics and combat results in real-time.
- **Automated Payouts**: Upon match completion, the backend verifies the result through client consensus and automatically executes a Solana transaction to send the total wager (minus fee) to the winner's wallet.
- **Local PvP / VS CPU**: Play locally with a friend on the same keyboard, or practice against the built-in AI controller.

## Architecture & Tech Stack

- **Frontend**: Vanilla HTML5 Canvas + ES Modules (served via Vite). No bulky game engines. Custom input handling and collision physics.
- **Backend**: Node.js + Express + Socket.IO. Handles matchmaking, lockstep input relaying, and consensus verification.
- **Database**: Supabase (PostgreSQL) for user accounts, match history, and character ownership.
- **Blockchain**: Solana Web3.js + Helius RPC. Handles wallet verification, SOL transfers, and automated Treasury payouts.

## Running Locally

You'll need Node.js and a `.env` file for the backend services.

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory (see `.env.example`):
   ```
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key

   # Helius RPC (Solana)
   HELIUS_API_KEY=your_helius_api_key

   # Server Treasury Wallet (Base58 Private Key)
   TREASURY_PRIVATE_KEY=your_base58_private_key
   ```

3. Start the Vite dev server and Node.js backend concurrently:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`.

## Controls

| Action        | Player 1      | Player 2          |
|---------------|---------------|-------------------|
| Move / Jump   | Arrow keys    | `WASD`            |
| Drop / Fastfall | `↓`         | `S`               |
| Light attack  | `X`           | `J`               |
| Smash (heavy) | `C`           | `K`               |
| Special       | `Z`           | `L`               |
| Shield        | `V`           | `I`               |

Smash + ↑ / ↓ gives up-smash / down-smash. `ESC` returns to the menu.

## Roster

The roster features fully data-driven meme characters:
**DOGE, PEPE, CHAD, WOJAK, SHIBA, TROLL, NYAN**
*Premium unlockables:* **PUMPFUN, PUDGY, JOTCHUA**

To add/remove fighters or adjust their stats (weight, speed, damage, projectiles), simply edit the `CHARACTERS` array in `src/config.js`. The character select screen, store, HUD, and AI will adapt automatically.

## Project Layout

```text
├── index.html           # Main entry point and canvas shell
├── src/
│   ├── config.js        # Physics constants, roster data, stage data
│   ├── game.js          # Main game loop, state machine, menus, and HUD
│   ├── network.js       # Client-side Socket.IO and Lockstep logic
│   ├── wallet.js        # Solana wallet connection and transactions
│   ├── fighter.js       # Core fighter physics, attacks, and knockback
│   ├── input.js         # Edge-detection keyboard/pointer manager
│   └── audio.js         # Procedural WebAudio SFX
└── server/
    ├── index.js         # Express server and startup
    ├── socket.js        # Socket.IO matchmaking and lockstep relay
    ├── treasury.js      # Solana transaction builder and sender
    ├── auth.js          # Cryptographic wallet signature verification
    ├── supabase.js      # Database wrappers
    └── helius.js        # RPC client
```
