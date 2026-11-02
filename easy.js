/*
 * Fair-Draw easy setup: PURE helpers for the 3-step wizard (no DOM, no
 * randomness, no network). The wizard only translates a host's input into
 * the same roster/settings the classic UI commits; the protocol is unchanged.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.FairEasy = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'
  var TICKET = /^(.*?)\s*(?:[,x]\s*(\d+)|,\s*(-\d+))\s*$/i

  /**
   * Parse a pasted roster. One entry per line, or comma-separated on a line.
   * A line "Name, 5" (last comma part an integer) is a ticket line; if any
   * line is, the whole roster becomes tickets (plain names count 1).
   * Returns { kind: 'names'|'tickets', names, entries, count, dupes }.
   */
  function parseEntries (text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim() }).filter(Boolean)
    var isTickets = lines.some(function (l) {
      var m = l.match(TICKET); return !!(m && m[1].trim() && m[1].indexOf(',') === -1)
    })
    var dupes = [], invalid = []
    if (isTickets) {
      var seenT = {}, entries = []
      lines.forEach(function (l) {
        var m = l.match(TICKET), holder, n
        if (m && m[1].trim() && m[1].indexOf(',') === -1) { holder = m[1].trim(); n = parseInt(m[2] || m[3], 10) } else { holder = l; n = 1 }
        if (!(n > 0)) { invalid.push(holder); return }
        var k = holder.toLowerCase()
        if (seenT[k] !== undefined) { dupes.push(holder); entries[seenT[k]].entries += n; return }
        seenT[k] = entries.length; entries.push({ holder: holder, entries: n })
      })
      var total = entries.reduce(function (a, e) { return a + e.entries }, 0)
      return { kind: 'tickets', names: entries.map(function (e) { return e.holder }), entries: entries, count: total, people: entries.length, dupes: dupes, invalid: invalid }
    }
    var seen = {}, names = []
    lines.forEach(function (l) {
      l.split(',').map(function (s) { return s.trim() }).filter(Boolean).forEach(function (n) {
        var k = n.toLowerCase()
        if (seen[k]) { dupes.push(n); return }
        seen[k] = 1; names.push(n)
      })
    })
    return { kind: 'names', names: names, entries: null, count: names.length, people: names.length, dupes: dupes, invalid: [] }
  }

  /**
   * Plain-English reason a roster can't be drawn yet, or '' if it is fine.
   * r is a parseEntries() result or { kind: 'range', count }.
   */
  function rosterError (r, max) {
    max = max || 200000
    if (r.invalid && r.invalid.length) return 'Ticket counts must be whole numbers of 1 or more — check: ' + r.invalid.slice(0, 3).join(', ') + '.'
    if (r.kind === 'range') {
      if (r.count === 0) return 'Enter both ends of the number range.'
      if (r.count < 2) return 'The range needs at least 2 numbers (e.g. 1 to 100).'
    } else if (r.count === 0) return 'Add at least 2 names — one per line or separated by commas.'
    else if (r.count < 2) return (r.dupes && r.dupes.length ? 'Only 1 unique name (duplicates are merged, ignoring case).' : 'Only 1 entry.') + ' Add at least one more.'
    if (r.count > max) return r.count.toLocaleString('en-US') + ' entries is over the ' + max.toLocaleString('en-US') + ' cap.'
    return ''
  }

  /** Count of a numeric range, order-insensitive; 0 if invalid. */
  function rangeCount (from, to) {
    var a = parseInt(from, 10), b = parseInt(to, 10)
    if (!isFinite(a) || !isFinite(b)) return 0
    return Math.abs(b - a) + 1
  }

  /** Clamp the winners stepper to [1, entrants-1] (at least 1). */
  function clampWinners (n, entrants) {
    n = parseInt(n, 10) || 1
    var max = Math.max(1, (entrants | 0) - 1)
    return Math.max(1, Math.min(n, max))
  }

  /** Short, human "post this in chat" text. */
  function chatPost (o) {
    var lines = []
    lines.push('🎲 ' + (o.appName || 'Fair-Draw') + ': ' + o.game + ' — ' + o.winners + ' winner' + (o.winners === 1 ? '' : 's') + ' from ' + o.count + ' entr' + (o.count === 1 ? 'y' : 'ies') + '.')
    lines.push('Draw ID ' + String(o.drawId).slice(0, 12) + ' · commit ' + String(o.commit).slice(0, 16) + '…')
    if (o.round) lines.push('Seed = public drand round ' + o.round + (o.at ? ' (~' + o.at + ')' : '') + ', which nobody knows yet.')
    else if (o.manualSeed) lines.push('Seed = "' + o.manualSeed + '" (announced before the draw).')
    lines.push('Full proof after the draw. ' + (o.site || ''))
    return lines.join('\n').trim()
  }

  /** Seconds left until a round publishes (never negative). */
  function secondsUntil (roundTimeSec, nowMs) {
    return Math.max(0, Math.ceil(roundTimeSec - nowMs / 1000))
  }

  var MODES = ['wheel', 'rumble', 'rpg', 'horse', 'battle', 'plinko', 'slots', 'claw', 'bracket']
  /** Sanitize remembered wizard prefs read back from localStorage. */
  function sanitizePrefs (raw) {
    var p = {}
    try { p = typeof raw === 'string' ? JSON.parse(raw) : (raw || {}) } catch (e) { p = {} }
    if (!p || typeof p !== 'object') p = {}
    return {
      text: typeof p.text === 'string' ? p.text.slice(0, 2000000) : '',
      useRange: !!p.useRange,
      from: isFinite(parseInt(p.from, 10)) ? parseInt(p.from, 10) : 1,
      to: isFinite(parseInt(p.to, 10)) ? parseInt(p.to, 10) : 100,
      mode: MODES.indexOf(p.mode) !== -1 ? p.mode : 'wheel',
      winners: Math.max(1, Math.min(50, parseInt(p.winners, 10) || 1)),
      twitch: !!p.twitch,
      chan: typeof p.chan === 'string' ? p.chan.replace(/[^a-z0-9_]/gi, '').slice(0, 25) : ''
    }
  }

  return { parseEntries: parseEntries, rosterError: rosterError, rangeCount: rangeCount, clampWinners: clampWinners, chatPost: chatPost, secondsUntil: secondsUntil, sanitizePrefs: sanitizePrefs, MODES: MODES }
})
