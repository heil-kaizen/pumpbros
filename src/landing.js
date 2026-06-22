import { CHARACTERS } from './config.js';
import { SPRITE_FRAMES } from './frames.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Landing page loaded");

    // 1. Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
                // Close mobile menu if open
                const navlinks = document.getElementById('nav');
                if (navlinks && navlinks.classList.contains('open')) {
                    navlinks.classList.remove('open');
                }
            }
        });
    });

    // 2. Mobile burger menu
    const burger = document.getElementById('burger');
    const nav = document.getElementById('nav');
    if (burger && nav) {
        burger.addEventListener('click', () => {
            nav.classList.toggle('open');
        });
    }

    // 3. Copy CA address
    const copyBtn = document.getElementById('copyca');
    const caAddr = document.getElementById('ca');
    if (copyBtn && caAddr) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(caAddr.innerText).then(() => {
                const origText = copyBtn.innerText;
                copyBtn.innerText = 'COPIED!';
                setTimeout(() => { copyBtn.innerText = origText; }, 2000);
            });
        });
    }

    // 4. Render Free Fighters Roster FIRST so they exist in the DOM
    renderRoster();

    // 5. Reveal animations on scroll
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                
                // If it's a number stat, animate it
                if (entry.target.classList.contains('stat')) {
                    animateValue(entry.target);
                    observer.unobserve(entry.target);
                }
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => {
        observer.observe(el);
    });

    // 6. Fetch dynamic stats from Supabase backend
    fetchStats();

    // 7. FAQ accordion
    document.querySelectorAll('.q button').forEach(function(btn){
        btn.addEventListener('click',function(){
            var q=btn.parentElement,open=q.classList.contains('open');
            document.querySelectorAll('.q').forEach(function(x){x.classList.remove('open');});
            if(!open)q.classList.add('open');
        });
    });
});

// Animate numbers counting up
function animateValue(statEl) {
    const numEl = statEl.querySelector('.num');
    if (!numEl) return;
    
    const endVal = parseFloat(numEl.getAttribute('data-count'));
    const suffix = numEl.getAttribute('data-suffix') || '';
    const hasDec = numEl.getAttribute('data-dec') === '1';
    const duration = 2000;
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // ease out quad
        const easeOut = progress * (2 - progress);
        const current = endVal * easeOut;
        
        numEl.innerText = (hasDec ? current.toFixed(1) : Math.floor(current)) + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            numEl.innerText = (hasDec ? endVal.toFixed(1) : endVal) + suffix;
        }
    };
    window.requestAnimationFrame(step);
}

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        
        // Match the text labels to the data
        const statBoxes = document.querySelectorAll('.stat');
        statBoxes.forEach(box => {
            const lbl = box.querySelector('.lbl')?.innerText || '';
            const numEl = box.querySelector('.num');
            if (!numEl) return;
            
            if (lbl.includes('BATTLES')) {
                numEl.setAttribute('data-count', stats.battles);
            } else if (lbl.includes('ACTIVE BROS')) {
                numEl.setAttribute('data-count', stats.players);
            } else if (lbl.includes('PRIZE POOL')) {
                numEl.setAttribute('data-count', stats.prizePool);
            } else if (lbl.includes('SETTLE TIME')) {
                numEl.setAttribute('data-count', stats.avgSettleTime);
            }
            
            // Re-animate if already in view
            if (box.classList.contains('in')) {
                animateValue(box);
            }
        });
    } catch (e) {
        console.error('Failed to fetch stats:', e);
    }
}

function renderRoster() {
    const rosterDiv = document.getElementById('roster');
    if (!rosterDiv) return;

    // Get free characters
    const freeChars = CHARACTERS.filter(c => !c.isStoreItem);

    // Keep ??? locked character at the end
    const lockedCharHtml = `
      <div class="fighter reveal" style="opacity:.85">
        <span class="tier" style="background:var(--ink);color:var(--yellow)">?</span>
        <div class="portrait" style="background:#1c2a18">
          <svg viewBox="0 0 64 72" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
            <rect x="24" y="20" width="16" height="16" fill="#ffce1f"/><rect x="28" y="36" width="8" height="6" fill="#ffce1f"/><rect x="29" y="50" width="6" height="6" fill="#ffce1f"/>
            <rect x="28" y="24" width="8" height="3" fill="#1c2a18"/>
          </svg>
        </div>
        <h4>??? ???</h4><span class="role">Unlocks S2</span>
        <div class="bar hp"><span class="k">HP</span><div class="track"><div class="fill" data-w="50" style="width:50%; background:#555"></div></div></div>
        <div class="bar atk"><span class="k">ATK</span><div class="track"><div class="fill" data-w="50" style="width:50%; background:#555"></div></div></div>
        <div class="bar spd"><span class="k">SPD</span><div class="track"><div class="fill" data-w="50" style="width:50%; background:#555"></div></div></div>
      </div>
    `;

    rosterDiv.innerHTML = '';

    freeChars.forEach((c, index) => {
        // approximate stats based on mults
        const hpPct = Math.min(Math.round(c.weight), 100);
        const atkPct = Math.min(Math.round(c.dmgMult * 80), 100);
        const spdPct = Math.min(Math.round(c.speedMult * 80), 100);
        
        let tier = 'B';
        if (c.dmgMult > 1.1 || c.speedMult > 1.1) tier = 'A';
        if (c.weight > 100 && c.dmgMult >= 1.0) tier = 'S';

        let imgHtml = '';
        if (c.sprite) {
            const framesData = SPRITE_FRAMES[c.id];
            if (framesData && framesData[0] && framesData[0][0]) {
                const f = framesData[0][0];
                const rx = c.spriteRatioX || 1;
                const ry = c.spriteRatioY || 1;
                const sx = f.x * rx;
                const sy = f.y * ry;
                const sw = f.w * rx;
                const sh = f.h * ry;
                const charScale = c.spriteScale || 0.30;
                let uiMultiplier = 1.15; // Scale up slightly for roster view
                
                // Ensure they don't get taller than 90px
                const visualH = f.h * charScale * uiMultiplier;
                if (visualH > 90) {
                    uiMultiplier = 90 / (f.h * charScale);
                }

                const scaleX = (charScale * uiMultiplier) / rx;
                const scaleY = (charScale * uiMultiplier) / ry;
                
                const finalW = sw * scaleX;
                const finalH = sh * scaleY;
                
                imgHtml = `
                    <div style="width: 100%; height: 140px; display:flex; justify-content:center; align-items:flex-end; padding-bottom: 20px;">
                        <div style="width: ${finalW}px; height: ${finalH}px; position: relative; animation:bob 2.4s ease-in-out infinite;">
                            <div style="width: ${sw}px; height: ${sh}px; overflow: hidden; position: absolute; left: 0; top: 0; transform: scale(${scaleX}, ${scaleY}); transform-origin: top left;">
                                <img src="${c.sprite}" style="position: absolute; left: -${sx}px; top: -${sy}px; image-rendering: pixelated; max-width: none;" />
                            </div>
                        </div>
                    </div>
                `;
            } else {
                imgHtml = `<img src="${c.sprite}" style="height:140px; width:auto; animation:bob 2.4s ease-in-out infinite; image-rendering: pixelated;" />`;
            }
        } else {
            imgHtml = `<div style="width:64px;height:72px;background:${c.palette.body}"></div>`;
        }

        rosterDiv.innerHTML += `
        <div class="fighter reveal">
            <span class="tier">${tier}</span>
            <div class="portrait">
                ${imgHtml}
            </div>
            <h4>${c.name}</h4><span class="role">${c.special === 'projectile' ? 'Zoner' : 'Brawler'}</span>
            <div class="bar hp"><span class="k">HP</span><div class="track"><div class="fill" style="width:${hpPct}%"></div></div></div>
            <div class="bar atk"><span class="k">ATK</span><div class="track"><div class="fill" style="width:${atkPct}%"></div></div></div>
            <div class="bar spd"><span class="k">SPD</span><div class="track"><div class="fill" style="width:${spdPct}%"></div></div></div>
        </div>
        `;
    });
}
