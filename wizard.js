/*
 * Fair-Draw easy setup: the default 3-step host flow (Add names -> Pick a
 * game -> Start). It is a thin driver over the classic UI: it fills the same
 * inputs and presses the same buttons (Lock & commit, Run, Reveal), so the
 * protocol, Draw ID and receipts are exactly the classic ones. It never
 * produces randomness itself (no Math.random); the server seed comes from
 * the classic lock (crypto.getRandomValues) and the client seed from drand
 * (or a typed seed the host chose in Advanced and announced first).
 */
(function () {
'use strict';
var UI = window.FairDrawUI, E = window.FairEasy, F = window.FairDraw;
if (!UI || !E || !F) return;
var S = UI.S, $ = UI.$;
var APP = window.APP_CONFIG || { NAME: 'Fair-Draw', SITE: 'https://jrich82.github.io/Fair-Draw/' };
var params = new URLSearchParams(location.search);
var KEY = 'fd.wiz';
function load() { try { return E.sanitizePrefs(localStorage.getItem(KEY)); } catch (e) { return E.sanitizePrefs(null); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
var P = load();
var LEAD = 45; // seconds ahead for the drand round (well inside 30-90s)

function el(tag, attrs, kids) {
  var e = document.createElement(tag);
  for (var k in attrs || {}) {
    if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function click(node) { if (node) node.click(); }

var GAMES = [
  ['wheel', '🎡', 'Wheel'], ['rumble', '🤼', 'Royal Rumble'], ['rpg', '⚔️', 'RPG HP'],
  ['horse', '🏇', 'Horse Race'], ['battle', '💥', 'Battle Royale'], ['plinko', '🔵', 'Plinko'],
  ['slots', '🎰', 'Slots'], ['claw', '🧸', 'Claw'], ['bracket', '🏆', 'Bracket']
];
function gameName(m) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i][0] === m) return GAMES[i][2]; return m; }

/* ------------------------------ shell ------------------------------ */
var root = el('section', { id: 'wiz', 'aria-live': 'polite' });
var header = document.querySelector('header');
header.parentNode.insertBefore(root, header.nextSibling);
var toEasy = el('button', { 'class': 'btn small', id: 'wiz-open', text: '✨ Easy setup', onclick: function () { enter(); } });
var nav = header.querySelector('nav'); if (nav) nav.appendChild(toEasy);

function enter() { document.body.classList.add('wiz'); try { localStorage.setItem('fd.ui', 'easy'); } catch (e) {} UI.show('setup'); go(step >= 3 && !S.locked ? 3 : step); }
function leave(tab) { document.body.classList.remove('wiz'); try { localStorage.setItem('fd.ui', 'classic'); } catch (e) {} UI.show(tab || 'setup'); }

var dots = el('div', { 'class': 'wiz-dots' });
['Add names', 'Pick a game', 'Start'].forEach(function (t, i) { dots.appendChild(el('span', { 'data-i': String(i + 1), text: (i + 1) + ' · ' + t })); });
var classicLink = el('button', { 'class': 'wiz-link', id: 'wiz-classic', text: 'Classic / advanced mode →', onclick: function () { leave('setup'); } });
root.appendChild(el('div', { 'class': 'wiz-top' }, [dots, classicLink]));
var screens = {};
function screen(id) { var s = el('div', { 'class': 'wiz-screen hidden', id: 'wiz-' + id }); root.appendChild(s); screens[id] = s; return s; }

/* --------------------------- 1. Add names -------------------------- */
var s1 = screen('1');
var ta = el('textarea', { id: 'wiz-names', 'aria-label': 'Entries, one per line or comma-separated', 'aria-describedby': 'wiz-count wiz-err1', spellcheck: 'false', placeholder: 'One name per line, or commas:\nAda\nBo, Cass, Dex\nTickets work too:  Eli, 5' });
ta.value = P.text || 'Ada\nBo\nCass\nDex\nEli\nFrankie\nGus\nHarper';
var count = el('div', { 'class': 'wiz-count', id: 'wiz-count', 'aria-live': 'polite' });
var useRange = el('input', { type: 'checkbox', id: 'wiz-userange' }); useRange.checked = P.useRange;
var rFrom = el('input', { type: 'number', id: 'wiz-from', inputmode: 'numeric', 'aria-label': 'Range start' }); rFrom.value = P.from;
var rTo = el('input', { type: 'number', id: 'wiz-to', inputmode: 'numeric', 'aria-label': 'Range end' }); rTo.value = P.to;
var rangeRow = el('div', { 'class': 'wiz-range' }, [rFrom, el('span', { text: 'to' }), rTo]);
var twOn = el('input', { type: 'checkbox', id: 'wiz-twitch' }); twOn.checked = P.twitch;
var twChan = el('input', { type: 'text', id: 'wiz-chan', placeholder: 'your Twitch channel', 'aria-label': 'Twitch channel', spellcheck: 'false', autocapitalize: 'off' }); twChan.value = P.chan;
var twBtn = el('button', { 'class': 'btn', id: 'wiz-tw-go', text: 'Listen for !enter' });
var twStat = el('div', { 'class': 'hint', id: 'wiz-tw-status' });
var twRow = el('div', { 'class': 'wiz-tw' }, [twChan, twBtn]);
var err1 = el('div', { 'class': 'err', id: 'wiz-err1', role: 'alert' });
s1.appendChild(el('h2', { text: 'Who’s in?' }));
s1.appendChild(el('p', { 'class': 'hint', text: 'Paste or type names. Order matters (it gets locked in).' }));
s1.appendChild(ta);
s1.appendChild(el('label', { 'class': 'wiz-toggle' }, [useRange, ' Use a number range instead']));
s1.appendChild(rangeRow);
s1.appendChild(el('label', { 'class': 'wiz-toggle' }, [twOn, ' 📺 Let Twitch chat type !enter']));
s1.appendChild(twRow); s1.appendChild(twStat);
s1.appendChild(count); s1.appendChild(err1);
s1.appendChild(el('div', { 'class': 'wiz-nav' }, [el('button', { 'class': 'btn primary big', id: 'wiz-next1', text: 'Next →', onclick: function () { var m = E.rosterError(roster()); if (!m) go(2); else { err1.textContent = m; (useRange.checked ? rFrom : ta).focus(); } } })]));

function roster() {
  if (useRange.checked) { var n = E.rangeCount(rFrom.value, rTo.value); return { kind: 'range', count: n, people: n, dupes: [], invalid: [] }; }
  return E.parseEntries(ta.value);
}
function paint1() {
  rangeRow.classList.toggle('hidden', !useRange.checked);
  ta.classList.toggle('hidden', useRange.checked);
  twRow.classList.toggle('hidden', !twOn.checked); twStat.classList.toggle('hidden', !twOn.checked);
  var r = roster(); err1.textContent = '';
  count.textContent = r.kind === 'tickets'
    ? r.count + ' ticket' + (r.count === 1 ? '' : 's') + ' · ' + r.people + (r.people === 1 ? ' person' : ' people')
    : r.count + ' entr' + (r.count === 1 ? 'y' : 'ies');
  if (r.dupes.length) count.textContent += '  (duplicate' + (r.dupes.length > 1 ? 's' : '') + ' merged: ' + r.dupes.slice(0, 3).join(', ') + ')';
  P.text = ta.value; P.useRange = useRange.checked; P.from = parseInt(rFrom.value, 10) || 1; P.to = parseInt(rTo.value, 10) || 1;
  P.twitch = twOn.checked; P.chan = twChan.value.trim().replace(/^#/, ''); save();
}
[ta, rFrom, rTo, twChan].forEach(function (x) { x.oninput = paint1; });
[useRange, twOn].forEach(function (x) { x.onchange = paint1; });

/* Twitch: reuse the classic listener (fun.js), mirroring new names back here. */
var twSync = null;
twBtn.onclick = function () {
  var c = $('tw-chan'), b = document.querySelector('.twitch .row button');
  if (!c || !b) { twStat.textContent = 'Twitch listener unavailable.'; return; }
  if (twSync) { click(b); clearInterval(twSync); twSync = null; twBtn.textContent = 'Listen for !enter'; twStat.textContent = 'Stopped listening.'; return; }
  if (useRange.checked) { useRange.checked = false; paint1(); }
  applyRoster();
  c.value = P.chan; click(b);
  twBtn.textContent = 'Stop listening';
  twSync = setInterval(function () {
    var have = {}; E.parseEntries(ta.value).names.forEach(function (n) { have[n.toLowerCase()] = 1; });
    var add = $('names').value.split('\n').map(function (s) { return s.trim(); }).filter(function (n) { return n && !have[n.toLowerCase()]; });
    if (add.length) { ta.value = ta.value.replace(/\s*$/, '') + '\n' + add.join('\n'); paint1(); }
    var st = document.querySelector('.twitch .hint, .twitch div:last-child'); if (st && st.textContent) twStat.textContent = st.textContent;
  }, 700);
};

/* --------------------------- 2. Pick a game ------------------------ */
var s2 = screen('2');
s2.appendChild(el('h2', { text: 'Pick a game' }));
var grid = el('div', { 'class': 'wiz-games', role: 'radiogroup', 'aria-label': 'Game' });
GAMES.forEach(function (g) {
  grid.appendChild(el('button', { 'class': 'wiz-game', 'data-mode': g[0], role: 'radio', 'aria-label': g[2],
    onclick: function () { P.mode = g[0]; save(); paint2(); } }, [el('span', { 'class': 'e', text: g[1] }), el('b', { text: g[2] })]));
});
s2.appendChild(grid);
var wOut = el('output', { id: 'wiz-winners', text: '1', 'aria-live': 'polite', 'aria-label': 'Number of winners' });
function bump(d) { P.winners = E.clampWinners(P.winners + d, entrants()); save(); paint2(); }
s2.appendChild(el('div', { 'class': 'wiz-stepper' }, [
  el('span', { text: 'Winners' }),
  el('button', { 'class': 'btn', id: 'wiz-wminus', 'aria-label': 'fewer winners', text: '−', onclick: function () { bump(-1); } }),
  wOut,
  el('button', { 'class': 'btn', id: 'wiz-wplus', 'aria-label': 'more winners', text: '+', onclick: function () { bump(1); } })
]));
var themeSel = el('select', { id: 'wiz-theme', 'aria-label': 'Theme' });
var src = $('theme-pick');
if (src) { Array.prototype.forEach.call(src.options, function (o) { themeSel.appendChild(el('option', { value: o.value, text: o.textContent })); }); }
themeSel.onchange = function () { if (src) { src.value = themeSel.value; src.dispatchEvent(new Event('change')); } };
s2.appendChild(el('label', { 'class': 'wiz-theme' }, ['Theme ', themeSel]));
s2.appendChild(el('div', { 'class': 'wiz-nav' }, [
  el('button', { 'class': 'btn big', id: 'wiz-back2', text: '← Back', onclick: function () { go(1); } }),
  el('button', { 'class': 'btn primary big', id: 'wiz-next2', text: 'Next →', onclick: function () { go(3); } })
]));
function entrants() { return roster().count; }
function paint2() {
  P.winners = E.clampWinners(P.winners, entrants());
  wOut.textContent = P.winners;
  Array.prototype.forEach.call(grid.children, function (b) { var on = b.dataset.mode === P.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
  if (src) themeSel.value = src.value;
}

/* ------------------------------ 3. Start --------------------------- */
var s3 = screen('3');
var summary = el('div', { 'class': 'wiz-summary', id: 'wiz-summary' });
var startBtn = el('button', { 'class': 'btn go huge', id: 'wiz-start', text: '▶ Start' });
var err3 = el('div', { 'class': 'err', id: 'wiz-err3', role: 'alert' });
var adv = el('details', { 'class': 'wiz-adv', id: 'wiz-adv' });
var advSeedSrc = el('select', { id: 'wiz-seedsrc' }, [el('option', { value: 'drand', text: 'Public drand beacon (recommended)' }), el('option', { value: 'manual', text: 'Typed seed (announce it first!)' })]);
var advSeed = el('input', { type: 'text', id: 'wiz-manualseed', placeholder: 'seed you already announced in chat', spellcheck: 'false' });
var advNonce = el('input', { type: 'number', id: 'wiz-nonce', value: '0', min: '0' });
var advDraws = el('input', { type: 'number', id: 'wiz-draws', value: '1', min: '1', max: '100' });
var advAlts = el('input', { type: 'number', id: 'wiz-alts', value: '0', min: '0', max: '50' });
var advOne = el('input', { type: 'checkbox', id: 'wiz-oneper' }); advOne.checked = true;
function field(lbl, inp) { return el('label', { 'class': 'wiz-field' }, [el('span', { text: lbl }), inp]); }
adv.appendChild(el('summary', { text: 'Advanced' }));
adv.appendChild(field('Seed source', advSeedSrc));
adv.appendChild(field('Typed seed', advSeed));
adv.appendChild(field('Nonce', advNonce));
adv.appendChild(field('Draws budget', advDraws));
adv.appendChild(field('Alternates', advAlts));
adv.appendChild(el('label', { 'class': 'wiz-toggle' }, [advOne, ' One prize per person (tickets)']));
adv.appendChild(el('div', { 'class': 'wiz-row' }, [
  el('button', { 'class': 'btn small', text: 'Raw commit / receipt fields', onclick: function () { leave('setup'); } }),
  el('button', { 'class': 'btn small', id: 'wiz-open-verify', text: 'Verifier form', onclick: function () { leave('verify'); } })
]));
var live = el('div', { 'class': 'wiz-live hidden', id: 'wiz-live' });
var post = el('textarea', { id: 'wiz-post', readonly: 'readonly', spellcheck: 'false' });
var copyBtn = el('button', { 'class': 'btn primary big', id: 'wiz-copy', text: '📋 Copy' });
var cd = el('div', { 'class': 'wiz-cd', id: 'wiz-cd' });
var cdMsg = el('div', { 'class': 'hint', id: 'wiz-cdmsg' });
var fail = el('div', { 'class': 'warn hidden', id: 'wiz-fail' });
var raw = el('details', { 'class': 'wiz-raw' }, [el('summary', { text: 'Raw commitment' }), el('div', { 'class': 'mono', id: 'wiz-raw' })]);
live.appendChild(el('h3', { text: 'Post this in chat' }));
live.appendChild(post);
live.appendChild(copyBtn);
live.appendChild(cd); live.appendChild(cdMsg); live.appendChild(fail); live.appendChild(raw);
var cancelBtn = el('button', { 'class': 'btn ghost', id: 'wiz-cancel', text: 'Cancel (new commitment)', onclick: function () { reset(); } });
live.appendChild(cancelBtn);
s3.appendChild(el('h2', { text: 'Ready?' }));
s3.appendChild(summary);
s3.appendChild(startBtn); s3.appendChild(err3);
s3.appendChild(live);
s3.appendChild(adv);
var nav3 = el('div', { 'class': 'wiz-nav' }, [el('button', { 'class': 'btn big', id: 'wiz-back3', text: '← Back', onclick: function () { go(2); } })]);
s3.appendChild(nav3);

function paint3() {
  var r = roster();
  summary.textContent = gameName(P.mode) + ' · ' + P.winners + ' winner' + (P.winners === 1 ? '' : 's') + ' · ' +
    (r.kind === 'tickets' ? r.count + ' tickets / ' + r.people + ' people' : r.count + ' entries');
  advSeed.parentNode.classList.toggle('hidden', advSeedSrc.value !== 'manual');
}
advSeedSrc.onchange = paint3;

/* Push wizard choices into the classic controls (same code path as classic). */
function applyRoster() {
  var r = roster();
  if (r.kind === 'range') { click(document.querySelector('.src[data-src="numbers"]')); $('numfrom').value = rFrom.value; $('numto').value = rTo.value; }
  else if (r.kind === 'tickets') { click(document.querySelector('.src[data-src="tickets"]')); $('tickets').value = r.entries.map(function (e) { return e.holder + ', ' + e.entries; }).join('\n'); $('oneper').checked = advOne.checked; }
  else { click(document.querySelector('.src[data-src="names"]')); $('names').value = r.names.join('\n'); }
  return r;
}

var timer = null, running = false;
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

startBtn.onclick = function () {
  err3.textContent = '';
  if (S.locked) click($('unlock'));
  if (twSync) twBtn.onclick();
  var r = applyRoster();
  click(document.querySelector('.mode[data-mode="' + P.mode + '"]'));
  $('winners').value = E.clampWinners(P.winners, r.count);
  $('alternates').value = Math.max(0, parseInt(advAlts.value, 10) || 0);
  $('draws').value = Math.max(1, parseInt(advDraws.value, 10) || 1);
  var manual = advSeedSrc.value === 'manual';
  var mseed = advSeed.value.trim();
  if (manual && !mseed) { err3.textContent = 'Type the seed you already announced in chat (Advanced), or switch back to drand.'; return; }
  UI.setSeedSource(manual ? 'manual' : 'drand');
  S.drandLead = LEAD;
  click($('lock'));
  if (!S.locked) { err3.textContent = $('setup-err').textContent || 'Could not lock the roster.'; return; }
  var nonce = Math.max(0, parseInt(advNonce.value, 10) || 0);
  if (nonce >= S.draws) { err3.textContent = 'Nonce must be below the draws budget.'; click($('unlock')); return; }
  $('nonce').value = nonce;
  running = true;
  startBtn.classList.add('hidden'); nav3.classList.add('hidden'); adv.open = false; adv.classList.add('hidden');
  live.classList.remove('hidden'); fail.classList.add('hidden');
  var at = manual ? '' : new Date(F.drandRoundTime(S.entropy.round) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  post.value = E.chatPost({ appName: APP.NAME, game: gameName(P.mode), winners: S.winnerCount, count: S.contestants.length,
    drawId: S.drawId, commit: S.commit, round: manual ? null : S.entropy.round, at: at, manualSeed: manual ? mseed : null, site: APP.SITE });
  $('wiz-raw').textContent = 'Draw ID ' + S.drawId + '\nCommit  ' + S.commit + (manual ? '\nSeed    typed: ' + mseed : '\nSeed    drand round ' + S.entropy.round);
  if (manual) {
    cd.textContent = 'Ready';
    cdMsg.textContent = 'Typed seed: make sure "' + mseed + '" was posted publicly before this commitment, then run.';
    fail.classList.remove('hidden'); fail.innerHTML = '';
    fail.appendChild(el('button', { 'class': 'btn go big', id: 'wiz-runmanual', text: 'Run the draw', onclick: function () { runWith(mseed); } }));
    return;
  }
  countdown();
};

copyBtn.onclick = function () {
  function ok() { copyBtn.textContent = 'Copied ✓'; setTimeout(function () { copyBtn.textContent = '📋 Copy'; }, 1500); }
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(post.value).then(ok, function () { post.select(); });
  else { post.select(); try { document.execCommand('copy'); ok(); } catch (e) {} }
};

function countdown() {
  var readyAt = F.drandRoundTime(S.entropy.round);
  cdMsg.textContent = 'Waiting for public drand round ' + S.entropy.round.toLocaleString() + '. Nobody — not even you — knows it yet.';
  stopTimer();
  function tick() {
    var left = E.secondsUntil(readyAt, Date.now());
    cd.textContent = left > 0 ? left + 's' : '…';
    if (left <= 0) { stopTimer(); fetchRound(0); }
  }
  tick(); timer = setInterval(tick, 250);
}
function fetchRound(attempt) {
  if (!running) return;
  cdMsg.textContent = 'Fetching drand round ' + S.entropy.round.toLocaleString() + '…';
  UI.fetchDrandRound(S.entropy.round).then(function (res) {
    if (!running) return;
    if (res.ok) { cdMsg.textContent = res.mirrors + ' of ' + res.asked + ' drand mirrors agree.'; runWith(res.randomness); return; }
    if (attempt < 2) { setTimeout(function () { fetchRound(attempt + 1); }, 3000); return; }
    showFail(res.reason);
  }, function (e) { if (attempt < 2) setTimeout(function () { fetchRound(attempt + 1); }, 3000); else showFail(String(e)); });
}
function showFail(reason) {
  cd.textContent = '⚠';
  cdMsg.textContent = '';
  fail.classList.remove('hidden'); fail.innerHTML = '';
  fail.appendChild(el('div', { html: '<b>Couldn’t reach the drand beacon</b> (' + String(reason).replace(/[<>&]/g, '') + '). Check your internet and retry — the round is already public, so retrying is safe.' }));
  fail.appendChild(el('button', { 'class': 'btn primary big', id: 'wiz-retry', text: '↻ Retry', onclick: function () { fail.classList.add('hidden'); fetchRound(0); } }));
  fail.appendChild(el('div', { 'class': 'hint', text: 'No internet? Cancel, open Advanced → “Typed seed”, announce a seed in chat FIRST, then Start again. Switching sources needs a new commitment, so it is never done automatically.' }));
}
function runWith(seed) {
  $('clientseed').value = seed;
  $('run-err').textContent = '';
  click($('run'));
  if (!S.result) { err3.textContent = $('run-err').textContent || 'Draw failed.'; return; }
  root.classList.add('playing');
}

/* --------------------------- winner screen ------------------------- */
var s4 = screen('win');
function onFinish() {
  if (!document.body.classList.contains('wiz') || !running) return;
  running = false;
  if (!S.receipt.serverSeed && !$('reveal').disabled) click($('reveal'));
  var ok = false; try { ok = !!F.verifyReceipt(S.receipt).ok; } catch (e) { ok = false; }
  S.verified = ok;
  setTimeout(function () { showWinner(ok); }, params.get('fast') ? 50 : 1600);
}
function showWinner(ok) {
  root.classList.remove('playing');
  s4.innerHTML = '';
  var w = S.result.winners;
  s4.appendChild(el('div', { 'class': 'wiz-trophy', text: '🏆' }));
  s4.appendChild(el('div', { 'class': 'wiz-winner', id: 'wiz-winner', text: w[0] }));
  if (w.length > 1) s4.appendChild(el('div', { 'class': 'wiz-also', text: 'Also winning: ' + w.slice(1).join(', ') }));
  var alts = (S.result.standings || []).slice(S.winnerCount);
  if (alts.length) s4.appendChild(el('div', { 'class': 'hint', text: 'Alternates: ' + alts.join(', ') }));
  s4.appendChild(el('div', { 'class': 'wiz-badge ' + (ok ? 'ok' : 'bad'), id: 'wiz-verdict', text: ok ? '✓ Verified fair — server seed revealed and replayed' : '✗ Receipt did not verify' }));
  s4.appendChild(el('button', { 'class': 'btn primary big', id: 'wiz-card', text: '🖼 Download winner card', onclick: function () { click($('dl-card')); } }));
  s4.appendChild(el('button', { 'class': 'btn go big', id: 'wiz-again', text: '🔁 Draw again (new commitment)', onclick: function () { reset(); go(3); click(startBtn); } }));
  var proof = el('details', { 'class': 'wiz-proof', id: 'wiz-proof' });
  proof.appendChild(el('summary', { text: 'Show proof' }));
  proof.appendChild(el('div', { 'class': 'mono', text: 'Draw ID ' + S.drawId + '\nCommit ' + S.commit + '\nServer seed ' + S.serverSeed + '\nClient seed ' + S.receipt.clientSeed + '\nNonce ' + S.receipt.nonce }));
  proof.appendChild(el('div', { 'class': 'wiz-row' }, [
    el('button', { 'class': 'btn', id: 'wiz-receipt', text: 'Download receipt (.json)', onclick: function () { click($('dl')); } }),
    el('button', { 'class': 'btn', id: 'wiz-verify', text: 'Open verifier', onclick: function () { leave('setup'); click($('tover')); } }),
    el('button', { 'class': 'btn', id: 'wiz-replay', text: 'Watch again', onclick: function () { root.classList.add('playing'); UI.show('draw'); click($('replay')); running = true; } })
  ]));
  s4.appendChild(proof);
  go('win');
  if (window.FunPack && window.FunPack.confetti) window.FunPack.confetti(S.drawId);
}
function reset() {
  running = false; stopTimer();
  if (S.locked) click($('unlock'));
  live.classList.add('hidden'); startBtn.classList.remove('hidden'); nav3.classList.remove('hidden'); adv.classList.remove('hidden');
  root.classList.remove('playing'); UI.show('setup');
}

/* ------------------------------ routing ---------------------------- */
var step = 1;
function go(n) {
  step = n;
  Object.keys(screens).forEach(function (k) { screens[k].classList.toggle('hidden', String(k) !== String(n)); });
  Array.prototype.forEach.call(dots.children, function (d) { var i = +d.dataset.i; d.classList.toggle('on', i === n); d.classList.toggle('done', n === 'win' || i < n); });
  if (n === 1) paint1(); if (n === 2) paint2(); if (n === 3) { paint2(); paint3(); }
  if (n !== 'win') UI.show('setup');
  window.scrollTo(0, 0);
}
window.FairDrawWizard = { onFinish: onFinish, go: go, enter: enter, leave: leave };

paint1();
var pref = null; try { pref = localStorage.getItem('fd.ui'); } catch (e) {}
if (params.get('classic') === '1' || params.get('obs') || params.get('r') || location.hash.length > 1 || pref === 'classic') { go(1); }
else { document.body.classList.add('wiz'); go(1); }
})();
