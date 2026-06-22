// ============================================================================
//  Wallet UI — bridges wallet.js with the HTML wallet modal overlay.
//  Handles showing/hiding the modal, populating the wallet list,
//  and connecting when a wallet is clicked.
// ============================================================================
import { wallet } from './wallet.js';

const modalEl = document.getElementById('wallet-modal');
const listEl = document.getElementById('wallet-list');
const noWalletsEl = document.getElementById('wallet-no-wallets');
const closeBtn = document.getElementById('wallet-modal-close');
const backdropEl = modalEl?.querySelector('.wallet-modal-backdrop');

/** Whether the modal is currently visible */
let modalOpen = false;

// ---- Show / Hide ------------------------------------------------------------

export function showWalletModal() {
  if (!modalEl) return;
  populateWalletList();
  modalEl.classList.remove('hidden');
  modalOpen = true;
}

export function hideWalletModal() {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  modalOpen = false;
}

export function isModalOpen() {
  return modalOpen;
}

// ---- Populate wallet list ---------------------------------------------------

function populateWalletList() {
  if (!listEl || !noWalletsEl) return;

  const available = wallet.getAvailableWallets();
  const all = wallet.getAllWallets();

  // Use available wallets if any, otherwise show all (with "Not Installed" badges)
  const display = available.length > 0 ? available : all;

  listEl.innerHTML = '';

  if (display.length === 0) {
    listEl.classList.add('hidden');
    noWalletsEl.classList.remove('hidden');
    return;
  }

  listEl.classList.remove('hidden');
  noWalletsEl.classList.add('hidden');

  for (const adapter of display) {
    const item = document.createElement('div');
    item.className = 'wallet-list-item';

    const icon = document.createElement('img');
    icon.className = 'wallet-list-item-icon';
    icon.src = adapter.icon || '';
    icon.alt = adapter.name;
    icon.onerror = () => {
      // Fallback: show a colored circle if icon fails to load
      icon.style.display = 'none';
      const fallback = document.createElement('div');
      fallback.style.cssText = 'width:36px;height:36px;border-radius:6px;background:#334155;display:flex;align-items:center;justify-content:center;color:#fbbf24;font-weight:bold;font-size:18px;';
      fallback.textContent = adapter.name.charAt(0);
      item.insertBefore(fallback, item.firstChild);
    };

    const name = document.createElement('span');
    name.className = 'wallet-list-item-name';
    name.textContent = adapter.name.toUpperCase();

    const status = document.createElement('span');
    status.className = 'wallet-list-item-status';
    const isInstalled = adapter.readyState === 'Installed' || adapter.readyState === 'Loadable';
    status.textContent = isInstalled ? 'READY' : 'NOT FOUND';
    if (!isInstalled) {
      status.style.color = '#94a3b8';
    }

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(status);

    item.addEventListener('click', async () => {
      if (!isInstalled) {
        // Open the wallet's URL if available
        if (adapter.url) window.open(adapter.url, '_blank');
        return;
      }
      item.style.opacity = '0.5';
      item.style.pointerEvents = 'none';
      status.textContent = 'CONNECTING...';
      status.style.color = '#fbbf24';

      await wallet.connect(adapter);

      if (wallet.authenticated) {
        hideWalletModal();
      } else {
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
        status.textContent = wallet.error || 'FAILED';
        status.style.color = '#ef4444';
        setTimeout(() => {
          status.textContent = 'READY';
          status.style.color = '#4ade80';
        }, 3000);
      }
    });

    listEl.appendChild(item);
  }
}

// ---- Event listeners --------------------------------------------------------

closeBtn?.addEventListener('click', () => hideWalletModal());
backdropEl?.addEventListener('click', () => hideWalletModal());

// ESC key closes the modal (we listen on the modal itself)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen) {
    e.stopPropagation();
    hideWalletModal();
  }
});
