import { sfx } from './audio.js';

export function initUI() {
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  const btnHelp = document.getElementById('btn-help');
  const modalLeaderboard = document.getElementById('leaderboard-modal');
  const modalHelp = document.getElementById('help-modal');
  const closeLeaderboard = document.getElementById('leaderboard-close');
  const closeHelp = document.getElementById('help-close');

  const tabLocal = document.getElementById('tab-local');
  const tabOnline = document.getElementById('tab-online');
  const lbList = document.getElementById('leaderboard-list');

  let currentTab = 'local';
  let lbData = { local: [], online: [] };

  function openModal(modal) {
    sfx.select();
    modal.classList.remove('hidden');
    if (window.gameInstance) window.gameInstance.popup = { htmlModal: true }; 
  }

  function closeModal(modal) {
    sfx.back();
    modal.classList.add('hidden');
    if (window.gameInstance) window.gameInstance.popup = null;
  }

  btnLeaderboard?.addEventListener('click', () => {
    openModal(modalLeaderboard);
    fetchLeaderboards();
  });

  btnHelp?.addEventListener('click', () => {
    openModal(modalHelp);
  });

  closeLeaderboard?.addEventListener('click', () => closeModal(modalLeaderboard));
  closeHelp?.addEventListener('click', () => closeModal(modalHelp));

  // Tabs
  tabLocal?.addEventListener('click', () => {
    sfx.select();
    currentTab = 'local';
    tabLocal.classList.add('opacity-100');
    tabLocal.classList.remove('opacity-50');
    tabOnline.classList.add('opacity-50');
    tabOnline.classList.remove('opacity-100');
    renderLeaderboard();
  });

  tabOnline?.addEventListener('click', () => {
    sfx.select();
    currentTab = 'online';
    tabOnline.classList.add('opacity-100');
    tabOnline.classList.remove('opacity-50');
    tabLocal.classList.add('opacity-50');
    tabLocal.classList.remove('opacity-100');
    renderLeaderboard();
  });

  function fetchLeaderboards() {
    lbList.innerHTML = '<div class="text-center py-10">Loading...</div>';
    fetch('/api/leaderboards')
      .then(res => res.json())
      .then(data => {
        lbData = data;
        renderLeaderboard();
      })
      .catch(err => {
        console.error(err);
        lbList.innerHTML = '<div class="text-center py-10 text-red-500">Failed to load</div>';
      });
  }

  function renderLeaderboard() {
    lbList.innerHTML = '';
    const data = lbData[currentTab];
    if (!data || data.length === 0) {
      lbList.innerHTML = '<div class="text-center py-10 text-[#6b4c2a]">No data available.</div>';
      return;
    }

    data.forEach((entry, i) => {
      const item = document.createElement('div');
      // Match aesthetic: beige background, darker border
      const bgColors = ['bg-[#e8b543]', 'bg-[#d1d5db]', 'bg-[#d97706]']; // gold, silver, bronze for top 3
      const rankBg = i < 3 ? bgColors[i] : 'bg-[#a37e42]';
      const score = currentTab === 'local' ? entry.local_wins : entry.online_winnings.toFixed(2);
      const name = entry.username || `${entry.wallet_address.slice(0,4)}...${entry.wallet_address.slice(-4)}`;

      item.className = `flex items-center justify-between border-[2px] border-[#6b4c2a] p-1 mb-1 ${i % 2 === 0 ? 'bg-[#fefce8]' : 'bg-[#fffbeb]'}`;
      
      item.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="${rankBg} border-[2px] border-[#6b4c2a] w-8 h-8 flex items-center justify-center font-bold font-pixel text-[10px] shadow-[1px_1px_0_0_#4a3f2d] text-white">
            ${i + 1}${i===0?'st':i===1?'nd':i===2?'rd':'th'}
          </div>
          <div class="flex flex-col">
            <span class="font-bold font-pixel text-[8px] sm:text-[10px] text-[#4a3f2d] truncate max-w-[150px] leading-none">${name}</span>
            <span class="text-[6px] sm:text-[8px] font-pixel text-[#6b4c2a] mt-1 leading-none">Lv. ${(currentTab === 'local' ? entry.local_wins : Math.floor(entry.online_winnings)) || 1}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div class="bg-[#f5d061] border-[2px] border-[#6b4c2a] px-2 py-1 font-bold font-pixel text-[8px] sm:text-[10px] text-[#4a3f2d] shadow-[1px_1px_0_0_#4a3f2d]">
            ${score}
          </div>
        </div>
      `;
      lbList.appendChild(item);
    });
  }
}
