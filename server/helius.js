const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

export async function checkHeliusToken(walletAddress, tokenMintAddress, requiredAmount) {
  if (!HELIUS_API_KEY || !tokenMintAddress) {
    console.warn('[Helius] API key or token mint address not configured. Bypassing token gate.');
    return true; // Bypass check for testing
  }

  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: tokenMintAddress },
          { encoding: 'jsonParsed' },
        ],
      }),
    });

    const data = await response.json();
    if (!data.result || data.result.value.length === 0) {
      return false;
    }

    const tokenAmount = data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return tokenAmount >= requiredAmount;
  } catch (err) {
    console.error('[Helius] Token check failed:', err);
    return false; // Fail secure
  }
}
