// ═══════════════════════════════════════════════════════════════════════
//  MarketPulse Pro — 8-Strategy Confluence Engine
//
//  Price Data : Binance REST + WebSocket (crypto & forex pairs)
//               Kraken REST (JPY, CAD, CHF, EUR/JPY pairs)
//  News       : Finnhub (if key set) → CryptoCompare fallback (always free)
//  Analysis   : 8 independent strategies, weighted master signal
//  TP/SL/Entry: Computed ONCE in computeMasterSignal(), shared everywhere
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  FULL-PAGE ACCESS GATE
//  — The entire website is hidden behind this login wall.
//  — Nobody sees any content until valid credentials are entered.
//  — Sessions stored securely in localStorage (7-day expiry if "remember me").
//  — Credentials verified via SHA-256 — never stored as plaintext.
//
//  ✅ YOUR CREDENTIALS:
//     Username : MarketPulseFounder
//     Password : MP@Founder2024!
//
//  To change credentials, update the two hash constants below.
//  Generate new hashes at: https://emn178.github.io/online-tools/sha256.html
// ═══════════════════════════════════════════════════════════════════════

const USERS = [
    {
        usernameHash: '01a402b933c5457e6eb3e8a12edcd8f4ee006e0c4bc031e70f50fcace2ec3993', // Kavindu
        passwordHash: '0f727180cb26001005264559844a251bf4029d6984ca2c1d6bf940bce0e7a85e'  // vishwa2004
    },
    {
        usernameHash: 'fdf8ce725e42e2d263a1e732d8ca206d1f63d333f3a57c98e2a652211ab9d760', // Imanka
        passwordHash: '24464f2723864803c065c9766c0717a31b379a3af94005a59a08be483fc9308d'  //imanka1
    }
];
const _SESSION_KEY    = 'mp_pro_session';
const _SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

let _rememberMe = false;
let _loginLocked = false; // rate-limit brute force

// ── SHA-256 helper ────────────────────────────────────────────────────
async function _sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── Session check — runs immediately on page load ─────────────────────
(function checkSession() {
    try {
        const raw = localStorage.getItem(_SESSION_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            if (s.expires > Date.now() && s.valid === true) {
                // Valid session — reveal site immediately, no flash
                grantAccess(s.username, false);
                return;
            }
            localStorage.removeItem(_SESSION_KEY); // expired — clear it
        }
    } catch(e) { localStorage.removeItem(_SESSION_KEY); }
    // No valid session — show the gate, keep site hidden
    setTimeout(() => { const u = document.getElementById('gateUser'); if(u) u.focus(); }, 300);
})();

// ── Toggle password visibility ────────────────────────────────────────
function togglePassVis() {
    const inp  = document.getElementById('gatePass');
    const icon = document.getElementById('passEyeIcon');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    if (icon) icon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

// ── Toggle "remember me" checkbox ────────────────────────────────────
function toggleRemember() {
    _rememberMe = !_rememberMe;
    const box   = document.getElementById('rememberBox');
    const check = document.getElementById('rememberCheck');
    if (box)   box.style.background   = _rememberMe ? 'rgba(0,212,255,0.15)' : '#060b14';
    if (box)   box.style.borderColor  = _rememberMe ? '#00d4ff' : '#1a2540';
    if (check) check.style.display    = _rememberMe ? 'block' : 'none';
}

// ── Show error on the gate ────────────────────────────────────────────
function _gateError(msg) {
    const errBox = document.getElementById('gateError');
    const errMsg = document.getElementById('gateErrorMsg');
    const passEl = document.getElementById('gatePass');
    if (errMsg) errMsg.textContent = msg || 'Invalid username or password';
    if (errBox) { errBox.style.display = 'block'; }
    if (passEl) {
        passEl.value = '';
        passEl.style.borderColor = '#ff3d5a';
        passEl.style.boxShadow   = '0 0 0 3px rgba(255,61,90,0.12)';
        setTimeout(() => {
            passEl.style.borderColor = '#1a2540';
            passEl.style.boxShadow   = 'none';
        }, 1800);
    }
    setTimeout(() => { if(errBox) errBox.style.display = 'none'; }, 4000);
}

// ── Attempt login ─────────────────────────────────────────────────────
async function attemptLogin() {
    if (_loginLocked) return;

    const uEl = document.getElementById('gateUser');
    const pEl = document.getElementById('gatePass');
    const u = (uEl?.value || '').trim();
    const p = (pEl?.value || '').trim();

    if (!u || !p) { _gateError('Please enter both username and password'); return; }

    // Show loading state
    const btnText = document.getElementById('gateBtnText');
    const btnLoad = document.getElementById('gateBtnLoad');
    const btn     = document.getElementById('gateLoginBtn');
    if (btnText) btnText.style.display = 'none';
    if (btnLoad) btnLoad.style.display = 'inline';
    if (btn)     btn.disabled = true;

    const [hu, hp] = await Promise.all([_sha256(u), _sha256(p)]);

    if (hu === _AUTH_HASH_USER && hp === _AUTH_HASH_PASS) {
        // ✅ Correct — save session and reveal site
        if (_rememberMe) {
            localStorage.setItem(_SESSION_KEY, JSON.stringify({
                valid: true,
                username: u,
                expires: Date.now() + _SESSION_EXPIRY
            }));
        } else {
            // Session-only (cleared when tab closes)
            sessionStorage.setItem(_SESSION_KEY, JSON.stringify({ valid: true, username: u }));
        }
        grantAccess(u, true);
    } else {
        // ❌ Wrong credentials — rate limit for 3 seconds
        _loginLocked = true;
        setTimeout(() => { _loginLocked = false; }, 3000);
        if (btnText) btnText.style.display = 'inline';
        if (btnLoad) btnLoad.style.display = 'none';
        if (btn)     btn.disabled = false;
        _gateError('Invalid username or password');
        // Shake animation
        const card = document.querySelector('#accessGate > div > div:last-child');
        if (card) {
            card.style.animation = 'gateShake 0.4s ease';
            setTimeout(() => card.style.animation = '', 400);
        }
    }
}

// ── Reveal the site after successful auth ─────────────────────────────
function grantAccess(username, animate) {
    const gate    = document.getElementById('accessGate');
    const content = document.getElementById('siteContent');
    const userEl  = document.getElementById('sessionUsername');

    if (userEl) userEl.textContent = username;
    if (content) content.style.display = 'block';

    if (animate && gate) {
        gate.style.transition = 'opacity 0.5s ease';
        gate.style.opacity    = '0';
        setTimeout(() => { gate.style.display = 'none'; }, 520);
    } else if (gate) {
        gate.style.display = 'none';
    }
}

// ── Sign out ──────────────────────────────────────────────────────────
function logoutUser() {
    localStorage.removeItem(_SESSION_KEY);
    sessionStorage.removeItem(_SESSION_KEY);
    // Reload page — gate will show again
    location.reload();
}

// ── Inject shake keyframe CSS ─────────────────────────────────────────
(function injectShakeCSS() {
    const s = document.createElement('style');
    s.textContent = `@keyframes gateShake {
        0%,100%{transform:translateX(0)}
        20%{transform:translateX(-8px)}
        40%{transform:translateX(8px)}
        60%{transform:translateX(-5px)}
        80%{transform:translateX(5px)}
    }`;
    document.head.appendChild(s);
})();

// Also check sessionStorage for non-remember sessions
(function checkSessionStorage() {
    try {
        const raw = sessionStorage.getItem(_SESSION_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            if (s.valid === true) grantAccess(s.username, false);
        }
    } catch(e) {}
})();

// ─── OPTIONAL FINNHUB KEY ─────────────────────────────────────────────
// Paste your free Finnhub key here for better news coverage.
// Get one free at https://finnhub.io/register
// Leave empty string to use CryptoCompare (always works, crypto-only news)
const FINNHUB_KEY = localStorage.getItem('mp_fh_key') || '';

function saveFinnhubKey() {
    const k = ($('fhKeyInput').value || '').trim();
    if (k.length > 6) {
        localStorage.setItem('mp_fh_key', k);
        location.reload();
    }
}
function openSettings() {
    const p = $('settingsPanel');
    if (p) { p.classList.toggle('hidden'); $('fhKeyInput').value = FINNHUB_KEY; }
}

// ─── ASSET REGISTRY ───────────────────────────────────────────────────
const ASSETS = {
    'BTCUSDT':  { type:'binance', name:'Bitcoin',    sym:'BTC/USD', logo:'https://cryptologos.cc/logos/bitcoin-btc-logo.png',       volLabel:'Vol (BTC)', decimals:2 },
    'ETHUSDT':  { type:'binance', name:'Ethereum',   sym:'ETH/USD', logo:'https://cryptologos.cc/logos/ethereum-eth-logo.png',      volLabel:'Vol (ETH)', decimals:2 },
    'SOLUSDT':  { type:'binance', name:'Solana',     sym:'SOL/USD', logo:'https://cryptologos.cc/logos/solana-sol-logo.png',        volLabel:'Vol (SOL)', decimals:2 },
    'BNBUSDT':  { type:'binance', name:'BNB',        sym:'BNB/USD', logo:'https://cryptologos.cc/logos/bnb-bnb-logo.png',           volLabel:'Vol (BNB)', decimals:2 },
    'XRPUSDT':  { type:'binance', name:'Ripple',     sym:'XRP/USD', logo:'https://cryptologos.cc/logos/xrp-xrp-logo.png',          volLabel:'Vol (XRP)', decimals:4 },
    'EURUSDT':  { type:'binance', name:'EUR/USD',    sym:'EUR/USD', logo:'https://flagcdn.com/w80/eu.png',                          volLabel:'Volume',    decimals:4 },
    'GBPUSDT':  { type:'binance', name:'GBP/USD',    sym:'GBP/USD', logo:'https://flagcdn.com/w80/gb.png',                          volLabel:'Volume',    decimals:4 },
    'AUDUSDT':  { type:'binance', name:'AUD/USD',    sym:'AUD/USD', logo:'https://flagcdn.com/w80/au.png',                          volLabel:'Volume',    decimals:4 },
    'NZDUSDT':  { type:'binance', name:'NZD/USD',    sym:'NZD/USD', logo:'https://flagcdn.com/w80/nz.png',                          volLabel:'Volume',    decimals:4 },
    'USDJPY':   { type:'kraken',  name:'USD/JPY',    sym:'USD/JPY', logo:'https://flagcdn.com/w80/jp.png',                          volLabel:'Volume',    decimals:3, krakenId:'USDJPY' },
    'USDCAD':   { type:'kraken',  name:'USD/CAD',    sym:'USD/CAD', logo:'https://flagcdn.com/w80/ca.png',                          volLabel:'Volume',    decimals:4, krakenId:'USDCAD' },
    'USDCHF':   { type:'kraken',  name:'USD/CHF',    sym:'USD/CHF', logo:'https://flagcdn.com/w80/ch.png',                          volLabel:'Volume',    decimals:4, krakenId:'USDCHF' },
    'EURJPY':   { type:'kraken',  name:'EUR/JPY',    sym:'EUR/JPY', logo:'https://flagcdn.com/w80/eu.png',                          volLabel:'Volume',    decimals:3, krakenId:'EURJPY' },

};

// Kraken interval map
const KRAKEN_IV = iv => ({'5m':'5','15m':'15','1h':'60','4h':'240','1d':'1440'}[iv] || '240');

// ─── TRADINGVIEW SYMBOL MAP ───────────────────────────────────────────
const TV_SYMBOLS = {
    'BTCUSDT': { chart:'BINANCE:BTCUSDT', ta:'BINANCE:BTCUSDT' },
    'ETHUSDT': { chart:'BINANCE:ETHUSDT', ta:'BINANCE:ETHUSDT' },
    'SOLUSDT': { chart:'BINANCE:SOLUSDT', ta:'BINANCE:SOLUSDT' },
    'BNBUSDT': { chart:'BINANCE:BNBUSDT', ta:'BINANCE:BNBUSDT' },
    'XRPUSDT': { chart:'BINANCE:XRPUSDT', ta:'BINANCE:XRPUSDT' },
    'EURUSDT': { chart:'FX:EURUSD',       ta:'FX:EURUSD'       },
    'GBPUSDT': { chart:'FX:GBPUSD',       ta:'FX:GBPUSD'       },
    'AUDUSDT': { chart:'FX:AUDUSD',       ta:'FX:AUDUSD'       },
    'NZDUSDT': { chart:'FX:NZDUSD',       ta:'FX:NZDUSD'       },
    'USDJPY':  { chart:'FX:USDJPY',       ta:'FX:USDJPY'       },
    'USDCAD':  { chart:'FX:USDCAD',       ta:'FX:USDCAD'       },
    'USDCHF':  { chart:'FX:USDCHF',       ta:'FX:USDCHF'       },
    'EURJPY':  { chart:'FX:EURJPY',       ta:'FX:EURJPY'       },

};

// TV interval map
const TV_IV = iv => ({'5m':'5','15m':'15','1h':'60','4h':'240','1d':'D'}[iv]||'240');

// ─── STATE ────────────────────────────────────────────────────────────
let currentSymbol    = 'BTCUSDT';
let currentInterval  = '4h';
let latestClosePrice = 0;
let activeWebSocket  = null;
let wsReconnectTimer = null;
let statsInterval    = null;
let histInterval     = null;
let newsInterval     = null;
let prevPrice        = 0;
let lastSignalKey    = '';
let soundEnabled     = false;
let audioCtx         = null;
// layerVisible removed — TradingView handles chart layers natively

// ─── PRICE BRIDGE — SYMBOL-SAFE ──────────────────────────────────────
// The TradingView ticker tape broadcasts prices for ALL symbols via postMessage.
// There is no reliable way to know WHICH symbol a given postMessage belongs to,
// so reading from it caused EUR/USD to show BTC prices (e.g. 251.95 → wrong).
// Bridge is disabled. Price authority: WebSocket tick → REST candle close.
// Both are fetched for the exact currentSymbol — always accurate.
let tvBridgePrice  = 0;
let tvBridgeActive = false;

function getCanonicalPrice() {
    // latestClosePrice is always set by updatePriceUI() from the correct symbol feed
    return latestClosePrice > 0 ? latestClosePrice : 0;
}

function resetTVBridge() {
    tvBridgePrice  = 0;
    tvBridgeActive = false;
}

// ─── HELPERS ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function safeText(id, val) { const el=$(id); if(el) el.textContent = val; }
function fmtPrice(p, dec) {
    if(p === null || p === undefined || isNaN(p)) return '--';
    return p.toLocaleString(undefined, { minimumFractionDigits:dec, maximumFractionDigits:dec });
}

// ─── SOUND ────────────────────────────────────────────────────────────
function toggleSound() {
    soundEnabled = !soundEnabled;
    const icon=$('soundIcon'), btn=$('soundToggle');
    if(soundEnabled) { icon.className='fa-solid fa-bell'; btn.classList.add('on'); playTone(440,'sine',0.1,0.15); }
    else             { icon.className='fa-solid fa-bell-slash'; btn.classList.remove('on'); }
}
function playTone(freq, type, vol, dur) {
    try {
        if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o=audioCtx.createOscillator(), g=audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type=type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
        g.gain.setValueAtTime(vol, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+dur);
        o.start(); o.stop(audioCtx.currentTime+dur);
    } catch(e) {}
}
function playSignalSound(type) {
    if(!soundEnabled) return;
    if(type==='buy')  { playTone(523,'sine',0.18,0.12); setTimeout(()=>playTone(659,'sine',0.18,0.15),130); setTimeout(()=>playTone(784,'sine',0.18,0.22),280); }
    else if(type==='sell') { playTone(784,'sine',0.18,0.12); setTimeout(()=>playTone(659,'sine',0.18,0.15),130); setTimeout(()=>playTone(523,'sine',0.18,0.22),280); }
    else { playTone(440,'triangle',0.1,0.2); }
}

// ─── TOAST ────────────────────────────────────────────────────────────
function showToast(word, sub, color) {
    const t=$('signalToast'), inner=$('toastInner');
    safeText('toastText', word); safeText('toastSub', sub);
    if(inner && color) inner.style.borderColor = color;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 5000);
}

// ═══════════════════════════════════════════════════════════════════════
//  MATH ENGINE
// ═══════════════════════════════════════════════════════════════════════
function calcEMA(data, period) {
    if(data.length < period) return Array(data.length).fill(null);
    const k = 2/(period+1), result = Array(period-1).fill(null);
    let ema = data.slice(0,period).reduce((a,b)=>a+b,0)/period;
    result.push(ema);
    for(let i=period; i<data.length; i++) { ema = data[i]*k + ema*(1-k); result.push(ema); }
    return result;
}
function calcSMA(data, period) {
    return data.map((_,i) => i<period-1 ? null : data.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period);
}
function calcRSI(data, period=14) {
    if(data.length < period+1) return 50;
    let ag=0, al=0;
    for(let i=1; i<=period; i++) { const d=data[i]-data[i-1]; if(d>0) ag+=d; else al+=Math.abs(d); }
    ag/=period; al/=period;
    for(let i=period+1; i<data.length; i++) {
        const d=data[i]-data[i-1];
        ag=(ag*(period-1)+Math.max(d,0))/period;
        al=(al*(period-1)+Math.max(-d,0))/period;
    }
    return al===0 ? 100 : 100-100/(1+ag/al);
}
function calcRSISeries(data, period=14) {
    const result = Array(period).fill(null);
    let ag=0, al=0;
    for(let i=1; i<=period; i++) { const d=data[i]-data[i-1]; if(d>0) ag+=d; else al+=Math.abs(d); }
    ag/=period; al/=period;
    result.push(al===0 ? 100 : 100-100/(1+ag/al));
    for(let i=period+1; i<data.length; i++) {
        const d=data[i]-data[i-1];
        ag=(ag*(period-1)+Math.max(d,0))/period;
        al=(al*(period-1)+Math.max(-d,0))/period;
        result.push(al===0 ? 100 : 100-100/(1+ag/al));
    }
    return result;
}
function calcMACD(data, fast=12, slow=26, signal=9) {
    const ef=calcEMA(data,fast), es=calcEMA(data,slow);
    const ml=ef.map((v,i)=>(v!==null&&es[i]!==null)?v-es[i]:null);
    const valid=ml.filter(v=>v!==null);
    const sr=calcEMA(valid,signal);
    const sl=Array(ml.length-valid.length).fill(null).concat(sr);
    return { macdLine:ml, signalLine:sl, histogram:ml.map((v,i)=>(v!==null&&sl[i]!==null)?v-sl[i]:null) };
}
function calcBollingerBands(data, period=20, mult=2) {
    const sma=calcSMA(data,period), upper=[], lower=[];
    for(let i=0; i<data.length; i++) {
        if(i<period-1) { upper.push(null); lower.push(null); continue; }
        const slice=data.slice(i-period+1,i+1), mean=sma[i];
        const std=Math.sqrt(slice.reduce((s,v)=>s+(v-mean)**2,0)/period);
        upper.push(mean+mult*std); lower.push(mean-mult*std);
    }
    return { upper, lower, mid:sma };
}
function calcATR(highs, lows, closes, period=14) {
    if(highs.length < 2) return 0;
    const trs=[];
    for(let i=1; i<highs.length; i++)
        trs.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
    return trs.slice(-period).reduce((a,b)=>a+b,0)/period;
}
function calcStochastic(highs, lows, closes, period=14) {
    const k=[];
    for(let i=0; i<closes.length; i++) {
        if(i<period-1) { k.push(null); continue; }
        const hi=Math.max(...highs.slice(i-period+1,i+1)), lo=Math.min(...lows.slice(i-period+1,i+1));
        k.push(hi===lo ? 50 : ((closes[i]-lo)/(hi-lo))*100);
    }
    const vk=k.filter(v=>v!==null), d=calcSMA(vk,3);
    return { k:vk[vk.length-1]??50, d:d[d.length-1]??50 };
}
function calcADX(highs, lows, closes, period=14) {
    if(closes.length < period+2) return { adx:20, plusDI:20, minusDI:20 };
    const trs=[], pDMs=[], mDMs=[];
    for(let i=1; i<highs.length; i++) {
        trs.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
        const up=highs[i]-highs[i-1], dn=lows[i-1]-lows[i];
        pDMs.push(up>dn&&up>0?up:0); mDMs.push(dn>up&&dn>0?dn:0);
    }
    const atrS=trs.slice(-period).reduce((a,b)=>a+b,0)/period;
    const pS=pDMs.slice(-period).reduce((a,b)=>a+b,0)/period;
    const mS=mDMs.slice(-period).reduce((a,b)=>a+b,0)/period;
    const pDI=atrS>0?(pS/atrS)*100:0, mDI=atrS>0?(mS/atrS)*100:0;
    return { adx:pDI+mDI>0?Math.abs(pDI-mDI)/(pDI+mDI)*100:0, plusDI:pDI, minusDI:mDI };
}
function calcOBV(closes, volumes) {
    if(!volumes || volumes.every(v=>v===0)) return null;
    const obv=[0];
    for(let i=1; i<closes.length; i++)
        obv.push(closes[i]>closes[i-1] ? obv[obv.length-1]+volumes[i] : closes[i]<closes[i-1] ? obv[obv.length-1]-volumes[i] : obv[obv.length-1]);
    return obv;
}
function calcWilliamsR(highs, lows, closes, period=14) {
    const n=closes.length; if(n<period) return -50;
    const hi=Math.max(...highs.slice(-period)), lo=Math.min(...lows.slice(-period));
    return hi===lo ? -50 : ((hi-closes[n-1])/(hi-lo))*-100;
}
function calcCCI(highs, lows, closes, period=20) {
    const tp=closes.map((_,i)=>(highs[i]+lows[i]+closes[i])/3);
    const last=tp.slice(-period), mean=last.reduce((a,b)=>a+b,0)/period;
    const mad=last.reduce((s,v)=>s+Math.abs(v-mean),0)/period;
    return mad===0 ? 0 : (tp[tp.length-1]-mean)/(0.015*mad);
}
function calcPivots(h, l, c) {
    const pp=(h+l+c)/3;
    return { pp, r1:2*pp-l, r2:pp+(h-l), s1:2*pp-h, s2:pp-(h-l) };
}
function calcIchimoku(highs, lows) {
    if(highs.length < 52) return null;
    const t9h=Math.max(...highs.slice(-9)), t9l=Math.min(...lows.slice(-9));
    const k26h=Math.max(...highs.slice(-26)), k26l=Math.min(...lows.slice(-26));
    const b52h=Math.max(...highs.slice(-52)), b52l=Math.min(...lows.slice(-52));
    const tenkan=(t9h+t9l)/2, kijun=(k26h+k26l)/2;
    const spanA=(tenkan+kijun)/2, spanB=(b52h+b52l)/2;
    return { tenkan, kijun, spanA, spanB, bullCloud:spanA>spanB, tkBull:tenkan>kijun };
}
function detectCandlePatterns(opens, highs, lows, closes) {
    const n=closes.length; if(n<3) return [];
    const patterns=[], i=n-1;
    const body=j=>Math.abs(closes[j]-opens[j]);
    const lw=j=>Math.min(closes[j],opens[j])-lows[j];
    const uw=j=>highs[j]-Math.max(closes[j],opens[j]);
    const bull=j=>closes[j]>opens[j], bear=j=>closes[j]<opens[j];
    if(lw(i)>body(i)*2 && uw(i)<body(i)*0.5 && body(i)>0) patterns.push({dir:'bull',name:'Hammer',strength:2,note:'Long lower wick — reversal signal'});
    if(uw(i)>body(i)*2 && lw(i)<body(i)*0.5 && body(i)>0) patterns.push({dir:'bear',name:'Shooting Star',strength:2,note:'Long upper wick — reversal at top'});
    if(n>=2&&bear(i-1)&&bull(i)&&closes[i]>opens[i-1]&&opens[i]<closes[i-1]) patterns.push({dir:'bull',name:'Bullish Engulfing',strength:3,note:'Full body reversal candle'});
    if(n>=2&&bull(i-1)&&bear(i)&&closes[i]<opens[i-1]&&opens[i]>closes[i-1]) patterns.push({dir:'bear',name:'Bearish Engulfing',strength:3,note:'Full body reversal candle'});
    if(body(i)<(highs[i]-lows[i])*0.1&&(highs[i]-lows[i])>0) patterns.push({dir:'neut',name:'Doji',strength:1,note:'Indecision — watch for direction'});
    if(n>=3&&bull(i)&&bull(i-1)&&bull(i-2)&&closes[i]>closes[i-1]&&closes[i-1]>closes[i-2]) patterns.push({dir:'bull',name:'Three White Soldiers',strength:3,note:'Strong uptrend confirmation'});
    if(n>=3&&bear(i)&&bear(i-1)&&bear(i-2)&&closes[i]<closes[i-1]&&closes[i-1]<closes[i-2]) patterns.push({dir:'bear',name:'Three Black Crows',strength:3,note:'Strong downtrend confirmation'});
    return patterns;
}

// ═══════════════════════════════════════════════════════════════════════
//  8 STRATEGIES
// ═══════════════════════════════════════════════════════════════════════
function scoreToDir(norm) {
    if(norm>=0.55)  return 'BUY';
    if(norm<=-0.55) return 'SELL';
    if(norm>=0.22)  return 'LEAN BUY';
    if(norm<=-0.22) return 'LEAN SELL';
    return 'HOLD';
}

function s1_Trend({price, ema20v, ema50v, ema200v, adx}) {
    let s=0; const notes=[];
    if(price>ema20v&&ema20v>ema50v)       { s+=2.5; notes.push('Bull stack: Price > EMA20 > EMA50'); }
    else if(price<ema20v&&ema20v<ema50v)  { s-=2.5; notes.push('Bear stack: Price < EMA20 < EMA50'); }
    else if(ema20v>ema50v)                { s+=1;   notes.push('EMA20 > EMA50 — uptrend intact'); }
    else                                  { s-=1;   notes.push('EMA20 < EMA50 — downtrend intact'); }
    if(ema200v) {
        if(price>ema200v) { s+=1; notes.push('Above EMA200 — long-term bull'); }
        else              { s-=1; notes.push('Below EMA200 — long-term bear'); }
    }
    if(adx.adx>30) {
        if(adx.plusDI>adx.minusDI) { s+=1.5; notes.push(`ADX ${adx.adx.toFixed(0)} — strong bull trend`); }
        else                        { s-=1.5; notes.push(`ADX ${adx.adx.toFixed(0)} — strong bear trend`); }
    } else if(adx.adx>20) {
        if(adx.plusDI>adx.minusDI) { s+=0.5; notes.push(`ADX ${adx.adx.toFixed(0)} — developing uptrend`); }
        else                        { s-=0.5; notes.push(`ADX ${adx.adx.toFixed(0)} — developing downtrend`); }
    } else notes.push(`ADX ${adx.adx.toFixed(0)} — ranging market`);
    const norm=Math.max(-1,Math.min(1,s/6));
    return {name:'Trend Following',icon:'fa-chart-line',color:'#00d4ff',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes,raw:s};
}

function s2_Momentum({rsi, stoch, williamsR, cci}) {
    let s=0; const notes=[];
    if(rsi<22)       { s+=3;   notes.push(`RSI ${rsi.toFixed(1)} — extreme oversold`); }
    else if(rsi<30)  { s+=2;   notes.push(`RSI ${rsi.toFixed(1)} — oversold zone`); }
    else if(rsi>78)  { s-=3;   notes.push(`RSI ${rsi.toFixed(1)} — extreme overbought`); }
    else if(rsi>70)  { s-=2;   notes.push(`RSI ${rsi.toFixed(1)} — overbought zone`); }
    else if(rsi>58)  { s+=1;   notes.push(`RSI ${rsi.toFixed(1)} — bullish momentum`); }
    else if(rsi<42)  { s-=1;   notes.push(`RSI ${rsi.toFixed(1)} — bearish momentum`); }
    else               notes.push(`RSI ${rsi.toFixed(1)} — neutral zone`);
    if(stoch.k<20&&stoch.k>stoch.d)      { s+=2; notes.push(`Stoch ${stoch.k.toFixed(0)} — oversold, K crossing D`); }
    else if(stoch.k>80&&stoch.k<stoch.d) { s-=2; notes.push(`Stoch ${stoch.k.toFixed(0)} — overbought, K crossing D`); }
    else if(stoch.k<25) { s+=1;   notes.push(`Stoch ${stoch.k.toFixed(0)} — oversold`); }
    else if(stoch.k>75) { s-=1;   notes.push(`Stoch ${stoch.k.toFixed(0)} — overbought`); }
    if(williamsR<-85)  { s+=1.5; notes.push(`W%R ${williamsR.toFixed(0)} — deeply oversold`); }
    else if(williamsR<-70) { s+=0.8; notes.push(`W%R ${williamsR.toFixed(0)} — oversold`); }
    else if(williamsR>-10) { s-=1.5; notes.push(`W%R ${williamsR.toFixed(0)} — deeply overbought`); }
    else if(williamsR>-25) { s-=0.8; notes.push(`W%R ${williamsR.toFixed(0)} — overbought`); }
    if(cci<-150)      { s+=1.5; notes.push(`CCI ${cci.toFixed(0)} — strong oversold`); }
    else if(cci<-100) { s+=0.8; notes.push(`CCI ${cci.toFixed(0)} — oversold`); }
    else if(cci>150)  { s-=1.5; notes.push(`CCI ${cci.toFixed(0)} — strong overbought`); }
    else if(cci>100)  { s-=0.8; notes.push(`CCI ${cci.toFixed(0)} — overbought`); }
    const norm=Math.max(-1,Math.min(1,s/9));
    return {name:'Momentum Oscillators',icon:'fa-gauge-high',color:'#a78bfa',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

function s3_MACD({macdLast, sigLast, histLast, prevHist, macdLine, signalLine}) {
    if(macdLast===null||sigLast===null) return {name:'MACD Crossover',icon:'fa-wave-square',color:'#fbbf24',dir:'HOLD',conf:0,notes:['Insufficient data'],raw:0};
    let s=0; const notes=[];
    const pm=macdLine[macdLine.length-2], ps=signalLine[signalLine.length-2];
    const freshBull=pm!==null&&ps!==null&&pm<=ps&&macdLast>sigLast;
    const freshBear=pm!==null&&ps!==null&&pm>=ps&&macdLast<sigLast;
    if(freshBull)           { s+=4; notes.push('🔔 Fresh bullish MACD crossover'); }
    else if(freshBear)      { s-=4; notes.push('🔔 Fresh bearish MACD crossover'); }
    else if(macdLast>sigLast) { s+=2; notes.push('MACD above signal — bullish'); }
    else                    { s-=2; notes.push('MACD below signal — bearish'); }
    if(macdLast>0) { s+=1; notes.push('MACD above zero — bull territory'); }
    else           { s-=1; notes.push('MACD below zero — bear territory'); }
    if(histLast!==null&&prevHist!==null) {
        if(histLast>0&&histLast>prevHist)     { s+=1.5; notes.push('Histogram expanding bullish'); }
        else if(histLast<0&&histLast<prevHist){ s-=1.5; notes.push('Histogram expanding bearish'); }
        else if(histLast>0)   notes.push('Histogram shrinking — bull exhaustion possible');
        else                  notes.push('Histogram shrinking — bear exhaustion possible');
    }
    const norm=Math.max(-1,Math.min(1,s/6.5));
    return {name:'MACD Crossover',icon:'fa-wave-square',color:'#fbbf24',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

function s4_Bollinger({price, bbUpV, bbLoV, bbMidV, bbWidth, closes}) {
    if(!bbUpV||!bbLoV) return {name:'Bollinger Bands',icon:'fa-circle-dot',color:'#94a3b8',dir:'HOLD',conf:0,notes:['Insufficient data'],raw:0};
    let s=0; const notes=[];
    const range=bbUpV-bbLoV, pct=((price-bbLoV)/range)*100;
    if(price<=bbLoV)       { s+=3;   notes.push('Price at lower band — bounce zone'); }
    else if(price>=bbUpV)  { s-=3;   notes.push('Price at upper band — reversal zone'); }
    else if(pct<15)        { s+=2;   notes.push(`Bottom 15% of BB (${pct.toFixed(0)}%) — bullish bias`); }
    else if(pct>85)        { s-=2;   notes.push(`Top 85% of BB (${pct.toFixed(0)}%) — bearish bias`); }
    else if(price>bbMidV)  { s+=0.5; notes.push('Above BB midline — slight bullish'); }
    else                   { s-=0.5; notes.push('Below BB midline — slight bearish'); }
    if(bbWidth<1.5)        notes.push(`BB squeeze (${bbWidth.toFixed(1)}%) — breakout imminent`);
    else if(bbWidth>7)     notes.push(`Wide bands (${bbWidth.toFixed(1)}%) — high volatility`);
    else                   notes.push(`BB width ${bbWidth.toFixed(1)}% — normal`);
    const last3=closes.slice(-3);
    if(last3.every(c=>c>(bbLoV+range*0.75))) notes.push('Walking upper band — trend continuation');
    else if(last3.every(c=>c<(bbLoV+range*0.25))) notes.push('Walking lower band — downtrend continues');
    const norm=Math.max(-1,Math.min(1,s/4));
    return {name:'Bollinger Bands',icon:'fa-circle-dot',color:'#94a3b8',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

function s5_SR({closes, highs, lows, price, atr, dec}) {
    const n=closes.length;
    if(n<3) return {name:'Support & Resistance',icon:'fa-layer-group',color:'#f97316',dir:'HOLD',conf:0,notes:['Insufficient data'],raw:0};
    let s=0; const notes=[];
    const piv=calcPivots(highs[n-2], lows[n-2], closes[n-2]);
    const prox=atr*0.3;
    if(Math.abs(price-piv.s2)<prox)       { s+=3;   notes.push(`Near S2 ${fmtPrice(piv.s2,dec)} — strong support`); }
    else if(Math.abs(price-piv.s1)<prox)  { s+=2;   notes.push(`Near S1 ${fmtPrice(piv.s1,dec)} — support zone`); }
    else if(Math.abs(price-piv.r2)<prox)  { s-=3;   notes.push(`Near R2 ${fmtPrice(piv.r2,dec)} — strong resistance`); }
    else if(Math.abs(price-piv.r1)<prox)  { s-=2;   notes.push(`Near R1 ${fmtPrice(piv.r1,dec)} — resistance zone`); }
    else if(price>piv.pp)                 { s+=1;   notes.push(`Above pivot ${fmtPrice(piv.pp,dec)} — bullish bias`); }
    else                                  { s-=1;   notes.push(`Below pivot ${fmtPrice(piv.pp,dec)} — bearish bias`); }
    const h20=Math.max(...highs.slice(-20)), l20=Math.min(...lows.slice(-20));
    const rangePct=((price-l20)/(h20-l20))*100;
    if(rangePct<10)      { s+=1.5; notes.push('At bottom of 20-bar range'); }
    else if(rangePct>90) { s-=1.5; notes.push('At top of 20-bar range'); }
    else if(rangePct<35) { s+=0.5; notes.push(`Lower third of range (${rangePct.toFixed(0)}%)`); }
    else if(rangePct>65) { s-=0.5; notes.push(`Upper third of range (${rangePct.toFixed(0)}%)`); }
    else                   notes.push(`Mid-range position (${rangePct.toFixed(0)}%)`);
    const norm=Math.max(-1,Math.min(1,s/4.5));
    return {name:'Support & Resistance',icon:'fa-layer-group',color:'#f97316',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

function s6_Volume({closes, volumes, bbWidth}) {
    let s=0; const notes=[];
    const hasVol=volumes&&volumes.length>0&&volumes.some(v=>v>0);
    if(!hasVol) {
        notes.push('Volume data unavailable for this pair');
        if(bbWidth<2) { s+=0.3; notes.push('Price squeeze — low volatility compression'); }
    } else {
        const obv=calcOBV(closes,volumes);
        if(obv) {
            const obvEMA=calcEMA(obv,10);
            const obvLast=obv[obv.length-1], obvEMAv=obvEMA[obvEMA.length-1];
            if(obvLast>obvEMAv) { s+=2.5; notes.push('OBV above EMA — sustained buying pressure'); }
            else                { s-=2.5; notes.push('OBV below EMA — sustained selling pressure'); }
            const oSlice=obv.slice(-5);
            const slope=(oSlice[oSlice.length-1]-oSlice[0])/5;
            notes.push(slope>0 ? 'OBV trending up — confirms price' : 'OBV trending down — diverging');
        }
        const avgVol=volumes.slice(-20).reduce((a,b)=>a+b,0)/20;
        const lastVol=volumes[volumes.length-1];
        const lastClose=closes[closes.length-1], prevClose=closes[closes.length-2];
        if(lastVol>avgVol*2) {
            if(lastClose>prevClose) { s+=1.5; notes.push(`Volume spike ${(lastVol/avgVol).toFixed(1)}× — bull conviction`); }
            else                    { s-=1.5; notes.push(`Volume spike ${(lastVol/avgVol).toFixed(1)}× — bear conviction`); }
        } else if(lastVol>avgVol*1.4) {
            if(lastClose>prevClose) { s+=0.5; notes.push(`Elevated volume ${(lastVol/avgVol).toFixed(1)}× on up move`); }
            else                    { s-=0.5; notes.push(`Elevated volume ${(lastVol/avgVol).toFixed(1)}× on down move`); }
        } else notes.push('Volume near average — no conviction signal');
    }
    const norm=Math.max(-1,Math.min(1,s/4));
    return {name:'Volume & OBV',icon:'fa-chart-bar',color:'#00e676',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

function s7_Ichimoku({highs, lows, price}) {
    const ich=calcIchimoku(highs,lows);
    if(!ich) return {name:'Ichimoku Cloud',icon:'fa-cloud',color:'#67e8f9',dir:'HOLD',conf:0,notes:['Need 52+ candles for Ichimoku'],raw:0};
    let s=0; const notes=[];
    if(ich.tkBull) { s+=2; notes.push('Tenkan > Kijun — bullish TK cross'); }
    else           { s-=2; notes.push('Tenkan < Kijun — bearish TK cross'); }
    const cloudTop=Math.max(ich.spanA,ich.spanB), cloudBot=Math.min(ich.spanA,ich.spanB);
    if(price>cloudTop)      { s+=2.5; notes.push('Price above cloud — strong bullish'); }
    else if(price<cloudBot) { s-=2.5; notes.push('Price below cloud — strong bearish'); }
    else                      notes.push('Price inside cloud — consolidating');
    if(ich.bullCloud) { s+=0.5; notes.push('Green cloud ahead — bullish momentum'); }
    else              { s-=0.5; notes.push('Red cloud ahead — bearish momentum'); }
    notes.push(price>ich.kijun ? 'Price above Kijun baseline — bullish' : 'Price below Kijun baseline — bearish');
    const norm=Math.max(-1,Math.min(1,s/5));
    return {name:'Ichimoku Cloud',icon:'fa-cloud',color:'#67e8f9',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

function s8_PriceAction({opens, highs, lows, closes, price, atr}) {
    const n=closes.length;
    if(n<10||!opens) return {name:'Price Action',icon:'fa-fire',color:'#fb923c',dir:'HOLD',conf:0,notes:['Insufficient candle data'],raw:0};
    let s=0; const notes=[];
    const patterns=detectCandlePatterns(opens,highs,lows,closes);
    patterns.forEach(p=>{
        if(p.dir==='bull')      { s+=p.strength*0.7; notes.push(`📈 ${p.name}: ${p.note}`); }
        else if(p.dir==='bear') { s-=p.strength*0.7; notes.push(`📉 ${p.name}: ${p.note}`); }
        else                      notes.push(`⟺ ${p.name}: ${p.note}`);
    });
    const h5=highs.slice(-6), l5=lows.slice(-6);
    const hhCount=h5.slice(1).filter((h,i)=>h>h5[i]).length;
    const llCount=l5.slice(1).filter((l,i)=>l<l5[i]).length;
    if(hhCount>=4)      { s+=1.5; notes.push(`Higher highs — ${hhCount}/5 bars`); }
    else if(llCount>=4) { s-=1.5; notes.push(`Lower lows — ${llCount}/5 bars`); }
    const highest20=Math.max(...highs.slice(-21,-1)), lowest20=Math.min(...lows.slice(-21,-1));
    if(price>highest20*1.002)     { s+=2; notes.push('Breakout above 20-bar range'); }
    else if(price<lowest20*0.998) { s-=2; notes.push('Breakdown below 20-bar range'); }
    if(notes.length<4) {
        const ra=(closes[n-1]+closes[n-2]+closes[n-3])/3, rb=(closes[n-4]+closes[n-5]+closes[n-6])/3;
        const mom=((ra-rb)/rb)*100;
        if(Math.abs(mom)>0.3) notes.push(`Momentum: ${mom>0?'+':''}${mom.toFixed(2)}% vs prior 3 bars`);
    }
    const norm=Math.max(-1,Math.min(1,s/5));
    return {name:'Price Action Patterns',icon:'fa-fire',color:'#fb923c',dir:scoreToDir(norm),conf:Math.round(Math.abs(norm)*100),notes:notes.slice(0,4),raw:s};
}

// ─── MASTER SIGNAL — SINGLE SOURCE OF TRUTH ──────────────────────────
const WEIGHTS = {
    'Trend Following':2.2,'MACD Crossover':1.8,'Ichimoku Cloud':1.6,
    'Momentum Oscillators':1.4,'Support & Resistance':1.4,
    'Bollinger Bands':1.2,'Price Action Patterns':1.0,'Volume & OBV':0.8
};
function computeMasterSignal(strategies, price, atr, dec) {
    let bullW=0, bearW=0, totalW=0;
    strategies.forEach(s=>{
        const w=WEIGHTS[s.name]||1; totalW+=w;
        if(s.dir==='BUY')       bullW+=w;
        else if(s.dir==='SELL') bearW+=w;
        else if(s.dir==='LEAN BUY')  bullW+=w*0.5;
        else if(s.dir==='LEAN SELL') bearW+=w*0.5;
    });
    const bullPct=(bullW/totalW)*100, bearPct=(bearW/totalW)*100;
    const score=Math.round(Math.max(bullPct,bearPct)/10);
    let dir, color;
    if(bullPct>=65)              { dir='BUY';       color='var(--bull)'; }
    else if(bearPct>=65)         { dir='SELL';      color='var(--bear)'; }
    else if(bullPct-bearPct>=20) { dir='LEAN BUY';  color='rgba(0,230,118,0.85)'; }
    else if(bearPct-bullPct>=20) { dir='LEAN SELL'; color='rgba(255,61,90,0.85)'; }
    else                         { dir='HOLD';      color='var(--gold)'; }
    // ── Entry = the price passed in from the current symbol's own data feed.
    // Do NOT use getCanonicalPrice() here — it may hold a value from a previous
    // asset or from the TV ticker tape (which broadcasts multiple symbols at once).
    const entry = price;
    const isBull = bullPct>=bearPct;
    const tp = isBull ? entry+atr*3.0 : entry-atr*3.0;
    const sl = isBull ? entry-atr*1.5 : entry+atr*1.5;
    const bullCount=strategies.filter(s=>s.dir==='BUY'||s.dir==='LEAN BUY').length;
    const bearCount=strategies.filter(s=>s.dir==='SELL'||s.dir==='LEAN SELL').length;
    return {dir,color,bullPct,bearPct,score,entry,tp,sl,rr:'1 : 2',atr,isBull,bullCount,bearCount};
}

// ═══════════════════════════════════════════════════════════════════════
//  CHART INIT
// ═══════════════════════════════════════════════════════════════════════
// Chart.js removed — TradingView widget handles the live chart.
// initCharts() kept as safe no-op so no crashes.
function initCharts() { /* TradingView handles charts now */ }
function toggleLayer(layer) { /* TradingView handles chart layers */ }
// ═══════════════════════════════════════════════════════════════════════
//  DATA FETCHING — Binance (primary) + Kraken (forex fallback)
// ═══════════════════════════════════════════════════════════════════════
const bTicker  = sym => `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`;
const bKlines  = (sym,iv,lim=200) => `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${iv}&limit=${lim}`;
const bWS      = sym => `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@ticker`;
const kTicker  = id  => `https://api.kraken.com/0/public/Ticker?pair=${id}`;
const kCandles = (id,iv) => `https://api.kraken.com/0/public/OHLC?pair=${id}&interval=${KRAKEN_IV(iv)}`;

// ── GOLD SPOT PRICE SYSTEM ────────────────────────────────────────────
// Strategy: PAXG WebSocket (live tick-by-tick) + jsDelivr offset (one-time calibration)
// PAXG moves in perfect lockstep with real gold every second.
// We calculate a fixed offset = (real spot) - (PAXG price) once on load,
// then apply that offset to every PAXG WebSocket tick → live accurate spot price.
let goldOffset       = 0;   // real spot - PAXG price, calibrated once
let goldCalibrated   = false;

async function calibrateGoldOffset() {
    try {
        // Fetch real spot price from jsDelivr (daily rate, CORS guaranteed)
        const r   = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json').then(res=>res.json());
        const spot = r.xau?.usd ? parseFloat(r.xau.usd) : 0;
        // Fetch current PAXG price from Binance
        const pd  = await fetch(bTicker('PAXGUSDT')).then(res=>res.json());
        const paxg = pd && !pd.code ? parseFloat(pd.lastPrice) : 0;
        if(spot > 0 && paxg > 0) {
            goldOffset     = spot - paxg;   // e.g. real=5034, PAXG=5021 → offset=+13
            goldCalibrated = true;
            console.log(`Gold calibrated: spot=${spot}, PAXG=${paxg}, offset=${goldOffset.toFixed(2)}`);
        }
    } catch(e) {
        console.warn('Gold calibration failed, using PAXG direct:', e);
        goldOffset     = 0;
        goldCalibrated = true;
    }
}

async function fetchGoldStats() {
    // PAXG 24h stats, adjusted by offset
    const d = await fetch(bTicker('PAXGUSDT')).then(r=>r.json());
    if(d.code) throw new Error('PAXG error');
    const price     = parseFloat(d.lastPrice)     + goldOffset;
    const high      = parseFloat(d.highPrice)     + goldOffset;
    const low       = parseFloat(d.lowPrice)      + goldOffset;
    const changePct = parseFloat(d.priceChangePercent);
    return { price, high, low, changePct };
}

async function fetchGoldCandles(interval) {
    const ivMap = {'5m':'5m','15m':'15m','1h':'1h','4h':'4h','1d':'1d'};
    const d     = await fetch(bKlines('PAXGUSDT', ivMap[interval]||'4h', 200)).then(r=>r.json());
    if(!Array.isArray(d)||d.code) throw new Error('Gold candles error');
    // Apply offset to all candle prices so indicators use correct absolute levels
    return {
        opens:   d.map(c=>parseFloat(c[1])+goldOffset),
        highs:   d.map(c=>parseFloat(c[2])+goldOffset),
        lows:    d.map(c=>parseFloat(c[3])+goldOffset),
        closes:  d.map(c=>parseFloat(c[4])+goldOffset),
        volumes: d.map(c=>parseFloat(c[5])),
        times:   d.map(c=>{ const dt=new Date(c[0]); return interval==='1d'?`${dt.getMonth()+1}/${dt.getDate()}`:`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; })
    };
}

// ── DOM REFS ──────────────────────────────────────────────────────────
const assetSelector = $('assetSelector');
const priceSection  = $('priceSection');
const priceChange   = $('priceChange');
const statHigh      = $('statHigh');
const statLow       = $('statLow');
const statVol       = $('statVol');
const rsiValueEl    = $('rsiValue');
const maValueEl     = $('maValue');
const analysisTextEl= $('analysisText');
const signalSection = $('signalSection');
const signalText    = $('signalText');
const signalSubtext = $('signalSubtext');
const tradeEntry    = $('tradeEntry');
const calcPlaceholder=$('calcPlaceholder');
const calcResults   = $('calcResults');

// ── 24H STATS ─────────────────────────────────────────────────────────
async function fetch24hStats() {
    const asset=ASSETS[currentSymbol];
    const dec=asset.decimals;
    try {
        if(asset.type==='binance') {
            const d=await fetch(bTicker(currentSymbol)).then(r=>r.json());
            if(d.code) throw new Error('Binance error');
            updatePriceUI(parseFloat(d.lastPrice), parseFloat(d.priceChangePercent));
            safeText('statHigh', fmtPrice(parseFloat(d.highPrice),dec));
            safeText('statLow',  fmtPrice(parseFloat(d.lowPrice),dec));
            const v=parseFloat(d.volume);
            safeText('statVol', v>1e6?(v/1e6).toFixed(2)+'M':v>1e3?(v/1e3).toFixed(2)+'K':v.toFixed(2));
        } else {
            const d=await fetch(kTicker(asset.krakenId)).then(r=>r.json());
            if(d.error?.length) throw new Error(d.error[0]);
            const key=Object.keys(d.result)[0], t=d.result[key];
            const last=parseFloat(t.c[0]), open=parseFloat(t.o);
            updatePriceUI(last, ((last-open)/open)*100);
            safeText('statHigh', fmtPrice(parseFloat(t.h[0]),dec));
            safeText('statLow',  fmtPrice(parseFloat(t.l[0]),dec));
            const vol=parseFloat(t.v[0]);
            safeText('statVol', vol===0?'N/A':vol>1e4?(vol/1e3).toFixed(1)+'K':vol.toFixed(2));
        }
    } catch(e) {
        console.warn('Stats error',e);
    }
}

function updatePriceUI(price, changePct) {
    const p=parseFloat(price);
    if(isNaN(p)||p<=0) return;
    const dec=ASSETS[currentSymbol].decimals;
    const fmt=dec>=4 ? p.toFixed(dec) : '$'+p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    const wasUp=p>prevPrice;
    if(priceSection) { priceSection.textContent=fmt; }
    if(prevPrice>0 && priceSection) {
        priceSection.className=wasUp?'mono text-5xl font-black text-white tracking-tight mb-2 flash-up':'mono text-5xl font-black text-white tracking-tight mb-2 flash-down';
        setTimeout(()=>{ if(priceSection) priceSection.className='mono text-5xl font-black text-white tracking-tight mb-2'; },700);
    }
    prevPrice=p; latestClosePrice=p;
    if(changePct!==null&&changePct!==undefined&&priceChange) {
        const chg=parseFloat(changePct);
        if(chg>0) priceChange.innerHTML=`<span style="background:rgba(0,230,118,0.12);color:var(--bull);padding:3px 10px;border-radius:6px;font-weight:700;font-size:0.8rem;border:1px solid rgba(0,230,118,0.2)"><i class="fa-solid fa-arrow-trend-up mr-1" style="font-size:0.7rem"></i>+${chg.toFixed(2)}%</span>`;
        else if(chg<0) priceChange.innerHTML=`<span style="background:rgba(255,61,90,0.12);color:var(--bear);padding:3px 10px;border-radius:6px;font-weight:700;font-size:0.8rem;border:1px solid rgba(255,61,90,0.2)"><i class="fa-solid fa-arrow-trend-down mr-1" style="font-size:0.7rem"></i>${chg.toFixed(2)}%</span>`;
        else priceChange.innerHTML=`<span style="color:var(--muted);font-size:0.8rem">0.00%</span>`;
    }
    // Update entry placeholder with latest live price
    // Update trade entry placeholder with this symbol's live price
    if(tradeEntry&&document.activeElement!==tradeEntry&&!tradeEntry.value) {
        const dec=ASSETS[currentSymbol]?.decimals||2;
        tradeEntry.placeholder = dec>=4 ? p.toFixed(dec) : p.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    }
    safeText('lastUpdate', new Date().toLocaleTimeString());
    setLiveStatus(true);
}

function setLiveStatus(on) {
    const dot=$('connDot'), lbl=$('connLabel'), hDot=$('headerLiveDot'), hLbl=$('headerLiveLabel');
    if(on) {
        if(dot) dot.className='live-dot'; if(lbl) lbl.textContent='LIVE';
        if(hDot) hDot.className='live-dot'; if(hLbl) hLbl.textContent='LIVE';
    } else {
        if(dot) dot.className='offline-dot'; if(lbl) lbl.textContent='Connecting…';
        if(hDot) hDot.className='offline-dot'; if(hLbl) hLbl.textContent='LOADING';
    }
}

// ── HISTORICAL DATA + FULL ANALYSIS ───────────────────────────────────
async function fetchHistoricalData() {
    const asset=ASSETS[currentSymbol];
    const dec=asset.decimals;
    let opens=[],highs=[],lows=[],closes=[],volumes=[],times=[];

    try {
        if(asset.type==='binance') {
            // currentInterval is already in Binance format (5m,15m,1h,4h,1d)
            const d=await fetch(bKlines(currentSymbol, currentInterval, 200)).then(r=>r.json());
            if(!Array.isArray(d)||d.code) throw new Error('Binance candles error');
            opens  =d.map(c=>parseFloat(c[1]));
            highs  =d.map(c=>parseFloat(c[2]));
            lows   =d.map(c=>parseFloat(c[3]));
            closes =d.map(c=>parseFloat(c[4]));
            volumes=d.map(c=>parseFloat(c[5]));
            times  =d.map(c=>{ const dt=new Date(c[0]); return currentInterval==='1d'?`${dt.getMonth()+1}/${dt.getDate()}`:`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; });
        } else {
            const d=await fetch(kCandles(asset.krakenId, currentInterval)).then(r=>r.json());
            if(d.error?.length) throw new Error(d.error[0]);
            const key=Object.keys(d.result).find(k=>k!=='last');
            const rows=d.result[key].slice(-200);
            opens  =rows.map(c=>parseFloat(c[1]));
            highs  =rows.map(c=>parseFloat(c[2]));
            lows   =rows.map(c=>parseFloat(c[3]));
            closes =rows.map(c=>parseFloat(c[4]));
            volumes=rows.map(c=>parseFloat(c[6]||0));
            times  =rows.map(c=>{ const dt=new Date(c[0]*1000); return currentInterval==='1d'?`${dt.getMonth()+1}/${dt.getDate()}`:`${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; });
        }

        // ── Price for this analysis run = latest candle close from THIS symbol's feed.
        // Do NOT pull from getCanonicalPrice() — it may carry a stale value from
        // a previous asset or from the TV ticker tape (which streams multiple symbols).
        const price = closes[closes.length - 1];
        // Sync the global so the UI price card and calculator stay current
        if(price > 0) {
            latestClosePrice = price;
        }
        if(latestClosePrice <= 0) updatePriceUI(price, null);

        // ── Compute indicators
        const ema20=calcEMA(closes,20), ema50=calcEMA(closes,50), ema200=calcEMA(closes,200);
        const ema20v=ema20[ema20.length-1], ema50v=ema50[ema50.length-1], ema200v=ema200[ema200.length-1];
        const bb=calcBollingerBands(closes,20,2);
        const bbUpV=bb.upper[bb.upper.length-1], bbLoV=bb.lower[bb.lower.length-1], bbMidV=bb.mid[bb.mid.length-1];
        const bbWidth=bbUpV&&bbLoV?((bbUpV-bbLoV)/bbMidV)*100:0;
        const macdData=calcMACD(closes,12,26,9);
        const macdLast=macdData.macdLine[macdData.macdLine.length-1];
        const sigLast=macdData.signalLine[macdData.signalLine.length-1];
        const histLast=macdData.histogram[macdData.histogram.length-1];
        const prevHist=macdData.histogram[macdData.histogram.length-2];
        const rsi=calcRSI(closes,14), rsiSer=calcRSISeries(closes,14);
        const atr=calcATR(highs,lows,closes,14);
        const stoch=calcStochastic(highs,lows,closes,14);
        const adx=calcADX(highs,lows,closes,14);
        const williamsR=calcWilliamsR(highs,lows,closes,14);
        const cci=calcCCI(highs,lows,closes,20);

        // Chart.js updates removed — TradingView widget handles live chart rendering.
        // All indicators below still computed from Binance/Kraken candle data.

        // ── RSI + MACD status (shown in indicator panel)
        const rsiEl=$('rsiSignalBadge');
        if(rsiEl){ if(rsi>70){rsiEl.textContent='OVERBOUGHT';rsiEl.className='ind-badge ind-bear ml-auto';}else if(rsi<30){rsiEl.textContent='OVERSOLD';rsiEl.className='ind-badge ind-bull ml-auto';}else{rsiEl.textContent=`RSI ${rsi.toFixed(1)}`;rsiEl.className='ind-badge ind-neut ml-auto';}}
        const macdEl=$('macdSignalBadge');
        if(macdEl&&macdLast!==null&&sigLast!==null){
            const pm=macdData.macdLine[macdData.macdLine.length-2], ps=macdData.signalLine[macdData.signalLine.length-2];
            const x=pm!==null&&ps!==null&&((pm<ps&&macdLast>sigLast)||(pm>ps&&macdLast<sigLast));
            macdEl.textContent=x?(macdLast>sigLast?'🔔 BULL CROSS':'🔔 BEAR CROSS'):(macdLast>sigLast?'BULLISH':'BEARISH');
            macdEl.className=`ind-badge ml-auto ${macdLast>sigLast?'ind-bull':'ind-bear'}`;
        }

        // ── Mini values
        if(rsiValueEl){ rsiValueEl.textContent=rsi.toFixed(2); rsiValueEl.style.color=rsi>70?'var(--bear)':rsi<30?'var(--bull)':'#e2eaf5'; }
        if(maValueEl) maValueEl.textContent=ema20v!==null?fmtPrice(ema20v,dec):'--';
        const mv=$('macdValue'); if(mv){ mv.textContent=macdLast!==null?(macdLast>0?'+':'')+macdLast.toFixed(dec>=4?5:2):'--'; mv.style.color=macdLast>0?'var(--bull)':'var(--bear)'; }
        safeText('bbValue', bbWidth.toFixed(2)+'%');
        safeText('chartInfoText', `ATR:${fmtPrice(atr,dec)} · ADX:${adx.adx.toFixed(0)} · W%R:${williamsR.toFixed(0)} · CCI:${cci.toFixed(0)}`);

        // ── Full indicator panel
        renderIndicatorPanel({rsi,ema20v,ema50v,price,macdLast,sigLast,histLast,prevHist,bbUpV,bbLoV,bbMidV,atr,stoch,dec,bbWidth,adx,williamsR,cci});

        // ══ RUN ALL 8 STRATEGIES ══
        const strategies=[
            s1_Trend({price,ema20v,ema50v,ema200v,adx}),
            s2_Momentum({rsi,stoch,williamsR,cci}),
            s3_MACD({macdLast,sigLast,histLast,prevHist,macdLine:macdData.macdLine,signalLine:macdData.signalLine}),
            s4_Bollinger({price,bbUpV,bbLoV,bbMidV,bbWidth,closes}),
            s5_SR({closes,highs,lows,price,atr,dec}),
            s6_Volume({closes,volumes,bbWidth}),
            s7_Ichimoku({highs,lows,price}),
            s8_PriceAction({opens,highs,lows,closes,price,atr}),
        ];
        const master=computeMasterSignal(strategies,price,atr,dec);

        // ── Render all UI — master is the single source for all levels
        renderStrategyCards(strategies,master);
        renderMasterVerdict(master,adx,dec);
        updateBanner(master,strategies,rsi,ema20v,ema50v,macdLast,sigLast,stoch,dec,adx);
        updateSmallSignalCard(master);
        renderFinalVerdict(master,strategies,rsi,adx,bbWidth,williamsR,cci,stoch,atr,dec);

        // ── Analysis labels
        const tf=currentInterval.toUpperCase();
        safeText('analysisTimeframe',tf);
        const itf=$('indicatorTimeframe'); if(itf) itf.textContent=tf;
        safeText('trendLabel', ema20v&&ema50v?(ema20v>ema50v?'↑ Uptrend':'↓ Downtrend'):'Unclear');
        if($('trendLabel')) $('trendLabel').style.color=ema20v>ema50v?'var(--bull)':'var(--bear)';
        safeText('momentumLabel', rsi>55?'⬆ Strong':rsi<45?'⬇ Weak':'↔ Neutral');
        if($('momentumLabel')) $('momentumLabel').style.color=rsi>55?'var(--bull)':rsi<45?'var(--bear)':'var(--gold)';
        safeText('volatilityLabel', bbWidth>4?'High':bbWidth>2?'Medium':'Low');
        if(analysisTextEl) analysisTextEl.innerHTML=`<strong style="color:#e2eaf5">${asset.name} (${tf}):</strong> Master signal <strong style="color:${master.color}">${master.dir}</strong> — ${master.bullPct.toFixed(0)}% bull · ${master.bearPct.toFixed(0)}% bear · Score ${master.score}/10.<br><span style="color:var(--muted)">${master.bullCount}/8 bullish · ${master.bearCount}/8 bearish · ATR=${fmtPrice(master.atr,dec)} · ADX=${adx.adx.toFixed(0)} (${adx.adx>25?'trending':'ranging'}) · W%R=${williamsR.toFixed(0)} · CCI=${cci.toFixed(0)}</span><span style="color:var(--muted);font-size:0.8em;display:block;margin-top:4px">⚠ Technical analysis only. Always manage risk carefully.</span>`;

        // ── Levels — identical in all three places
        safeText('entryZone', fmtPrice(master.entry,dec));
        safeText('suggestSL',  fmtPrice(master.sl,dec));
        safeText('suggestTP',  fmtPrice(master.tp,dec));
        const els=$('entryLevelsSection'); if(els) els.style.display='block';

    } catch(e) {
        console.error('Analysis error',e);
        if(analysisTextEl) analysisTextEl.innerHTML=`<span style="color:var(--bear)">⚠ Data fetch error: ${e.message}. Retrying…</span>`;
    }
}

// ─── INDICATOR PANEL ──────────────────────────────────────────────────
function renderIndicatorPanel({rsi,ema20v,ema50v,price,macdLast,sigLast,histLast,prevHist,bbUpV,bbLoV,bbMidV,atr,stoch,dec,bbWidth,adx,williamsR,cci}) {
    const el=$('indicatorPanel'); if(!el) return;
    const row=(n,v,b,c)=>`<div class="ind-row"><div><div class="text-xs font-semibold text-white">${n}</div><div class="text-xs mono mt-0.5" style="color:var(--muted)">${v}</div></div><span class="ind-badge ${c}">${b}</span></div>`;
    const rsiB=rsi>70?['OVERBOUGHT','ind-bear']:rsi<30?['OVERSOLD','ind-bull']:rsi>55?['BULLISH','ind-bull']:rsi<45?['BEARISH','ind-bear']:['NEUTRAL','ind-neut'];
    const emaB=ema20v&&ema50v?(ema20v>ema50v?['BULL TREND','ind-bull']:['BEAR TREND','ind-bear']):['--','ind-neut'];
    const macdB=macdLast!==null&&sigLast!==null?(macdLast>sigLast?['BULLISH','ind-bull']:['BEARISH','ind-bear']):['--','ind-neut'];
    const bbB=bbUpV&&bbLoV?(price>bbUpV?['OVERBOUGHT','ind-bear']:price<bbLoV?['OVERSOLD','ind-bull']:price>bbMidV?['MID-UPPER','ind-bull']:['MID-LOWER','ind-bear']):['--','ind-neut'];
    const stB=stoch.k>80?['OVERBOUGHT','ind-bear']:stoch.k<20?['OVERSOLD','ind-bull']:stoch.k>stoch.d?['BULL','ind-bull']:['BEAR','ind-bear'];
    const adxB=adx.adx>30?['TRENDING','ind-bull']:adx.adx>20?['DEVELOPING','ind-neut']:['RANGING','ind-bear'];
    const wrB=williamsR<-70?['OVERSOLD','ind-bull']:williamsR>-20?['OVERBOUGHT','ind-bear']:['NEUTRAL','ind-neut'];
    const cciB=cci<-100?['OVERSOLD','ind-bull']:cci>100?['OVERBOUGHT','ind-bear']:['NEUTRAL','ind-neut'];
    el.innerHTML=
        row('RSI (14)',rsi.toFixed(2),rsiB[0],rsiB[1])+
        row('EMA 20/50',`${fmtPrice(ema20v,dec)} / ${fmtPrice(ema50v,dec)}`,emaB[0],emaB[1])+
        row('MACD vs Signal',macdLast?.toFixed(dec>=4?5:2)||'--',macdB[0],macdB[1])+
        row('Bollinger Bands',`Width ${bbWidth.toFixed(2)}%`,bbB[0],bbB[1])+
        row('Stochastic K/D',`K:${stoch.k.toFixed(1)} D:${stoch.d.toFixed(1)}`,stB[0],stB[1])+
        row('ADX (14)',`${adx.adx.toFixed(1)} +DI:${adx.plusDI.toFixed(0)} -DI:${adx.minusDI.toFixed(0)}`,adxB[0],adxB[1])+
        row('Williams %R',williamsR.toFixed(0),wrB[0],wrB[1])+
        row('CCI (20)',cci.toFixed(0),cciB[0],cciB[1]);
}

// ─── STRATEGY CARDS ───────────────────────────────────────────────────
function renderStrategyCards(strategies, master) {
    const el=$('strategyCards'); if(!el) return;
    const dIcon={'BUY':'▲','SELL':'▼','LEAN BUY':'↗','LEAN SELL':'↙','HOLD':'—'};
    const dColor={'BUY':'var(--bull)','SELL':'var(--bear)','LEAN BUY':'rgba(0,230,118,0.85)','LEAN SELL':'rgba(255,61,90,0.85)','HOLD':'var(--gold)'};
    const cCls={'BUY':'sc-buy','SELL':'sc-sell','LEAN BUY':'sc-lean-buy','LEAN SELL':'sc-lean-sell','HOLD':'sc-hold'};
    const badge=$('strategyBadge');
    if(badge){ badge.className=master.dir==='BUY'?'hc-badge hc-strong-buy':master.dir==='SELL'?'hc-badge hc-strong-sell':master.dir.includes('LEAN')?'hc-badge hc-lean':'hc-badge hc-neutral'; badge.textContent=`${master.dir} · ${master.score}/10`; }
    const buyC=strategies.filter(s=>s.dir==='BUY').length, lbC=strategies.filter(s=>s.dir==='LEAN BUY').length;
    const sellC=strategies.filter(s=>s.dir==='SELL').length, lsC=strategies.filter(s=>s.dir==='LEAN SELL').length;
    safeText('agreeCount',`${buyC+lbC} bull / ${sellC+lsC} bear`);
    el.innerHTML=strategies.map((s,idx)=>`
        <div class="strat-card ${cCls[s.dir]||'sc-neutral'}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                    <div style="width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border:1px solid ${s.color}40;flex-shrink:0">
                        <i class="fa-solid ${s.icon}" style="color:${s.color};font-size:12px"></i>
                    </div>
                    <div style="min-width:0">
                        <div style="font-size:11px;font-weight:700;color:#e2eaf5;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
                        <div style="font-size:9px;color:var(--muted)">Strategy ${idx+1}</div>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-family:'Space Mono',monospace;font-size:0.85rem;font-weight:900;color:${dColor[s.dir]};line-height:1">${dIcon[s.dir]} ${s.dir}</div>
                    <div style="font-size:9px;color:var(--muted);margin-top:1px">${s.conf}% conf.</div>
                </div>
            </div>
            <div class="conf-track"><div class="conf-fill" style="width:${s.conf}%;background:${dColor[s.dir]}"></div></div>
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:3px">
                ${s.notes.slice(0,3).map(n=>`<div style="font-size:10px;color:#94a3b8;padding:2px 0 2px 7px;border-left:2px solid ${s.color}30;line-height:1.35">· ${n}</div>`).join('')}
            </div>
        </div>`).join('');
}

// ─── MASTER VERDICT ───────────────────────────────────────────────────
function renderMasterVerdict(master, adx, dec) {
    const el=$('masterVerdictStrip'); if(!el) return;
    el.classList.remove('hidden');
    const vcls=master.dir==='BUY'?'verdict-buy':master.dir==='SELL'?'verdict-sell':master.dir.includes('LEAN')?'verdict-lean':'verdict-neutral';
    el.className=`${vcls} rounded-xl p-4 mt-4`;
    safeText('verdictDir',master.dir); if($('verdictDir')) $('verdictDir').style.color=master.color;
    safeText('verdictSub',`${master.bullPct.toFixed(0)}% weighted bull · ${master.bearPct.toFixed(0)}% weighted bear · ${master.score}/10`);
    const mb=$('masterBull'),mbb=$('masterBear');
    if(mb) mb.style.width=master.bullPct+'%'; if(mbb) mbb.style.width=master.bearPct+'%';
    safeText('masterBullPct',master.bullPct.toFixed(0)+'%'); safeText('masterBearPct',master.bearPct.toFixed(0)+'%');
    safeText('verdictTP',  fmtPrice(master.tp,  dec));
    safeText('verdictSL',  fmtPrice(master.sl,  dec));
    safeText('verdictATR', fmtPrice(master.atr, dec));
    safeText('verdictADX', adx.adx.toFixed(0));
}

// ─── SMALL CONFLUENCE CARD ────────────────────────────────────────────
function updateSmallSignalCard(master) {
    if(signalText)    signalText.textContent=master.dir;
    if(signalSubtext) signalSubtext.textContent=`${master.bullCount}/8 bull · ${master.bearCount}/8 bear`;
    if(signalSection) { const c=master.dir==='BUY'?'signal-buy':master.dir==='SELL'?'signal-sell':master.dir.includes('LEAN')?'signal-wait':'signal-neutral'; signalSection.className=`${c} w-full rounded-2xl px-4 py-5 mb-3 transition-all duration-500`; }
    const cb=$('confluenceBar'); if(cb){ cb.style.width=`${master.score*10}%`; cb.style.background=master.color; }
    safeText('confluenceScore',`${master.score}/10`);
    const vb=$('voteBull'),vbb=$('voteBear');
    if(vb) vb.style.width=master.bullPct+'%'; if(vbb) vbb.style.width=master.bearPct+'%';
    safeText('voteBullPct',master.bullPct.toFixed(0)+'%'); safeText('voteBearPct',master.bearPct.toFixed(0)+'%');
}

// ─── FINAL VERDICT SIGNAL ────────────────────────────────────────────
function renderFinalVerdict(master, strategies, rsi, adx, bbWidth, williamsR, cci, stoch, atr, dec) {
    const panel  = $('finalVerdictPanel');
    const header = $('fvHeader');
    if(!panel) return;

    // ── Determine conviction tier
    const spread = Math.abs(master.bullPct - master.bearPct);
    const aligned = strategies.filter(s => s.dir === 'BUY' || s.dir === 'SELL').length; // hard directional
    const convPct  = Math.round(Math.max(master.bullPct, master.bearPct));

    let tier, tierColor, tierBg;
    if(convPct >= 80 && aligned >= 6)      { tier='VERY HIGH'; tierColor='var(--bull)';  tierBg='rgba(0,230,118,0.12)'; }
    else if(convPct >= 65 && aligned >= 4) { tier='HIGH';      tierColor='var(--bull)';  tierBg='rgba(0,230,118,0.07)'; }
    else if(convPct >= 50 && aligned >= 3) { tier='MODERATE';  tierColor='var(--gold)';  tierBg='rgba(255,209,102,0.07)'; }
    else                                   { tier='LOW';        tierColor='var(--muted)'; tierBg='rgba(136,153,176,0.05)'; }

    // ── Border / glow class
    panel.className = 'panel ' + (master.dir==='BUY'?'fv-buy':master.dir==='SELL'?'fv-sell':master.dir.includes('LEAN')?'fv-lean':'fv-hold');
    panel.style.borderRadius = '20px';

    // ── Header tint
    if(header) {
        header.style.background = master.dir==='BUY'   ? 'rgba(0,230,118,0.04)' :
                                   master.dir==='SELL'  ? 'rgba(255,61,90,0.04)' :
                                   master.dir.includes('LEAN') ? 'rgba(255,209,102,0.03)' : 'transparent';
    }

    // ── Verdict word
    const vw = $('fvVerdictWord');
    if(vw) {
        vw.textContent = master.dir;
        vw.style.color = master.color;
        vw.className   = 'mono font-black' + (master.dir !== 'HOLD' ? ' fv-pulse' : '');
    }
    safeText('fvVerdictSub', `${master.bullCount}/8 bullish · ${master.bearCount}/8 bearish · Weighted score ${master.score}/10`);

    // ── Confidence badge
    const badge = $('fvConfidenceBadge');
    if(badge) {
        badge.textContent = `${tier} CONVICTION · ${convPct}%`;
        badge.className   = 'hc-badge ' + (tier==='VERY HIGH'||tier==='HIGH' ? (master.isBull?'hc-strong-buy':'hc-strong-sell') : tier==='MODERATE'?'hc-lean':'hc-neutral');
    }
    safeText('fvTimestamp', `Updated ${new Date().toLocaleTimeString()}`);

    // ── Conviction bar
    const cb = $('fvConvBar'); if(cb){ cb.style.width=convPct+'%'; cb.style.background=master.color; }
    safeText('fvConvPct', convPct+'%');

    // ── Bull / Bear bars
    const bb = $('fvBullBar'), bbb = $('fvBearBar');
    if(bb)  bb.style.width  = master.bullPct + '%';
    if(bbb) bbb.style.width = master.bearPct + '%';
    safeText('fvBullLabel', `BULL ${master.bullPct.toFixed(0)}%`);
    safeText('fvBearLabel', `BEAR ${master.bearPct.toFixed(0)}%`);

    // ── Strategy alignment dots
    const dotsEl = $('fvAlignDots');
    if(dotsEl) {
        dotsEl.innerHTML = strategies.map(s => {
            const c = s.dir==='BUY'||s.dir==='LEAN BUY' ? 'var(--bull)' :
                      s.dir==='SELL'||s.dir==='LEAN SELL' ? 'var(--bear)' : 'var(--gold)';
            const opacity = s.dir==='LEAN BUY'||s.dir==='LEAN SELL' ? '0.55' : '1';
            return `<div title="${s.name}: ${s.dir}" style="width:22px;height:22px;border-radius:6px;background:${c};opacity:${opacity};display:flex;align-items:center;justify-content:center;cursor:default">
                <i class="fa-solid ${s.icon}" style="font-size:9px;color:rgba(0,0,0,0.7)"></i>
            </div>`;
        }).join('');
    }

    // ── Top reasons (pick the highest-weight strategies that agree with master)
    const reasons = $('fvReasons');
    if(reasons) {
        const isBull = master.isBull;
        // Sort by weight descending, keep those that agree with the master direction
        const agreeing = [...strategies]
            .map(s => ({...s, w: (WEIGHTS[s.name]||1)}))
            .filter(s => isBull ? (s.dir==='BUY'||s.dir==='LEAN BUY') : (s.dir==='SELL'||s.dir==='LEAN SELL'))
            .sort((a,b) => b.w - a.w)
            .slice(0, 4);
        const disagreeing = strategies.filter(s => isBull ? (s.dir==='SELL'||s.dir==='LEAN SELL') : (s.dir==='BUY'||s.dir==='LEAN BUY'));

        if(agreeing.length === 0) {
            reasons.innerHTML = `<div class="text-xs" style="color:var(--muted)">Mixed signals — no clear directional consensus.</div>`;
        } else {
            reasons.innerHTML = agreeing.map(s =>
                `<div style="display:flex;align-items:flex-start;gap:7px;padding:6px 8px;border-radius:8px;background:${s.dir.includes('BUY')?'rgba(0,230,118,0.05)':'rgba(255,61,90,0.05)'};border:1px solid ${s.dir.includes('BUY')?'rgba(0,230,118,0.15)':'rgba(255,61,90,0.15)'}">
                    <i class="fa-solid ${s.icon} mt-0.5 flex-shrink-0" style="color:${s.color};font-size:10px"></i>
                    <div>
                        <div class="text-xs font-bold" style="color:#e2eaf5">${s.name} <span class="mono" style="color:${s.dir.includes('BUY')?'var(--bull)':'var(--bear)'};font-size:10px">${s.dir}</span></div>
                        <div class="text-xs" style="color:var(--muted)">${s.notes[0]||''}</div>
                    </div>
                </div>`
            ).join('') +
            (disagreeing.length > 0
                ? `<div class="text-xs mt-1" style="color:var(--muted);padding:4px 8px;border-radius:6px;background:rgba(136,153,176,0.05);border:1px solid rgba(136,153,176,0.12)">⚠ ${disagreeing.length} strategy${disagreeing.length>1?'s':''} disagree${disagreeing.length===1?'s':''}: ${disagreeing.map(s=>s.name).join(', ')}</div>`
                : `<div class="text-xs" style="color:var(--bull);padding:4px 8px">✅ All strategies aligned — highest conviction signal</div>`
            );
        }
    }

    // ── Market Context chips
    const ctxEl = $('fvContext');
    if(ctxEl) {
        const ctx = [];
        ctx.push(adx.adx > 25
            ? { text: `ADX ${adx.adx.toFixed(0)} — Trending market`, col: 'var(--bull)' }
            : { text: `ADX ${adx.adx.toFixed(0)} — Ranging market`, col: 'var(--gold)' });
        ctx.push(rsi > 70
            ? { text: `RSI ${rsi.toFixed(0)} — Overbought`, col: 'var(--bear)' }
            : rsi < 30
            ? { text: `RSI ${rsi.toFixed(0)} — Oversold`, col: 'var(--bull)' }
            : { text: `RSI ${rsi.toFixed(0)} — Neutral zone`, col: 'var(--muted)' });
        ctx.push(bbWidth > 4
            ? { text: `BB ${bbWidth.toFixed(1)}% — High volatility`, col: 'var(--bear)' }
            : bbWidth < 1.5
            ? { text: `BB ${bbWidth.toFixed(1)}% — Squeeze (breakout near)`, col: 'var(--gold)' }
            : { text: `BB ${bbWidth.toFixed(1)}% — Normal range`, col: 'var(--muted)' });
        ctx.push(stoch.k > 80
            ? { text: `Stoch ${stoch.k.toFixed(0)} — Overbought`, col: 'var(--bear)' }
            : stoch.k < 20
            ? { text: `Stoch ${stoch.k.toFixed(0)} — Oversold`, col: 'var(--bull)' }
            : { text: `Stoch ${stoch.k.toFixed(0)} — Mid-range`, col: 'var(--muted)' });
        ctxEl.innerHTML = ctx.map(c =>
            `<div style="display:flex;align-items:center;gap:6px;padding:4px 0">
                <div style="width:5px;height:5px;border-radius:50%;background:${c.col};flex-shrink:0"></div>
                <span class="text-xs" style="color:${c.col==='var(--muted)'?'#94a3b8':c.col}">${c.text}</span>
            </div>`
        ).join('');
    }

    // ── Risk Rating (1–5 dots)
    // Factors: low ADX + low conviction = high risk; high ADX + high conviction = low risk
    const riskScore = Math.min(5, Math.round(
        (adx.adx < 15 ? 2 : adx.adx < 25 ? 1 : 0) +
        (bbWidth > 6  ? 1.5 : bbWidth > 4 ? 0.5 : 0) +
        (tier === 'LOW' ? 2 : tier === 'MODERATE' ? 1 : 0) +
        (Math.abs(rsi - 50) < 10 ? 0.5 : 0)
    ));
    const riskLabels = ['', 'Very Low', 'Low', 'Moderate', 'High', 'Very High'];
    const riskColors = ['', 'var(--bull)', 'var(--bull)', 'var(--gold)', 'var(--bear)', 'var(--bear)'];
    const rd = $('fvRiskDots');
    if(rd) {
        rd.innerHTML = [1,2,3,4,5].map(i =>
            `<div class="risk-dot" style="background:${i <= riskScore ? riskColors[riskScore] : 'var(--border)'}"></div>`
        ).join('');
    }
    safeText('fvRiskLabel', `${riskLabels[riskScore]||'--'} Risk`);
    if($('fvRiskLabel')) $('fvRiskLabel').style.color = riskColors[riskScore]||'var(--muted)';

    // ── Trade levels
    safeText('fvEntry', fmtPrice(master.entry, dec));
    safeText('fvTP',    fmtPrice(master.tp,    dec));
    safeText('fvSL',    fmtPrice(master.sl,    dec));
    safeText('fvRR',    master.rr);
    safeText('fvATR',   fmtPrice(master.atr,   dec));
    safeText('fvScore', `${master.score}/10`);
    if($('fvScore')) $('fvScore').style.color = master.color;

    // TP/SL % distances
    if(master.entry > 0) {
        const tpPct = ((Math.abs(master.tp - master.entry)) / master.entry * 100).toFixed(2);
        const slPct = ((Math.abs(master.sl - master.entry)) / master.entry * 100).toFixed(2);
        safeText('fvTPpct', `+${tpPct}% from entry (ATR×3)`);
        safeText('fvSLpct', `-${slPct}% from entry (ATR×1.5)`);
    }

    // ── Summary line (footer)
    const asset = ASSETS[currentSymbol];
    const summaryParts = [];
    summaryParts.push(`${asset.name} on ${currentInterval.toUpperCase()}`);
    summaryParts.push(`${master.bullCount}/8 strategies bullish, ${master.bearCount}/8 bearish`);
    summaryParts.push(`Weighted consensus: ${master.dir}`);
    if(tier === 'VERY HIGH') summaryParts.push('🔥 Maximum conviction — strongest setup');
    else if(tier === 'HIGH') summaryParts.push('✅ High-confidence setup');
    else if(tier === 'MODERATE') summaryParts.push('⚠ Moderate — wait for confirmation');
    else summaryParts.push('🔶 Low conviction — avoid or reduce size');
    safeText('fvSummaryLine', summaryParts.join(' · '));

    // ── Indicator pills (footer)
    const pillsEl = $('fvPills');
    if(pillsEl) {
        const pills = [
            { label: `${master.bullCount}/8 BULL`, cls: master.bullCount >= 6 ? 'hc-strong-buy' : master.bullCount >= 4 ? 'hc-lean' : 'hc-neutral' },
            { label: `${master.bearCount}/8 BEAR`, cls: master.bearCount >= 6 ? 'hc-strong-sell' : master.bearCount >= 4 ? 'hc-lean' : 'hc-neutral' },
            { label: `ADX ${adx.adx.toFixed(0)}`, cls: adx.adx > 25 ? 'hc-strong-buy' : 'hc-neutral' },
            { label: `RSI ${rsi.toFixed(0)}`,     cls: rsi > 70 ? 'hc-strong-sell' : rsi < 30 ? 'hc-strong-buy' : 'hc-neutral' },
            { label: tier + ' CONVICTION',         cls: tier==='VERY HIGH'||tier==='HIGH' ? (master.isBull?'hc-strong-buy':'hc-strong-sell') : tier==='MODERATE'?'hc-lean':'hc-neutral' },
        ];
        pillsEl.innerHTML = pills.map(p => `<span class="hc-badge ${p.cls}">${p.label}</span>`).join('');
    }
}

function updateBanner(master, strategies, rsi, ema20v, ema50v, macdLast, sigLast, stoch, dec, adx) {
    const banner=$('signalBanner'); if(!banner) return;
    const type=master.dir==='BUY'?'buy':master.dir==='SELL'?'sell':master.dir.includes('LEAN')?'wait':'neutral';
    banner.className=type;
    const wordEl=$('bannerSignalWord');
    if(wordEl){ wordEl.textContent=master.dir; wordEl.style.color=master.color; wordEl.className=type!=='neutral'?'mono font-black signal-pulse':'mono font-black'; wordEl.style.fontSize='clamp(1.6rem,4vw,2.8rem)'; }
    safeText('bannerSignalSub',`${master.bullPct.toFixed(0)}% bull · ${master.bearPct.toFixed(0)}% bear · ${master.score}/10`);
    const asset=ASSETS[currentSymbol];
    safeText('bannerAssetLabel',`${asset.sym} · ${currentInterval.toUpperCase()}`);
    const buyC=strategies.filter(s=>s.dir==='BUY').length, sellC=strategies.filter(s=>s.dir==='SELL').length;
    safeText('bannerStratSummary',`${buyC}/8 BUY · ${sellC}/8 SELL · ADX ${adx.adx.toFixed(0)}`);
    $('tlRed').className   ='tl-dot tl-red'   +(type==='sell'?' on':'');
    $('tlYellow').className='tl-dot tl-yellow'+(type==='wait'?' on':'');
    $('tlGreen').className ='tl-dot tl-green' +(type==='buy'?' on':'');
    const rv=$('ringVal'); if(rv){ rv.style.strokeDashoffset=144.5*(1-master.score/10); rv.style.stroke=master.color; }
    const rt=$('ringText'); if(rt){ rt.textContent=master.score; rt.style.color=master.color; }
    // ── All levels read from master — single source of truth
    safeText('bannerEntry', fmtPrice(master.entry,dec));
    safeText('bannerTP',    fmtPrice(master.tp,   dec));
    safeText('bannerSL',    fmtPrice(master.sl,   dec));
    safeText('bannerRR',    master.rr);
    safeText('bannerTimestamp', new Date().toLocaleTimeString());
    const pills=[
        {label:`RSI ${rsi.toFixed(0)}`,cls:rsi>70?'ind-bear':rsi<30?'ind-bull':'ind-neut'},
        ...(ema20v&&ema50v?[{label:ema20v>ema50v?'EMA▲':'EMA▼',cls:ema20v>ema50v?'ind-bull':'ind-bear'}]:[]),
        ...(macdLast!==null&&sigLast!==null?[{label:macdLast>sigLast?'MACD▲':'MACD▼',cls:macdLast>sigLast?'ind-bull':'ind-bear'}]:[]),
        {label:`STOCH ${stoch.k.toFixed(0)}`,cls:stoch.k>80?'ind-bear':stoch.k<20?'ind-bull':'ind-neut'},
        {label:`ADX ${adx.adx.toFixed(0)}`,cls:adx.adx>25?'ind-bull':'ind-neut'},
    ];
    const pp=$('bannerPills'); if(pp) pp.innerHTML=pills.map(p=>`<span class="ind-badge ${p.cls}">${p.label}</span>`).join('');
    const newKey=type+'_'+currentSymbol+'_'+currentInterval;
    if(newKey!==lastSignalKey&&lastSignalKey!==''){
        showToast(master.dir,`${asset.sym} · ${master.bullPct.toFixed(0)}% bull · ${master.score}/10`,master.color);
        playSignalSound(type==='hold'||type==='wait'||type==='neutral'?'wait':type);
    }
    lastSignalKey=newKey;
}

// ─── NEWS ─────────────────────────────────────────────────────────────
async function fetchNews() {
    const feedEl=$('newsFeed'), tsEl=$('newsTimestamp');
    const asset=ASSETS[currentSymbol];
    const bullKW=/bullish|surge|rally|gain|pump|rise|breakout|buy|positive|record|ath|adoption/i;
    const bearKW=/bearish|crash|drop|fall|sell|decline|dump|fear|ban|hack|negative|warning|risk/i;

    try {
        let articles=[];

        if(FINNHUB_KEY.length>6) {
            // Finnhub — real financial news for all assets
            const cat=asset.type==='crypto'?'crypto':'forex';
            const d=await fetch(`https://finnhub.io/api/v1/news?category=${cat}&token=${FINNHUB_KEY}`).then(r=>r.json());
            if(Array.isArray(d)&&d.length) {
                const name=asset.name.toLowerCase();
                const symParts=asset.sym.toLowerCase().replace('/','');
                // Filter relevant news first, fallback to latest 8
                const rel=d.filter(a=>{ const t=(a.headline||'').toLowerCase(); return t.includes(name)||t.includes(symParts)||t.includes(symParts.slice(0,3)); });
                articles=(rel.length>2?rel:d).slice(0,8).map(a=>({ title:a.headline, url:a.url, source:a.source, time:a.datetime*1000 }));
                const nb=$('newsBadge'); if(nb){ nb.textContent='Finnhub'; nb.style.color='var(--bull)'; nb.style.borderColor='rgba(0,230,118,0.35)'; }
            }
        }

        // CryptoCompare fallback (always works, best for crypto)
        if(!articles.length) {
            const catMap={'BTCUSDT':'BTC','ETHUSDT':'ETH','SOLUSDT':'SOL','BNBUSDT':'BNB','XRPUSDT':'XRP','EURUSDT':'EUR','GBPUSDT':'GBP','AUDUSDT':'AUD','NZDUSDT':'NZD','USDJPY':'JPY','USDCAD':'CAD','USDCHF':'CHF','EURJPY':'EUR'};
            const tag=catMap[currentSymbol]||'BTC';
            const d=await fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${tag}&excludeCategories=Sponsored&lang=EN`).then(r=>r.json());
            articles=(d.Data||[]).slice(0,8).map(a=>({ title:a.title, url:a.url, source:a.source_info?.name||'News', time:a.published_on*1000 }));
            const nb=$('newsBadge'); if(nb){ nb.textContent='CryptoCompare'; nb.style.color='var(--gold)'; nb.style.borderColor='rgba(255,209,102,0.3)'; }
        }

        if(tsEl) tsEl.textContent=`Updated ${new Date().toLocaleTimeString()}`;
        if(!articles.length){ if(feedEl) feedEl.innerHTML=`<div class="text-center py-4 text-xs" style="color:var(--muted)">No news found for ${asset.sym}</div>`; return; }

        feedEl.innerHTML=articles.map(a=>{
            const ago=getTimeAgo(new Date(a.time));
            const title=(a.title||'').slice(0,92)+((a.title||'').length>92?'…':'');
            const sent=bullKW.test(a.title)?'bullish':bearKW.test(a.title)?'bearish':'';
            const dot=sent==='bullish'?'var(--bull)':sent==='bearish'?'var(--bear)':'var(--muted)';
            return `<div class="news-item ${sent}" onclick="window.open('${a.url}','_blank')"><div class="flex items-start gap-2"><div class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style="background:${dot}"></div><div><div class="text-xs font-semibold text-white leading-snug mb-0.5">${title}</div><div class="text-xs" style="color:var(--muted)">${a.source} · ${ago}</div></div></div></div>`;
        }).join('');
    } catch(e) {
        console.warn('News error',e);
        if(tsEl) tsEl.textContent='News unavailable';
        if(feedEl) feedEl.innerHTML=`<div class="text-center py-4 text-xs" style="color:var(--muted)"><i class="fa-solid fa-wifi-slash mb-2 block text-lg"></i>News temporarily unavailable.</div>`;
    }
}
function getTimeAgo(d){ const s=Math.floor((Date.now()-d.getTime())/1000); return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`; }

// ─── TICKER TAPE ──────────────────────────────────────────────────────
const TICKER_SYMS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','EURUSDT','GBPUSDT'];
async function updateTickerTape() {
    try {
        const results=await Promise.all(TICKER_SYMS.map(s=>fetch(bTicker(s)).then(r=>r.json()).catch(()=>null)));
        let items=results.map((d,i)=>{
            if(!d||d.code) return '';
            const sym=ASSETS[TICKER_SYMS[i]]?.sym||TICKER_SYMS[i];
            const p=parseFloat(d.lastPrice), chg=parseFloat(d.priceChangePercent);
            const dec=ASSETS[TICKER_SYMS[i]]?.decimals||2;
            const col=chg>=0?'var(--bull)':'var(--bear)';
            return `<span class="mono px-4" style="color:#e2eaf5"><span style="color:var(--muted)">${sym}</span> <span>${fmtPrice(p,dec)}</span> <span style="color:${col}">${chg>=0?'+':''}${chg.toFixed(2)}%</span></span><span style="color:var(--border);margin:0 4px">|</span>`;
        }).join('');
        // Ticker tape — no gold needed
        const tape=$('tickerTape');
        if(tape&&items){ tape.innerHTML=items+items; tape.style.animation='none'; tape.offsetHeight; tape.style.animation='tickerMove 60s linear infinite'; }
    } catch(e) {}
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────
function setupWebSocket() {
    const asset=ASSETS[currentSymbol];
    if(asset.type==='kraken') { setLiveStatus(true); return; }
    if(activeWebSocket?.readyState===WebSocket.OPEN||activeWebSocket?.readyState===WebSocket.CONNECTING) return;
    activeWebSocket=new WebSocket(bWS(currentSymbol));
    activeWebSocket.onopen=()=>setLiveStatus(true);
    activeWebSocket.onmessage=e=>{
        const d=JSON.parse(e.data);
        updatePriceUI(parseFloat(d.c), parseFloat(d.P));
    };
    activeWebSocket.onerror=()=>console.warn('WS error');
    activeWebSocket.onclose=()=>{ setLiveStatus(false); wsReconnectTimer=setTimeout(setupWebSocket,5000); };
}

// ─── ASSET UI ─────────────────────────────────────────────────────────
function updateAssetUI() {
    const asset=ASSETS[currentSymbol];
    safeText('assetName',asset.name); safeText('assetSymbolText',asset.sym);
    const logo=$('assetLogo'); if(logo) logo.src=asset.logo;
    safeText('statVolLabel',asset.volLabel);
    if(priceSection) priceSection.innerHTML=`<i class="fa-solid fa-circle-notch fa-spin text-2xl" style="color:var(--muted)"></i>`;
    if(priceChange) priceChange.innerHTML='--';
    ['statHigh','statLow','statVol','rsiValue','maValue','macdValue','bbValue','confluenceScore'].forEach(id=>safeText(id,'--'));
    if(signalText) signalText.textContent='--';
    if(signalSubtext) signalSubtext.textContent='Loading...';
    if(signalSection) signalSection.className='signal-neutral w-full rounded-2xl px-4 py-5 mb-3 transition-all duration-500';
    if(analysisTextEl) analysisTextEl.textContent='Gathering market data…';
    const cb=$('confluenceBar'); if(cb) cb.style.width='0%';
    const els=$('entryLevelsSection'); if(els) els.style.display='none';
    if(tradeEntry) tradeEntry.value='';
    latestClosePrice=0; prevPrice=0;
    const sc=$('strategyCards'); if(sc) sc.innerHTML=`<div class="sc-neutral strat-card text-center py-6" style="grid-column:1/-1"><i class="fa-solid fa-circle-notch fa-spin mr-2" style="color:var(--muted)"></i><span style="color:var(--muted)">Running 8 strategy analyses…</span></div>`;
    const mv=$('masterVerdictStrip'); if(mv) mv.classList.add('hidden');
    const ip=$('indicatorPanel'); if(ip) ip.innerHTML=`<div class="text-center py-6 text-sm" style="color:var(--muted)"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Loading…</div>`;
    if(calcPlaceholder) calcPlaceholder.classList.remove('hidden');
    if(calcResults) calcResults.classList.add('hidden');
    setLiveStatus(false);
}

// ─── RESET & START ────────────────────────────────────────────────────
function resetAndFetchData() {
    if(statsInterval) clearInterval(statsInterval);
    if(histInterval)  clearInterval(histInterval);
    if(newsInterval)  clearInterval(newsInterval);
    if(wsReconnectTimer) clearTimeout(wsReconnectTimer);
    if(activeWebSocket){ activeWebSocket.onclose=null; activeWebSocket.close(); activeWebSocket=null; }

    fetch24hStats();
    fetchHistoricalData();
    fetchNews();
    statsInterval = setInterval(fetch24hStats,       15000);
    histInterval  = setInterval(fetchHistoricalData,  60000);
    newsInterval  = setInterval(fetchNews,           120000);
    setupWebSocket();
}

// ─── EVENTS ───────────────────────────────────────────────────────────
document.querySelectorAll('.interval-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
        document.querySelectorAll('.interval-btn').forEach(b=>{ b.classList.remove('active'); b.style.color='var(--muted)'; });
        e.currentTarget.classList.add('active'); e.currentTarget.style.color='';
        currentInterval=e.currentTarget.dataset.interval;
        safeText('analysisTimeframe', e.currentTarget.textContent.trim());
        fetchHistoricalData();
        initTradingViewChart(); // update TV chart interval too
    });
});

$('assetSelector').addEventListener('change',e=>{
    currentSymbol=e.target.value;
    resetTVBridge();
    updateAssetUI();
    resetAndFetchData();
    updateTVWidgets();
    setTimeout(runMultiTimeframeAnalysis, 2000);
});

$('calcTradeBtn').addEventListener('click',()=>{
    // Use the live price from our own symbol feed (WebSocket/REST) — always accurate
    let entry=parseFloat($('tradeEntry').value);
    if(isNaN(entry)||entry<=0){
        if(latestClosePrice>0) entry=latestClosePrice;
        else{ alert('Waiting for live price.'); return; }
    }
    const type=$('tradeType').value, lev=parseFloat($('tradeLeverage').value)||1;
    const risk=parseFloat($('tradeRisk').value)||2, rew=parseFloat($('tradeReward').value)||6;
    const dec=ASSETS[currentSymbol].decimals;
    const tp=type==='long'?entry*(1+rew/lev/100):entry*(1-rew/lev/100);
    const sl=type==='long'?entry*(1-risk/lev/100):entry*(1+risk/lev/100);
    safeText('tpPrice',    fmtPrice(tp,dec));
    safeText('slPrice',    fmtPrice(sl,dec));
    safeText('entryDisplay',fmtPrice(entry,dec));
    safeText('tpPl',       `+${rew.toFixed(1)}% ROE`);
    safeText('slPl',       `-${risk.toFixed(1)}% ROE`);
    safeText('rrRatio',    `1:${(rew/risk).toFixed(1)}`);
    if(calcPlaceholder) calcPlaceholder.classList.add('hidden');
    if(calcResults) calcResults.classList.remove('hidden');
});

// Ticker tape refresh
setInterval(updateTickerTape, 30000);

// ═══════════════════════════════════════════════════════════════════════
//  TRADINGVIEW WIDGETS
// ═══════════════════════════════════════════════════════════════════════

function loadTVScript(callback) {
    if(window.TradingView) { callback(); return; }
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.onload = callback;
    document.head.appendChild(s);
}

function initTradingViewChart() {
    const sym = TV_SYMBOLS[currentSymbol]?.chart || 'BINANCE:BTCUSDT';
    const iv  = TV_IV(currentInterval);
    const el  = document.getElementById('tvChartContainer');
    if(!el) return;
    el.innerHTML = '';

    loadTVScript(() => {
        try {
            new TradingView.widget({
                container_id: 'tvChartContainer',
                symbol:       sym,
                interval:     iv,
                timezone:     'Etc/UTC',
                theme:        'dark',
                style:        '1',
                locale:       'en',
                toolbar_bg:   '#0d1624',
                enable_publishing: false,
                hide_top_toolbar: false,
                hide_legend:  false,
                save_image:   false,
                withdateranges: true,
                allow_symbol_change: true,
                // postMessage bridge — lets us capture TV's own live price
                customer_id: 'marketpulse_pro',
                publish_source: false,
                watchlist:    Object.values(TV_SYMBOLS).map(s=>s.chart),
                studies: [
                    'RSI@tv-basicstudies',
                    'MACD@tv-basicstudies',
                    'BB@tv-basicstudies',
                ],
                width:  '100%',
                height: 470,
                backgroundColor: '#0d1624',
                gridColor: '#1a2540',
                overrides: {
                    'paneProperties.background': '#0d1624',
                    'paneProperties.backgroundType': 'solid',
                },
            });
        } catch(e) {
            // Fallback: use iframe embed
            el.innerHTML = `<iframe
                src="https://www.tradingview.com/widgetembed/?frameElementId=tvChart&symbol=${encodeURIComponent(sym)}&interval=${iv}&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=1&saveimage=0&toolbarbg=0d1624&studies=RSI%40tv-basicstudies%7CMACD%40tv-basicstudies&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&showpopupbutton=1"
                style="width:100%;height:470px;border:none;"
                allowtransparency="true"
                frameborder="0"
                scrolling="no">
            </iframe>`;
        }
    });

    // Update the data-source badge to show which feed is driving the engine
    _updateDataSourceBadge();
}

function initTradingViewTA() {
    const sym = TV_SYMBOLS[currentSymbol]?.ta || 'BINANCE:BTCUSDT';
    const el  = document.getElementById('tvTAContainer');
    if(!el) return;
    el.innerHTML = `
        <iframe
            src="https://www.tradingview.com/widgetembed/?frameElementId=tvTA&symbol=${encodeURIComponent(sym)}&interval=${TV_IV(currentInterval)}&hidesidetoolbar=1&hidetoptoolbar=1&symboledit=0&saveimage=0&toolbarbg=0d1624&theme=dark&style=1&timezone=Etc%2FUTC&studies=TechnicalAnalysis%40tv-basicstudies"
            style="width:100%;height:470px;border:none;"
            allowtransparency="true"
            frameborder="0"
            scrolling="no">
        </iframe>`;
}

function initTVTicker() {
    const el = document.getElementById('tvTicker');
    if(!el) return;
    el.innerHTML = '';
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src  = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
        symbols: [
            {proName:'BINANCE:BTCUSDT', title:'Bitcoin'},
            {proName:'BINANCE:ETHUSDT', title:'Ethereum'},
            {proName:'BINANCE:SOLUSDT', title:'Solana'},
            {proName:'FX:EURUSD',       title:'EUR/USD'},
            {proName:'FX:GBPUSD',       title:'GBP/USD'},
            {proName:'FX:USDJPY',       title:'USD/JPY'},
            {proName:'TVC:GOLD',        title:'Gold'},
            {proName:'BINANCE:XRPUSDT', title:'Ripple'},
            {proName:'FX:AUDUSD',       title:'AUD/USD'},
            {proName:'FX:USDCAD',       title:'USD/CAD'},
        ],
        showSymbolLogo: true,
        colorTheme: 'dark',
        isTransparent: true,
        displayMode: 'adaptive',
        locale: 'en'
    });
    el.appendChild(script);
}

function initTVCalendar() {
    const el = document.getElementById('tvCalendarContainer');
    if(!el) return;
    el.innerHTML = `
        <iframe
            src="https://www.tradingview.com/widgetembed/?frameElementId=tvCal&widget=economic-calendar&theme=dark&locale=en&isTransparent=true&colorTheme=dark"
            style="width:100%;height:340px;border:none;background:transparent"
            allowtransparency="true"
            frameborder="0"
            scrolling="no">
        </iframe>`;
}

// Update all TradingView widgets when asset or interval changes
function updateTVWidgets() {
    initTradingViewChart();
    initTradingViewTA();
}

// ─── DATA SOURCE BADGE ────────────────────────────────────────────────
// Always shows Binance/Kraken — TV bridge disabled (caused cross-asset price bleed)
function _updateDataSourceBadge() {
    const badge = document.getElementById('dataSourceBadge');
    if(!badge) return;
    const asset = ASSETS[currentSymbol];
    const label = asset?.type === 'kraken' ? '📡 Kraken Feed' : '📡 Binance Feed';
    badge.textContent = label;
    badge.style.color = 'var(--accent)';
    badge.style.borderColor = 'rgba(0,212,255,0.3)';
    badge.style.background  = 'rgba(0,212,255,0.07)';
}

// ─── DATA SOURCE BADGE UPDATE ─────────────────────────────────────────
// Just updates the badge — no longer triggers re-analysis based on TV bridge
// (TV bridge disabled due to multi-symbol contamination issue)
setInterval(() => { _updateDataSourceBadge(); }, 10000);

// ═══════════════════════════════════════════════════════════════════════
//  MULTI-TIMEFRAME ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
const MTF_INTERVALS = ['5m','15m','1h','4h','1d'];
const MTF_IDS       = ['mtf5m','mtf15m','mtf1h','mtf4h','mtf1d'];
const MTF_SUB_IDS   = ['mtf5mSub','mtf15mSub','mtf1hSub','mtf4hSub','mtf1dSub'];
let mtfRunning = false;

async function runMultiTimeframeAnalysis() {
    if(mtfRunning) return;
    mtfRunning = true;

    const asset = ASSETS[currentSymbol];
    const results = [];

    for(let i = 0; i < MTF_INTERVALS.length; i++) {
        const iv = MTF_INTERVALS[i];
        const elId  = MTF_IDS[i];
        const subId = MTF_SUB_IDS[i];
        // Card is the parent div of the label element
        const labelEl = document.getElementById(elId);
        const cardEl  = labelEl ? labelEl.closest('.mtf-card') : null;

        try {
            let closes=[], highs=[], lows=[], opens=[], volumes=[];

            if(asset.type==='binance') {
                const d = await fetch(bKlines(currentSymbol, iv, 100)).then(r=>r.json());
                if(!Array.isArray(d)||d.code) throw new Error('fetch fail');
                opens=d.map(c=>parseFloat(c[1])); highs=d.map(c=>parseFloat(c[2]));
                lows=d.map(c=>parseFloat(c[3]));  closes=d.map(c=>parseFloat(c[4]));
                volumes=d.map(c=>parseFloat(c[5]));
            } else {
                const d = await fetch(kCandles(asset.krakenId, iv)).then(r=>r.json());
                if(d.error?.length) throw new Error(d.error[0]);
                const key=Object.keys(d.result).find(k=>k!=='last');
                const rows=d.result[key].slice(-100);
                opens=rows.map(c=>parseFloat(c[1])); highs=rows.map(c=>parseFloat(c[2]));
                lows=rows.map(c=>parseFloat(c[3]));  closes=rows.map(c=>parseFloat(c[4]));
                volumes=rows.map(c=>parseFloat(c[6]||0));
            }

            const price = closes[closes.length-1];
            const ema20v = calcEMA(closes,20)[closes.length-1];
            const ema50v = calcEMA(closes,50)[closes.length-1];
            const rsi    = calcRSI(closes,14);
            const macdD  = calcMACD(closes,12,26,9);
            const macdL  = macdD.macdLine[macdD.macdLine.length-1];
            const sigL   = macdD.signalLine[macdD.signalLine.length-1];
            const adx    = calcADX(highs,lows,closes,14);

            // Quick signal score
            let s = 0;
            if(price>ema20v&&ema20v>ema50v) s+=2; else if(price<ema20v&&ema20v<ema50v) s-=2;
            if(rsi<30) s+=2; else if(rsi>70) s-=2; else if(rsi>55) s+=0.5; else if(rsi<45) s-=0.5;
            if(macdL!==null&&sigL!==null) { if(macdL>sigL) s+=1.5; else s-=1.5; }
            if(adx.adx>25) { if(adx.plusDI>adx.minusDI) s+=1; else s-=1; }

            const norm = Math.max(-1,Math.min(1,s/6));
            const dir  = scoreToDir(norm);
            results.push(dir);

            // Update card
            const dColor={'BUY':'var(--bull)','SELL':'var(--bear)','LEAN BUY':'rgba(0,230,118,0.8)','LEAN SELL':'rgba(255,61,90,0.8)','HOLD':'var(--gold)'};
            const cCls={'BUY':'mtf-buy','SELL':'mtf-sell','LEAN BUY':'mtf-lean','LEAN SELL':'mtf-lean','HOLD':'mtf-hold'};
            safeText(elId, dir);
            const elNode = document.getElementById(elId);
            if(elNode) elNode.style.color = dColor[dir];
            safeText(MTF_SUB_IDS[i], `RSI ${rsi.toFixed(0)} · ADX ${adx.adx.toFixed(0)}`);
            if(cardEl) { cardEl.className=`mtf-card ${cCls[dir]}`; }

        } catch(e) {
            results.push('HOLD');
            safeText(elId, 'N/A');
        }

        // Small delay between fetches to avoid rate limiting
        await new Promise(r=>setTimeout(r,300));
    }

    // MTF Overall
    const bullCount = results.filter(r=>r==='BUY'||r==='LEAN BUY').length;
    const bearCount = results.filter(r=>r==='SELL'||r==='LEAN SELL').length;
    const badge = $('mtfOverall');
    if(badge) {
        if(bullCount>=4)        { badge.className='hc-badge hc-strong-buy'; badge.textContent=`${bullCount}/5 BULLISH`; }
        else if(bearCount>=4)   { badge.className='hc-badge hc-strong-sell'; badge.textContent=`${bearCount}/5 BEARISH`; }
        else if(bullCount>bearCount){ badge.className='hc-badge hc-lean'; badge.textContent=`${bullCount}/5 LEAN BULL`; }
        else if(bearCount>bullCount){ badge.className='hc-badge hc-lean'; badge.textContent=`${bearCount}/5 LEAN BEAR`; }
        else                    { badge.className='hc-badge hc-neutral'; badge.textContent='Mixed Signals'; }
    }
    const sumEl = $('mtfSummary');
    if(sumEl) {
        const allBull = bullCount===5, allBear = bearCount===5;
        sumEl.textContent = allBull ? '✅ All 5 timeframes aligned BULLISH — highest conviction signal' :
                            allBear ? '🔴 All 5 timeframes aligned BEARISH — highest conviction signal' :
                            `${bullCount} bull · ${bearCount} bear · ${5-bullCount-bearCount} neutral across all timeframes`;
        sumEl.style.color = allBull?'var(--bull)':allBear?'var(--bear)':'var(--muted)';
    }

    mtfRunning = false;
}

// ─── INIT ─────────────────────────────────────────────────────────────
initCharts();
updateAssetUI();
resetAndFetchData();
updateTickerTape();

// TradingView widgets load after a short delay (let main data load first)
setTimeout(() => {
    initTVTicker();
    initTVCalendar();
    initTradingViewChart();
    initTradingViewTA();
}, 800);

// Run MTF analysis after initial data loads
setTimeout(runMultiTimeframeAnalysis, 3000);
// Refresh MTF every 5 minutes
setInterval(runMultiTimeframeAnalysis, 300000);

// ── LIVE ENTRY PLACEHOLDER REFRESH ───────────────────────────────────
// Keeps the trade calculator entry placeholder in sync with the live price.
// Uses latestClosePrice which is always set by the WebSocket or REST feed
// for the exact currentSymbol — never contaminated by other assets.
setInterval(() => {
    if(latestClosePrice > 0 && tradeEntry && document.activeElement !== tradeEntry && !tradeEntry.value) {
        const dec = ASSETS[currentSymbol]?.decimals || 2;
        tradeEntry.placeholder = dec >= 4
            ? latestClosePrice.toFixed(dec)
            : latestClosePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
    }
}, 5000);

