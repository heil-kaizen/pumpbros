import { Connection, PublicKey, SystemProgram, Transaction, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';

const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY || '';

const HELIUS_RPC = process.env.HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` 
  : clusterApiUrl('mainnet-beta');

const connection = new Connection(HELIUS_RPC, 'confirmed');

export async function processPayout(winnerAddress, wagerAmount) {
  if (!TREASURY_PRIVATE_KEY) {
    console.warn('[Treasury] No private key, skipping real payout.');
    return 'mock_signature';
  }

  const treasuryKp = Keypair.fromSecretKey(bs58.decode(TREASURY_PRIVATE_KEY));
  const winnerPubkey = new PublicKey(winnerAddress);
  
  const payoutAmount = parseFloat(wagerAmount) * 2;
  const lamports = Math.round(payoutAmount * LAMPORTS_PER_SOL);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasuryKp.publicKey,
      toPubkey: winnerPubkey,
      lamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryKp.publicKey;
  transaction.sign(treasuryKp);

  const sig = await connection.sendRawTransaction(transaction.serialize());
  console.log(`[Treasury] Payout of ${payoutAmount} SOL to ${winnerAddress}. Sig: ${sig}`);
  return sig;
}

export async function processRefund(playerAddresses, wagerAmount) {
  if (!TREASURY_PRIVATE_KEY) {
    console.warn('[Treasury] No private key, skipping real refund.');
    return;
  }

  const treasuryKp = Keypair.fromSecretKey(bs58.decode(TREASURY_PRIVATE_KEY));
  // Refund the original wager + the 5% upfront fee, minus 2500 lamports to cover the network fee perfectly
  const depositAmount = parseFloat(wagerAmount) * 1.05;
  const refundLamports = Math.round(depositAmount * LAMPORTS_PER_SOL) - 2500;
  
  const transaction = new Transaction();

  for (const address of playerAddresses) {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: treasuryKp.publicKey,
        toPubkey: new PublicKey(address),
        lamports: refundLamports,
      })
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryKp.publicKey;
  transaction.sign(treasuryKp);

  try {
    const sig = await connection.sendRawTransaction(transaction.serialize());
    console.log(`[Treasury] Refund of ${wagerAmount} SOL to ${playerAddresses.join(', ')}. Sig: ${sig}`);
  } catch (e) {
    console.error('[Treasury] Refund failed:', e);
  }
}
