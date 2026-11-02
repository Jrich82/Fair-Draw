/*
 * Fair-Draw fun pack: fun game modes, suspense, synthesized sound, confetti,
 * speech, themes, Twitch !enter, winner card, share/QR/PWA/OBS.
 *
 * VISUAL ONLY. Winners, alternates and their order come from FairDraw.run()
 * via window.FairDrawUI.S.result. The rest of the show (who drops out when,
 * commentary, bracket) comes from FairShow.plan(), a separate HMAC stream.
 * There is no Math.random in this file.
 */
(function () {
'use strict';
var UI = window.FairDrawUI, Show = window.FairShow;
if (!UI || !Show) return;
var S = UI.S, $ = UI.$;
var LS = { get: function (k, d) { try { var v = localStorage.getItem('fd.' + k); return v === null ? d : v; } catch (e) { return d; } },
           set: function (k, v) { try { localStorage.setItem('fd.' + k, v); } catch (e) {} } };
var params = new URLSearchParams(location.search);
var APP = window.APP_CONFIG || { NAME: 'Fair-Draw', SITE: 'https://jrich82.github.io/Fair-Draw/' };
var SITE = APP.SITE;
function el(tag, attrs, kids) {
  var e = document.createElement(tag);
  for (var k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); }
  (kids || []).forEach(function (c) { e.appendChild(c); });
  return e;
}
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ------------------------------ sound ------------------------------ */
var muted = LS.get('mute', '0') === '1', speak = LS.get('speak', '0') === '1';
var AC = null;
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function tone(freq, dur, type, vol, when) {
  if (muted) return;
  try {
    var c = ac(), t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || .05, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + .02);
  } catch (e) {}
}
function noise(dur, vol, when) {
  if (muted) return;
  try {
    var c = ac(), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), r = mulberry(n);
    for (var i = 0; i < n; i++) d[i] = (r() * 2 - 1) * (1 - i / n);
    var s = c.createBufferSource(), g = c.createGain(), t = c.currentTime + (when || 0);
    s.buffer = b; g.gain.value = vol || .15; s.connect(g); g.connect(c.destination); s.start(t);
  } catch (e) {}
}
var SFX = {
  tick: function () { tone(1200, .03, 'square', .03); },
  thud: function () { tone(90, .25, 'sine', .25); noise(.08, .08); },
  whoosh: function () { noise(.35, .06); },
  drum: function (secs) { for (var t = 0; t < secs; t += .06) noise(.05, .05 + t / secs * .12, t); },
  fanfare: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, .35, 'triangle', .12, i * .14); }); tone(1047, .9, 'triangle', .1, .6); },
  boo: function () { tone(220, .3, 'sawtooth', .05); tone(180, .4, 'sawtooth', .05, .25); }
};

/* ----------------------------- confetti ---------------------------- */
function confetti(seedStr) {
  var cv = $('confetti') || document.body.appendChild(el('canvas', { id: 'confetti' }));
  var ctx = cv.getContext('2d'); cv.width = document.documentElement.clientWidth || innerWidth; cv.height = document.documentElement.clientHeight || innerHeight;
  var r = mulberry(parseInt((seedStr || '1').slice(0, 8), 16) || 1);
  var cols = ['#ffc84a', '#22e0d6', '#ff3d81', '#43d17a', '#ffffff', '#ff7a1a'];
  var ps = []; for (var i = 0; i < 220; i++) ps.push({ x: r() * cv.width, y: -r() * cv.height * .6, vx: (r() - .5) * 3, vy: 2 + r() * 4, s: 4 + r() * 6, a: r() * 6, va: (r() - .5) * .3, c: cols[i % cols.length] });
  var start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += .03; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (now - start < 4500) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(start);
}
function hype(name) {
  if (!speak || !window.speechSynthesis) return;
  try { var u = new SpeechSynthesisUtterance('Winner winner! ' + name + '!'); u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}

/* ------------------------------ themes ----------------------------- */
var THEMES = { '': 'Neon (default)', arcade: 'Retro Arcade', casino: 'Casino', cabin: 'Winter Cabin', ruraldegen: 'RuralDegen' };
function setTheme(t) {
  if (!THEMES.hasOwnProperty(t)) t = '';
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  LS.set('theme', t);
}
setTheme(params.get('theme') !== null ? params.get('theme') : LS.get('theme', ''));

/* --------------------------- header toolbar ------------------------ */
var bar = el('div', { 'class': 'funbar' });
var sel = el('select', { 'aria-label': 'Theme', id: 'theme-pick' });
Object.keys(THEMES).forEach(function (k) { var o = el('option', { value: k, text: THEMES[k] }); sel.appendChild(o); });
sel.value = document.documentElement.getAttribute('data-theme') || '';
sel.onchange = function () { setTheme(sel.value); };
var muteBtn = el('button', { 'class': 'btn small', id: 'mute-btn', title: 'Sound on/off' });
function paintMute() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
muteBtn.onclick = function () { muted = !muted; LS.set('mute', muted ? '1' : '0'); paintMute(); if (!muted) SFX.tick(); };
var speakBtn = el('button', { 'class': 'btn small', id: 'speak-btn', title: 'Announce the winner out loud (speech)' });
function paintSpeak() { speakBtn.textContent = speak ? '🗣 on' : '🗣 off'; }
speakBtn.onclick = function () { speak = !speak; LS.set('speak', speak ? '1' : '0'); paintSpeak(); };
paintMute(); paintSpeak();
[sel, muteBtn, speakBtn].forEach(function (x) { bar.appendChild(x); });
var header = document.querySelector('header'); header.insertBefore(bar, header.querySelector('nav'));

/* ---------------------------- fun modes ---------------------------- */
var token = 0;
function plan() {
  var r = S.receipt;
  return Show.plan({ serverSeed: S.serverSeed, clientSeed: r.clientSeed, nonce: r.nonce, contestants: S.contestants, standings: S.result.standings || S.result.winners });
}
function stage() { var s = $('stage'); s.innerHTML = ''; var f = el('div', { 'class': 'fun-stage' }); s.appendChild(f); return f; }
function overlay(host, text, cls) { var o = el('div', { 'class': 'fun-overlay pop ' + (cls || '') }); o.innerHTML = text; host.appendChild(o); return o; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function toast(host, text) { var old = host.querySelector('.toast'); if (old) old.remove(); host.appendChild(el('div', { 'class': 'toast', text: text })); }

/* 3-2-1 drumroll, then fn */
function countdown(host, t0, fn) {
  UI.at(t0, function () { SFX.drum(2.4); });
  ['3', '2', '1'].forEach(function (n, i) {
    UI.at(t0 + i * 800, function () { var o = host.querySelector('.fun-overlay.cd'); if (o) o.remove(); overlay(host, n, 'cd'); SFX.tick(); });
  });
  UI.at(t0 + 2400, function () { var o = host.querySelector('.fun-overlay.cd'); if (o) o.remove(); fn(); });
}
/* Final-two showdown + slow-mo near miss, then finish */
function finalTwo(host, p, t, onNearMiss, onWin) {
  var a = p.order[0], b = p.order[1];
  UI.at(t, function () { overlay(host, 'FINAL TWO<div class="vs">' + esc(a) + ' &nbsp;vs&nbsp; ' + esc(b) + '</div>', 'small ft'); SFX.whoosh(); UI.logLine('— FINAL TWO: ' + a + ' vs ' + b + ' —', 'rnd'); });
  UI.at(t + 1500, function () { var o = host.querySelector('.ft'); if (o) o.classList.add('fade'); });
  UI.at(t + 1900, function () { var o = host.querySelector('.ft'); if (o) o.remove(); host.classList.add('slowmo'); if (onNearMiss) onNearMiss(b); SFX.drum(1.6); });
  UI.at(t + 3600, function () { UI.logLine(p.quips[p.quips.length - 1]); if (onWin) onWin(a, b); SFX.thud(); });
  UI.at(t + 4600, function () { host.classList.remove('slowmo'); UI.finish(); });
}
function stepMs(n) { return Math.max(120, Math.min(1100, 16000 / Math.max(1, n))); }
/* names shown in big fields: everyone in the ranked set + up to `cap` others */
function cast(p, cap) { return p.order.length <= cap ? p.order.slice() : p.order.slice(0, cap); }

var MODES = {
  horse: function (host, p) {
    var names = cast(p, 24), r = mulberry(p.jitter.length * 7919 + 1);
    var box = el('div', { 'class': 'lanes' }), lanes = {};
    // lanes in roster order, not finishing order
    S.contestants.filter(function (n) { return names.indexOf(n) !== -1; }).forEach(function (n) {
      var h = el('span', { 'class': 'horse', text: '🏇 ' + n }), l = el('div', { 'class': 'lane' }, [h, el('div', { 'class': 'finish' })]);
      lanes[n] = { l: l, h: h, x: 0 }; box.appendChild(l);
    });
    host.appendChild(box);
    if (p.order.length > names.length) UI.logLine((p.order.length - names.length) + ' more entrants are in the field (showing ' + names.length + ' lanes)');
    var out = p.eliminations.filter(function (n) { return lanes[n]; }).slice(0, -1); // all but the runner-up
    var step = stepMs(out.length), t = 2600;
    countdown(host, 0, function () { UI.logLine('And they\'re off!', 'hl'); SFX.whoosh(); });
    out.forEach(function (n, i) {
      UI.at(t + i * step, function () {
        Object.keys(lanes).forEach(function (k) { var L = lanes[k]; if (L.l.classList.contains('out')) return; L.x = Math.min(70, L.x + 3 + r() * 6); L.h.style.left = L.x + '%'; });
        lanes[n].l.classList.add('out'); UI.logLine(p.quips[p.eliminations.indexOf(n)]); toast(host, p.quips[p.eliminations.indexOf(n)]); SFX.tick();
      });
    });
    finalTwo(host, p, t + out.length * step + 400,
      function (b) { lanes[p.order[0]].h.style.left = '76%'; lanes[b].h.style.left = '78%'; },
      function (a, b) { lanes[a].h.style.left = 'calc(100% - 140px)'; lanes[b].h.style.left = 'calc(100% - 175px)'; lanes[b].l.classList.add('out'); });
  },
  battle: function (host, p) {
    var names = cast(p, 80), chips = {}, g = el('div', { 'class': 'grid2' }), tag = el('div', { 'class': 'round-tag' });
    S.contestants.filter(function (n) { return names.indexOf(n) !== -1; }).forEach(function (n) { chips[n] = g.appendChild(el('span', { 'class': 'chip2', text: n })); });
    host.appendChild(tag); host.appendChild(g);
    var elim = p.eliminations.filter(function (n) { return chips[n]; }), rounds = [], left = elim.length + 1;
    var i = 0; while (left > 2) { var k = Math.max(1, Math.min(Math.ceil(left / 2), left - 2)); rounds.push(elim.slice(i, i + k)); i += k; left -= k; }
    var t = 2600, step = stepMs(elim.length);
    countdown(host, 0, function () { tag.textContent = 'FIGHT!'; });
    rounds.forEach(function (rd, ri) {
      UI.at(t, function () { tag.textContent = 'ROUND ' + (ri + 1) + ' — ' + rd.length + ' out'; UI.logLine('— ROUND ' + (ri + 1) + ' —', 'rnd'); SFX.whoosh(); });
      t += 600;
      rd.forEach(function (n) { UI.at(t, function () { chips[n].classList.add('out'); var q = p.quips[p.eliminations.indexOf(n)]; UI.logLine(q); toast(host, q); SFX.thud(); }); t += step; });
    });
    finalTwo(host, p, t + 300, function (b) { chips[b].classList.add('hot'); chips[p.order[0]].classList.add('hot'); },
      function (a, b) { chips[b].classList.remove('hot'); chips[b].classList.add('out'); chips[a].classList.add('win'); tag.textContent = 'LAST ONE STANDING'; });
  },
  bracket: function (host, p) {
    var wrap = el('div', { 'class': 'bracket' }), cells = [];
    // Big fields: show the last 6 rounds (64 entrants), earlier rounds are logged
    var R = p.bracket, from = Math.max(0, R.length - 6);
    for (var ri = 0; ri < from; ri++) UI.logLine('Round ' + (ri + 1) + ': ' + R[ri].filter(function (m) { return m.a && m.b; }).length + ' matches played');
    R.slice(from).forEach(function (rd, ci) {
      var col = el('div', { 'class': 'col' }); cells.push([]);
      rd.forEach(function (m) {
        var A = el('div', { text: ci === 0 || true ? (m.a || 'BYE') : '?' }), B = el('div', { text: m.b || 'BYE' }), box = el('div', { 'class': 'm' }, [A, B]);
        if (ci > 0) { A.textContent = '…'; B.textContent = '…'; }
        col.appendChild(box); cells[ci].push({ m: m, A: A, B: B });
      });
      wrap.appendChild(col);
    });
    host.appendChild(wrap);
    var t = 2600, total = cells.reduce(function (a, c) { return a + c.length; }, 0), step = stepMs(total) * 1.3;
    countdown(host, 0, function () { UI.logLine('Bracket is set. ' + p.order.length + ' entrants.', 'hl'); });
    cells.forEach(function (col, ci) {
      var last = ci === cells.length - 1;
      UI.at(t, function () { col.forEach(function (c) { c.A.textContent = c.m.a || 'BYE'; c.B.textContent = c.m.b || 'BYE'; }); UI.logLine(last ? '— THE FINAL —' : '— ROUND ' + (from + ci + 1) + ' —', 'rnd'); SFX.whoosh(); });
      t += 500;
      if (last) return;
      col.forEach(function (c) {
        UI.at(t, function () {
          var loser = c.m.winner === c.m.a ? c.m.b : c.m.a;
          (c.m.winner === c.m.a ? c.A : c.B).className = 'w'; if (loser) { (c.m.winner === c.m.a ? c.B : c.A).className = 'l'; UI.logLine(p.quips[p.eliminations.indexOf(loser)]); }
          SFX.tick();
        }); t += step;
      });
    });
    var fin = cells[cells.length - 1][0];
    finalTwo(host, p, t + 200, null, function (a) { (fin.m.a === a ? fin.A : fin.B).className = 'w'; (fin.m.a === a ? fin.B : fin.A).className = 'l'; });
  },
  slots: function (host, p) {
    var pool = cast(p, 30), box = el('div', { 'class': 'slots' }), reels = [];
    for (var i = 0; i < 3; i++) { var rl = el('div', { 'class': 'reel' }); rl.appendChild(el('div', { text: '?' })); box.appendChild(rl); reels.push(rl); }
    host.appendChild(box); var r = mulberry(pool.length * 31 + 7), a = p.order[0], b = p.order[1];
    function spin(rl, until, land, nearMiss) {
      var iv = setInterval(function () { rl.firstChild.textContent = pool[Math.floor(r() * pool.length)]; SFX.tick(); }, 70);
      S.timers.push(iv); // cleared by skip via clearTimeout (works for intervals too)
      UI.at(until, function () { clearInterval(iv); if (nearMiss) { rl.firstChild.textContent = nearMiss; UI.at(900, function () { rl.firstChild.textContent = land; rl.classList.add('locked'); SFX.thud(); }); } else { rl.firstChild.textContent = land; rl.classList.add('locked'); SFX.thud(); } });
    }
    countdown(host, 0, function () { SFX.whoosh(); });
    var elim = p.eliminations.slice(0, -1), step = Math.min(250, 6000 / Math.max(1, elim.length));
    UI.at(2600, function () { reels.forEach(function (rl, k) { spin(rl, 1500 + k * 1300, k < 2 ? a : null, null); }); });
    elim.slice(-6).forEach(function (n, i) { UI.at(2700 + i * step * 4, function () { UI.logLine(p.quips[p.eliminations.indexOf(n)]); }); });
    // third reel: stops on the runner-up first (near miss), then slips to the winner
    finalTwo(host, p, 4400, null, null);
    UI.at(4400 + 3500, function () { reels[2].firstChild.textContent = b; toast(host, 'So close, ' + b + '…'); });
    UI.at(4400 + 4300, function () { reels[2].firstChild.textContent = a; reels[2].classList.add('locked'); toast(host, 'JACKPOT!'); });
  },
  plinko: function (host, p) {
    var W = 560, H = 360, cv = el('canvas', { width: W, height: H, style: 'max-width:100%;display:block;margin:0 auto' }); host.appendChild(cv);
    var ctx = cv.getContext('2d'), rows = 9, slots = rows + 1, target = Math.floor(slots / 2), r = mulberry(p.order.length * 131 + 3), my = ++token;
    var labels = []; var others = p.order.slice(1);
    for (var i = 0; i < slots; i++) labels.push(i === target ? p.order[0] : (others[i % Math.max(1, others.length)] || ''));
    // path: exactly `target` rights out of `rows` steps, order from the cosmetic stream
    var path = []; for (i = 0; i < rows; i++) path.push(i < target ? 1 : 0);
    for (i = path.length - 1; i > 0; i--) { var j = Math.floor(p.jitter[i % p.jitter.length] * (i + 1)); var tmp = path[i]; path[i] = path[j]; path[j] = tmp; }
    var css = getComputedStyle(document.documentElement), gold = css.getPropertyValue('--gold') || '#ffc84a', ink = css.getPropertyValue('--dim') || '#888';
    function px(row, k) { return W / 2 + (k - row / 2) * (W / (slots + 1)); }
    function draw(bx, by) {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = ink;
      for (var y = 0; y < rows; y++) for (var k = 0; k <= y; k++) { ctx.beginPath(); ctx.arc(px(y, k), 30 + y * 30, 3, 0, 7); ctx.fill(); }
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      for (var s = 0; s < slots; s++) { var x = px(rows, s); ctx.fillStyle = ink; ctx.fillRect(x - W / (slots + 1) / 2 + 2, H - 50, W / (slots + 1) - 4, 2); ctx.save(); ctx.translate(x, H - 40); ctx.rotate(Math.PI / 2.4); ctx.fillText(String(labels[s]).slice(0, 12), 0, 0); ctx.restore(); }
      if (bx !== undefined) { ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(bx, by, 8, 0, 7); ctx.fill(); }
    }
    draw();
    countdown(host, 0, function () { SFX.whoosh(); });
    var elim = p.eliminations.slice(0, -1);
    elim.slice(-5).forEach(function (n, i) { UI.at(2600 + i * 400, function () { UI.logLine(p.quips[p.eliminations.indexOf(n)]); }); });
    UI.at(2600, function () {
      var k = 0, t0 = performance.now(), per = 520 / S.speed;
      (function frame(now) {
        if (my !== token) return;
        var e = (now - t0) / per, row = Math.min(rows, Math.floor(e)), f = Math.min(1, e - row);
        var kk = 0; for (var q = 0; q < row; q++) kk += path[q];
        var nk = kk + (row < rows ? path[row] : 0);
        var x1 = px(row, kk), x2 = row < rows ? px(row + 1, nk) : x1, y1 = 30 + row * 30 - 12;
        draw(x1 + (x2 - x1) * f, y1 + 30 * f - Math.sin(f * Math.PI) * 10 + (row >= rows ? 40 : 0));
        if (row < rows && f < .08) SFX.tick();
        if (row < rows) requestAnimationFrame(frame);
      })(t0);
    });
    finalTwo(host, p, 2600 + 520 * rows + 300, null, null);
  },
  claw: function (host, p) {
    var names = cast(p, 24), box = el('div', { 'class': 'claw-box' }), g = el('div', { 'class': 'grid2' }), claw = el('div', { 'class': 'claw', text: '🦀' }), chips = {};
    claw.textContent = '🪝';
    S.contestants.filter(function (n) { return names.indexOf(n) !== -1; }).forEach(function (n) { chips[n] = g.appendChild(el('span', { 'class': 'chip2', text: '🧸 ' + n })); });
    box.appendChild(claw); box.appendChild(g); host.appendChild(box);
    claw.style.left = '50%';
    function over(n) { var c = chips[n], bb = box.getBoundingClientRect(), cb = c.getBoundingClientRect(); claw.style.left = (cb.left - bb.left + cb.width / 2) + 'px'; }
    countdown(host, 0, function () { SFX.whoosh(); });
    var elim = p.eliminations.filter(function (n) { return chips[n]; }).slice(0, -1), step = Math.min(300, 5000 / Math.max(1, elim.length));
    elim.forEach(function (n, i) { UI.at(2600 + i * step, function () { chips[n].classList.add('out'); if (i >= elim.length - 5) UI.logLine(p.quips[p.eliminations.indexOf(n)]); }); });
    var t = 2600 + elim.length * step;
    finalTwo(host, p, t, function (b) { over(b); UI.at(1000, function () { claw.style.top = '200px'; chips[b].classList.add('hot'); }); UI.at(1700, function () { claw.style.top = '0px'; toast(host, 'It slipped! ' + b + ' drops back in…'); chips[b].classList.remove('hot'); SFX.boo(); }); },
      function (a) { over(a); chips[a].classList.add('win'); toast(host, 'GOT \'EM!'); });
  }
};

window.FunPack = {
  muted: function () { return muted; },
  handles: function (v) { return MODES.hasOwnProperty(v); },
  play: function () {
    token++;
    var p; try { p = plan(); } catch (e) { UI.logLine('show error: ' + e.message, 'crit'); UI.finish(); return; }
    MODES[S.visual](stage(), p);
  },
  onFinish: function () {
    token++;
    var w = S.result.winners[0];
    SFX.fanfare(); confetti(S.drawId); hype(w);
    var host = document.querySelector('.banner .who');
    if (host) { host.classList.remove('pop'); void host.offsetWidth; host.classList.add('pop'); }
  }
};
/* skip should also kill intervals (slots) — clearTimeout clears intervals too */

/* ------------------------------ Twitch ----------------------------- */
(function twitch() {
  var src = $('src-names'); if (!src) return;
  var ws = null, accepting = false, added = 0;
  var chan = el('input', { type: 'text', id: 'tw-chan', placeholder: 'twitch channel', spellcheck: 'false' });
  var go = el('button', { 'class': 'btn small', id: 'tw-go', text: 'Connect' });
  var lock = el('button', { 'class': 'btn small', id: 'tw-lock', text: 'Lock roster', disabled: 'disabled' });
  var st = el('div', { 'class': 'hint', id: 'tw-status', text: 'Read-only, anonymous. Viewers type !enter in chat. No login, no tokens.' });
  var box = el('div', { 'class': 'twitch' }, [el('div', { 'class': 'row' }, [el('span', { text: '📺 Twitch !enter' }), chan, go, lock]), st]);
  src.appendChild(box);
  function locked() { return S.locked; }
  function stop(msg) { accepting = false; if (ws) { try { ws.close(); } catch (e) {} ws = null; } go.textContent = 'Connect'; lock.disabled = true; if (msg) st.textContent = msg; }
  function addName(n) {
    if (!accepting || locked()) return;
    var ta = $('names'), cur = ta.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (cur.some(function (x) { return x.toLowerCase() === n.toLowerCase(); })) return;
    cur.push(n); ta.value = cur.join('\n'); added++; UI.refreshSize();
    st.textContent = 'Live in #' + chan.value.trim().toLowerCase() + ' — ' + added + ' joined from chat (' + cur.length + ' total). Last: ' + n;
  }
  go.onclick = function () {
    if (ws) { stop('Disconnected.'); return; }
    if (locked()) { st.textContent = 'Roster already locked for this commitment.'; return; }
    var c = chan.value.trim().toLowerCase().replace(/^#/, '');
    if (!/^[a-z0-9_]{2,25}$/.test(c)) { st.textContent = 'Enter a valid channel name.'; return; }
    try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); } catch (e) { st.textContent = 'WebSocket failed: ' + e.message; return; }
    go.textContent = 'Disconnect'; lock.disabled = false; st.textContent = 'Connecting…';
    ws.onopen = function () { ws.send('NICK justinfan' + (10000 + (Date.now() % 80000))); ws.send('JOIN #' + c); accepting = true; st.textContent = 'Listening in #' + c + ' for !enter'; };
    ws.onmessage = function (ev) {
      String(ev.data).split('\r\n').forEach(function (line) {
        if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); return; }
        var m = line.match(/^:([a-z0-9_]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/i);
        if (m && /^!enter\b/i.test(m[2].trim())) addName(m[1]);
      });
    };
    ws.onerror = function () { st.textContent = 'Twitch connection error (needs internet).'; };
    ws.onclose = function () { if (ws) stop('Disconnected from Twitch.'); };
  };
  lock.onclick = function () { stop('Roster locked: ' + added + ' joined from chat. Now press "Lock & commit" — the roster is bound into the Draw ID.'); };
  var lk = $('lock'); var orig = lk.onclick; lk.onclick = function () { if (ws) stop('Chat entry closed at commit.'); return orig.apply(this, arguments); };
})();

/* --------------------------- Winner card --------------------------- */
function cardVerified() {
  if (!S.receipt || !S.receipt.serverSeed || !S.verified) return false;
  try { return !!window.FairDraw.verifyReceipt(S.receipt).ok; } catch (e) { return false; }
}
function winnerCard() {
  var W = 1200, H = 630, c = el('canvas', { width: W, height: H }), x = c.getContext('2d');
  var css = getComputedStyle(document.documentElement);
  function v(n, d) { return (css.getPropertyValue(n) || d).trim() || d; }
  var g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, v('--bg', '#07080d')); g.addColorStop(1, v('--panel-2', '#161a26'));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = v('--gold', '#ffc84a'); x.lineWidth = 10; x.strokeRect(20, 20, W - 40, H - 40);
  x.textAlign = 'center'; x.fillStyle = v('--cyan', '#22e0d6'); x.font = 'bold 40px sans-serif'; x.fillText(APP.NAME.toUpperCase() + '  ·  WINNER', W / 2, 110);
  var name = S.result.winners[0], fs = 110; x.font = 'bold ' + fs + 'px sans-serif';
  while (x.measureText(name).width > W - 140 && fs > 30) { fs -= 6; x.font = 'bold ' + fs + 'px sans-serif'; }
  x.fillStyle = v('--gold', '#ffc84a'); x.fillText(name, W / 2, 270);
  var prize = ($('card-prize') && $('card-prize').value.trim()) || '';
  x.fillStyle = v('--ink', '#fff'); x.font = '36px sans-serif'; if (prize) x.fillText(prize, W / 2, 340);
  if (S.result.winners.length > 1) { x.font = '24px sans-serif'; x.fillText('also: ' + S.result.winners.slice(1).join(', ').slice(0, 80), W / 2, 385); }
  x.font = '26px sans-serif'; x.fillStyle = v('--dim', '#aaa');
  x.fillText(new Date(S.receipt.drawnAt || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + '   ·   Draw ID ' + S.drawId.slice(0, 12), W / 2, 450);
  // badge
  // badge: "Verified fair" only once the server seed is revealed AND the receipt re-verifies
  var ok = cardVerified();
  x.fillStyle = ok ? v('--good', '#43d17a') : v('--gold', '#ffc84a'); x.beginPath(); x.roundRect ? x.roundRect(W / 2 - 190, 480, 380, 56, 28) : x.rect(W / 2 - 190, 480, 380, 56); x.fill();
  x.fillStyle = '#000'; x.font = 'bold 28px sans-serif'; x.fillText(ok ? '✓ Verified fair' : '⏳ Pending reveal', W / 2, 518);
  x.fillStyle = v('--dim', '#aaa'); x.font = '22px sans-serif'; x.fillText(SITE + '  ·  free-entry giveaway', W / 2, 585);
  return c;
}
(function cardUi() {
  var row = document.querySelector('#banner .row') || $('banner');
  var prize = el('input', { type: 'text', id: 'card-prize', placeholder: 'Prize text for the card (optional)', style: 'max-width:260px' });
  var btn = el('button', { 'class': 'btn small', id: 'dl-card', text: 'Winner card (.png)' });
  btn.onclick = function () {
    if (!S.result) return;
    var c = winnerCard(), a = document.createElement('a');
    a.download = 'fairdraw-winner-' + S.drawId.slice(0, 8) + '.png'; a.href = c.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
  };
  var wrap = el('div', { style: 'flex:0 0 auto;display:flex;gap:6px' }, [prize, btn]);
  row.appendChild(wrap);
  window.FunPack.winnerCard = winnerCard; window.FunPack.cardVerified = cardVerified;
})();

/* ----------------------- Share / PWA / OBS footer ------------------ */
function pageUrl() { var u = new URL(location.href); u.hash = ''; u.searchParams.delete('obs'); return u.protocol === 'file:' ? SITE : u.toString(); }
function copy(text, b, label) {
  function done() { b.textContent = 'Copied ✓'; setTimeout(function () { b.textContent = label; }, 1500); }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { prompt('Copy this:', text); });
  else prompt('Copy this:', text);
}
(function footer() {
  var f = el('footer', { 'class': 'fun-footer', id: 'fun-footer' });
  f.innerHTML = '<p><b class="app-name"></b> &middot; v' + esc(APP.VERSION || '') + '</p><p><span class="free">Free-entry giveaways only.</span> No purchase, payment or wager may be required to enter. Not for raffles, lotteries or gambling. Check your local rules.</p>' +
    '<h3 style="margin:14px 0 4px">Share &amp; install</h3>';
  f.querySelector('.app-name').textContent = APP.NAME;
  var r = el('div', { 'class': 'share-row' });
  var bCopy = el('button', { 'class': 'btn small', id: 'share-copy', text: 'Copy link' });
  var bShare = el('button', { 'class': 'btn small', id: 'share-native', text: 'Share…' });
  var bObs = el('button', { 'class': 'btn small', id: 'share-obs', text: 'OBS link' });
  var bInst = el('button', { 'class': 'btn small primary hidden', id: 'install-btn', text: 'Install app' });
  bCopy.onclick = function () { copy(pageUrl(), bCopy, 'Copy link'); };
  bShare.onclick = function () { if (navigator.share) navigator.share({ title: APP.NAME, text: 'Provably fair giveaway picker', url: pageUrl() }).catch(function () {}); else copy(pageUrl(), bShare, 'Share…'); };
  bObs.onclick = function () {
    var u = new URL(pageUrl()); u.searchParams.set('obs', '1'); if (S.visual) u.searchParams.set('show', S.visual);
    var t = document.documentElement.getAttribute('data-theme'); if (t) u.searchParams.set('theme', t);
    // after the reveal, embed the full receipt so OBS replays (and re-verifies) this exact draw
    if (S.receipt && S.receipt.serverSeed) u.hash = 'receipt=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(S.receipt)))));
    copy(u.toString(), bObs, 'OBS link');
  };
  [bCopy, bShare, bObs, bInst].forEach(function (b) { r.appendChild(b); });
  f.appendChild(r);
  var qr = el('div', { id: 'qr-box' }); f.appendChild(qr);
  var ios = el('p', { 'class': 'hint hidden', id: 'ios-hint', html: 'On iPhone/iPad: tap <b>Share</b> &rarr; <b>Add to Home Screen</b> to install.' }); f.appendChild(ios);
  f.appendChild(el('p', { 'class': 'hint', html: 'OBS: copy the OBS link and add it as a Browser Source (transparent background, animation only). Run the draw here, reveal, then copy the OBS link again to replay that exact verified draw on stream. Press <b>H</b> in OBS (Interact) to show controls.' }));
  document.querySelector('.wrap').appendChild(f);
  try {
    if (window.qrcode) { var q = qrcode(0, 'M'); q.addData(pageUrl()); q.make(); qr.innerHTML = q.createImgTag(4, 8, 'QR code for ' + pageUrl()); }
  } catch (e) { qr.textContent = 'QR unavailable: ' + e.message; }
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; bInst.classList.remove('hidden'); });
  bInst.onclick = function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; bInst.classList.add('hidden'); }); };
  var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (isIos && !standalone) ios.classList.remove('hidden');
})();
if (/^https?:$/.test(location.protocol)) { // file:// blocks manifest fetches (CORS), so only link it when served
  document.head.appendChild(el('link', { rel: 'manifest', href: 'manifest.webmanifest' }));
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
}

/* Skip ends the show immediately: clear any lingering countdown / final-two banner. */
(function () { var sk = $('skip'); if (sk) sk.addEventListener('click', function () { document.querySelectorAll('#stage .fun-overlay.ft, #stage .fun-overlay.cd').forEach(function (o) { o.remove(); }); }); })();

/* ------------------------------- OBS ------------------------------- */
if (params.get('obs') === '1') {
  document.documentElement.classList.add('obs');
  document.addEventListener('keydown', function (e) { if (e.key === 'h' || e.key === 'H') document.documentElement.classList.toggle('obs-chrome'); });
  var sv = params.get('show');
  if (sv) { var mb = document.querySelector('.mode[data-mode="' + sv + '"]'); if (mb) mb.click(); }
  var m = location.hash.match(/receipt=([^&]+)/);
  if (m) {
    try { UI.replayReceipt(JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))), sv || undefined); }
    catch (e) { UI.logLine('OBS replay failed: ' + e.message, 'crit'); }
  } else UI.show('draw');
}
})();
