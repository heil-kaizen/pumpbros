import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function getOrCreateUser(walletAddress) {
  if (!supabase) {
    console.warn('[Supabase] Not configured. Mocking database interaction.');
    return { id: walletAddress, wallet_address: walletAddress, username: null, local_wins: 0, online_winnings: 0 };
  }

  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (!user && (error?.code === 'PGRST116' || !error)) {
    // User does not exist, create them
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ wallet_address: walletAddress }])
      .select()
      .single();
    
    if (insertError) {
      console.error('[Supabase] Insert error:', insertError);
      throw insertError;
    }
    user = newUser;
  } else if (error) {
    console.error('[Supabase] Select error:', error);
    throw error;
  }

  return user;
}

export async function getOwnedCharacters(walletAddress) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('owned_characters')
    .select('character_id')
    .eq('wallet_address', walletAddress);

  if (error) {
    console.error('[Supabase] getOwnedCharacters error:', error);
    return [];
  }
  return data.map(d => d.character_id);
}

export async function purchaseCharacter(walletAddress, characterId, signature) {
  if (!supabase) return true;
  const { error } = await supabase
    .from('owned_characters')
    .insert([{ 
      wallet_address: walletAddress, 
      character_id: characterId,
      purchase_signature: signature 
    }]);

  if (error) {
    console.error('[Supabase] purchaseCharacter error:', error);
    throw error;
  }
  return true;
}

export async function updateUsername(walletAddress, username) {
  if (!supabase) return { success: true };
  
  // Check if username is already taken
  const { data: existing } = await supabase
    .from('users')
    .select('wallet_address')
    .eq('username', username)
    .single();
    
  if (existing && existing.wallet_address !== walletAddress) {
    throw new Error('Username is already taken');
  }

  const { error } = await supabase
    .from('users')
    .update({ username })
    .eq('wallet_address', walletAddress);

  if (error) {
    console.error('[Supabase] updateUsername error:', error);
    throw error;
  }
  return { success: true };
}

export async function incrementLocalWins(walletAddress) {
  if (!supabase) return;
  
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('local_wins')
    .eq('wallet_address', walletAddress)
    .single();
    
  if (fetchErr) return;

  const { error: updateErr } = await supabase
    .from('users')
    .update({ local_wins: (user.local_wins || 0) + 1 })
    .eq('wallet_address', walletAddress);

  if (updateErr) {
    console.error('[Supabase] incrementLocalWins error:', updateErr);
  }
}

export async function addOnlineWinnings(walletAddress, amount) {
  if (!supabase) return;
  
  const { data: user, error: fetchErr } = await supabase
    .from('users')
    .select('online_winnings')
    .eq('wallet_address', walletAddress)
    .single();
    
  if (fetchErr) return;

  const { error: updateErr } = await supabase
    .from('users')
    .update({ online_winnings: (user.online_winnings || 0) + parseFloat(amount) })
    .eq('wallet_address', walletAddress);

  if (updateErr) {
    console.error('[Supabase] addOnlineWinnings error:', updateErr);
  }
}

export async function getLeaderboards() {
  if (!supabase) return { local: [], online: [] };

  const { data: localData } = await supabase
    .from('users')
    .select('username, wallet_address, local_wins')
    .order('local_wins', { ascending: false })
    .limit(10);

  const { data: onlineData } = await supabase
    .from('users')
    .select('username, wallet_address, online_winnings')
    .order('online_winnings', { ascending: false })
    .limit(10);

  return {
    local: localData || [],
    online: onlineData || []
  };
}

export async function getGlobalStats() {
  if (!supabase) return { battles: 0, players: 0, prizePool: 0, avgSettleTime: 400 };

  try {
    // Get count of players
    const { count: players, error: countErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Get total battles (sum of local_wins as a proxy for battles fought)
    const { data: winData, error: winErr } = await supabase
      .from('users')
      .select('local_wins');

    let battles = 0;
    if (!winErr && winData) {
      battles = winData.reduce((acc, user) => acc + (user.local_wins || 0), 0);
    }

    const avgSettleTime = 400;

    return { 
      battles: battles, 
      players: players || 0, 
      prizePool: 0, 
      avgSettleTime: avgSettleTime 
    };
  } catch (err) {
    console.error('[Supabase] getGlobalStats error:', err);
    return { battles: 0, players: 0, prizePool: 0, avgSettleTime: 400 };
  }
}
