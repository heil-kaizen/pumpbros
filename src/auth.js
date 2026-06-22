import { wallet } from './wallet.js';

document.addEventListener('DOMContentLoaded', () => {
    const btnConnect = document.getElementById('btn-connect');
    const btnStart = document.getElementById('btn-start');
    const inputUsername = document.getElementById('username');
    const statusArea = document.getElementById('auth-status');

    let isWalletConnected = false;

    const showStatus = (msg, isError = false) => {
        statusArea.textContent = msg;
        statusArea.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'border-red-400', 'bg-green-100', 'text-green-700', 'border-green-400');
        if (isError) {
            statusArea.classList.add('bg-red-100', 'text-red-700', 'border-red-400');
        } else {
            statusArea.classList.add('bg-green-100', 'text-green-700', 'border-green-400');
        }
    };

    btnConnect.addEventListener('click', async () => {
        const username = inputUsername.value.trim();
        if (!username) {
            showStatus('Please enter a fighter name first!', true);
            return;
        }

        const phantom = wallet.getAllWallets().find(w => w.name === 'Phantom');
        if (!phantom || phantom.readyState === 'NotDetected') {
            showStatus('Phantom wallet not detected. Please install Phantom extension.', true);
            return;
        }

        btnConnect.disabled = true;
        btnConnect.innerHTML = 'Connecting...';
        showStatus('Please sign the message in your wallet...');

        try {
            await wallet.connect(phantom, username);
            
            if (wallet.authenticated) {
                isWalletConnected = true;
                showStatus('Wallet connected and verified! Ready to play.', false);
                btnConnect.style.display = 'none';
                inputUsername.disabled = true;
            } else {
                showStatus(wallet.error || 'Authentication failed. Do you have 100k tokens?', true);
                btnConnect.disabled = false;
                btnConnect.textContent = 'Connect Wallet';
            }
        } catch (err) {
            showStatus(err.message || 'Failed to connect.', true);
            btnConnect.disabled = false;
            btnConnect.textContent = 'Connect Wallet';
        }
    });

    btnStart.addEventListener('click', () => {
        if (!isWalletConnected) {
            showStatus('Please connect your wallet first.', true);
            return;
        }
        
        // Redirect to the game
        window.location.href = '/game.html';
    });
});
