import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

const kp = Keypair.generate();
const pubKey = kp.publicKey.toBase58();
const privKey = bs58.encode(kp.secretKey);

const envLine = `\n# Server Treasury Wallet\nTREASURY_PUBLIC_KEY="${pubKey}"\nTREASURY_PRIVATE_KEY="${privKey}"\n`;

if (fs.existsSync(envPath)) {
  fs.appendFileSync(envPath, envLine);
  console.log('[Success] Appended new Treasury keys to .env file.');
} else {
  fs.writeFileSync(envPath, envLine);
  console.log('[Success] Created .env file with new Treasury keys.');
}

console.log('--------------------------------------------------');
console.log('Treasury Public Key:', pubKey);
console.log('--------------------------------------------------');
console.log('IMPORTANT: Keep this Private Key absolutely secret!');
