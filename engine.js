/*
 * FairDraw engine — provably-fair randomness + draw simulations.
 *
 * This file is the SINGLE SOURCE OF TRUTH for every random decision.
 * It is loaded by index.html (browser) and verify.js (Node) so that the
 * animation and the independent verifier cannot possibly disagree.
 *
 * Everything here is pure and synchronous. No network, no Web Crypto,
 * no dependencies — so results are byte-identical in any JS runtime.
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.FairDraw = factory()
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict'

  /* ------------------------------------------------------------------ *
   * SHA-256 (FIPS 180-4)                                                *
   * ------------------------------------------------------------------ */

  const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ])

  function rotr (x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0 }

  /** @param {Uint8Array} msg @returns {Uint8Array} 32 bytes */
  function sha256 (msg) {
    const H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ])
    const len = msg.length
    const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
    padded.set(msg)
    padded[len] = 0x80
    const dv = new DataView(padded.buffer)
    dv.setUint32(padded.length - 8, Math.floor(len / 0x20000000))
    dv.setUint32(padded.length - 4, (len << 3) >>> 0)

    const w = new Uint32Array(64)
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
      for (let i = 16; i < 64; i++) {
        const x = w[i - 15]; const y = w[i - 2]
        const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0
        const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
      for (let i = 0; i < 64; i++) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0
        const ch = ((e & f) ^ (~e & g)) >>> 0
        const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
        const t2 = (S0 + maj) >>> 0
        h = g; g = f; f = e; e = (d + t1) >>> 0
        d = c; c = b; b = a; a = (t1 + t2) >>> 0
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
    }
    const out = new Uint8Array(32)
    const odv = new DataView(out.buffer)
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i])
    return out
  }

  /** HMAC-SHA256 (RFC 2104). @param {Uint8Array} key @param {Uint8Array} msg */
  function hmacSha256 (key, msg) {
    let k = key
    if (k.length > 64) k = sha256(k)
    const ipad = new Uint8Array(64)
    const opad = new Uint8Array(64)
    for (let i = 0; i < 64; i++) {
      const kb = i < k.length ? k[i] : 0
      ipad[i] = kb ^ 0x36
      opad[i] = kb ^ 0x5c
    }
    const inner = new Uint8Array(64 + msg.length)
    inner.set(ipad); inner.set(msg, 64)
    const ih = sha256(inner)
    const outer = new Uint8Array(96)
    outer.set(opad); outer.set(ih, 64)
    return sha256(outer)
  }

  /* ------------------------------------------------------------------ *
   * Encoding helpers                                                    *
   * ------------------------------------------------------------------ */

  const TE = new TextEncoder()
  const utf8 = (s) => TE.encode(String(s))
  const HEXCHARS = '0123456789abcdef'

  function toHex (bytes) {
    let s = ''
    for (let i = 0; i < bytes.length; i++) {
      s += HEXCHARS[bytes[i] >> 4] + HEXCHARS[bytes[i] & 15]
    }
    return s
  }

  /** SHA-256 of a string's UTF-8 bytes, hex out. Matches `printf %s "x" | sha256sum`. */
  function sha256Hex (str) { return toHex(sha256(utf8(str))) }

  /** 32 cryptographically random bytes as hex. Browser or Node. */
  function randomSeedHex () {
    const buf = new Uint8Array(32)
    const g = typeof self !== 'undefined' ? self : globalThis
    if (g.crypto && g.crypto.getRandomValues) {
      g.crypto.getRandomValues(buf)
    } else {
      const nodeCrypto = require('crypto')
      buf.set(nodeCrypto.randomBytes(32))
    }
    return toHex(buf)
  }

  /* ------------------------------------------------------------------ *
   * The random stream                                                   *
   * ------------------------------------------------------------------ *
   *
   *   block_i = HMAC-SHA256( key = utf8(serverSeed),
   *                          msg = utf8(`${clientSeed}:${nonce}:${i}`) )
   *
   * Blocks are concatenated i = 0, 1, 2, ... into one infinite byte
   * stream. Every decision below reads from that stream, in order.
   */
  class FairRng {
    constructor (serverSeed, clientSeed, nonce) {
      this.key = utf8(serverSeed)
      this.clientSeed = String(clientSeed)
      // NOT `| 0` — that is a ToInt32 coercion, so nonce 2^31 would silently
      // wrap to -2^31 and reuse another draw's byte stream. Values below 2^31
      // stringify identically either way, so existing draws are unaffected.
      this.nonce = Number(nonce)
      if (!Number.isInteger(this.nonce)) throw new Error('nonce must be an integer')
      this.blockIndex = -1
      this.block = null
      this.pos = 32
      this.bytesUsed = 0
    }

    nextByte () {
      if (this.pos >= 32) {
        this.blockIndex++
        this.block = hmacSha256(this.key, utf8(this.clientSeed + ':' + this.nonce + ':' + this.blockIndex))
        this.pos = 0
      }
      this.bytesUsed++
      return this.block[this.pos++]
    }

    nextUint32 () {
      const a = this.nextByte(), b = this.nextByte()
      const c = this.nextByte(), d = this.nextByte()
      return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
    }

    /**
     * Uniform integer in [0, n) with NO modulo bias — values in the
     * ragged tail above the largest multiple of n are rejected and a
     * fresh uint32 is drawn.
     */
    nextInt (n) {
      if (n <= 1) return 0
      // Above 2^32 the rejection limit floors to 0, every draw is rejected and
      // the loop never terminates — an infinite hang in every verifier, not a
      // wrong answer. Fail loudly instead.
      if (n > 4294967296) throw new Error('nextInt bound above 2^32: ' + n)
      const limit = Math.floor(4294967296 / n) * n
      let x
      do { x = this.nextUint32() } while (x >= limit)
      return x % n
    }

    pick (arr) { return arr[this.nextInt(arr.length)] }

    /** Fisher-Yates, in place. */
    shuffle (arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.nextInt(i + 1)
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t
      }
      return arr
    }
  }

  /* ------------------------------------------------------------------ *
   * Flavour tables (indexed from the same stream, so the commentary     *
   * is part of the verifiable record too)                               *
   * ------------------------------------------------------------------ */

  const FINISHERS = [
    'a top-rope splash', 'a spinning powerbomb', 'a steel-chair haymaker',
    'a running clothesline', 'a flying dropkick', 'a suplex over the top rope',
    'a corner spear', 'a diving elbow drop', 'a pop-up cutter',
    'a gorilla press toss', 'a moonsault from the turnbuckle', 'a backbreaker'
  ]

  const VERBS = [
    'slashes', 'blasts', 'smashes', 'skewers', 'hexes',
    'pummels', 'cleaves', 'zaps', 'clobbers', 'shivs'
  ]

  /* ------------------------------------------------------------------ *
   * Mode 1 — SPINNING WHEEL                                             *
   * ------------------------------------------------------------------ *
   * Winner = uniform index into the current pool; the picked name is
   * removed and the wheel respun. Because the only stream read is
   * nextInt(pool.length), and pool.length depends on how many picks have
   * happened rather than on how many were requested, drawing R places
   * always reproduces the first R' places of any shorter draw. Ranking
   * extra alternates therefore cannot change who won.
   */
  /* ------------------------------------------------------------------ *
   * Ticket entries                                                      *
   * ------------------------------------------------------------------ *
   * Someone who earns 5 entries holds 5 tickets, labelled "Ada #1" ...
   * "Ada #5". Tickets are ordinary unique entries, so the draw itself
   * needs no weighting maths at all — and because the labels are part of
   * the committed roster, who holds which ticket is pinned in advance
   * along with everything else.
   *
   * With groupBy 'holder', a person can win at most once: ranking walks
   * down the drawn tickets and keeps the first ticket of each new holder.
   */
  const TICKET_SEP = ' #'

  function holderOf (label) {
    const at = label.lastIndexOf(TICKET_SEP)
    return at === -1 ? label : label.slice(0, at)
  }

  /** Expand [{holder, entries}] into committed ticket labels, in order. */
  function makeTickets (entries) {
    const out = []
    for (const e of entries) {
      const n = e.entries
      if (!Number.isInteger(n) || n < 1) throw new Error('entries for ' + e.holder + ' must be a positive integer')
      if (String(e.holder).indexOf(TICKET_SEP) !== -1) throw new Error('holder name may not contain " #": ' + e.holder)
      for (let i = 1; i <= n; i++) out.push(e.holder + TICKET_SEP + i)
    }
    return out
  }

  function runWheel (rng, contestants, winnerCount, rankedCount, groupBy) {
    const pool = contestants.slice()
    const events = []
    const standings = []
    const byHolder = groupBy === 'holder'
    const distinct = new Set()
    while (pool.length > 0) {
      if (byHolder ? distinct.size >= rankedCount : standings.length >= rankedCount) break
      const idx = rng.nextInt(pool.length)
      const name = pool[idx]
      // No pool snapshot here: at 100k entrants those slices are O(N^2)
      // memory and exhausted a 4 GB heap. The renderer rebuilds each pool
      // by removing the names already drawn, which is exact.
      events.push({ type: 'spin', place: standings.length + 1, index: idx, winner: name })
      standings.push(name)
      if (byHolder) distinct.add(holderOf(name))
      pool.splice(idx, 1)
    }
    return { winners: standings.slice(0, winnerCount), standings, events }
  }

  /* ------------------------------------------------------------------ *
   * Mode 2 — ROYAL RUMBLE                                               *
   * ------------------------------------------------------------------ *
   * Entry order is a uniform shuffle. Entrants trickle in; once the ring
   * is full an elimination fires: two distinct occupants are drawn
   * uniformly and a fair coin decides who goes over the rope. After the
   * last entrant, eliminations continue until one is left.
   *
   * Every choice is made by ring POSITION, never by name, and entry
   * order is uniformly random — so the process is symmetric under
   * relabelling and each contestant wins with probability exactly 1/N.
   */
  function runRumble (rng, contestants, winnerCount) {
    const order = rng.shuffle(contestants.slice())
    const cap = Math.min(6, Math.max(3, Math.ceil(order.length / 2)))
    const ring = []
    const events = []
    const eliminated = []

    function eliminate () {
      const a = rng.nextInt(ring.length)
      let b = rng.nextInt(ring.length - 1)
      if (b >= a) b++
      const loserIsA = rng.nextInt(2) === 0
      const loserPos = loserIsA ? a : b
      const winnerPos = loserIsA ? b : a
      const loser = ring[loserPos]
      const victor = ring[winnerPos]
      const move = FINISHERS[rng.nextInt(FINISHERS.length)]
      ring.splice(loserPos, 1)
      eliminated.push(loser)
      events.push({ type: 'eliminate', winner: victor, loser, move, ring: ring.slice() })
    }

    for (let i = 0; i < order.length; i++) {
      ring.push(order[i])
      events.push({ type: 'enter', name: order[i], entrant: i + 1, ring: ring.slice() })
      if (ring.length >= cap) eliminate()
    }
    while (ring.length > 1) eliminate()

    const standings = [ring[0]].concat(eliminated.slice().reverse())
    return { winners: standings.slice(0, winnerCount), events, standings }
  }

  /* ------------------------------------------------------------------ *
   * Mode 3 — RPG HIT POINTS                                             *
   * ------------------------------------------------------------------ *
   * Everyone starts at 60 HP. Each round the living act in a freshly
   * shuffled order; each attacker strikes a uniformly chosen living
   * opponent. 8% miss, 12% crit (double damage), base damage 6-18.
   * Last one standing wins. Same symmetry argument as the rumble.
   */
  const RPG_HP = 60
  const RPG_MISS_PCT = 8
  const RPG_CRIT_PCT = 12
  const RPG_ROUND_CAP = 300

  function runRpg (rng, contestants, winnerCount) {
    const hp = contestants.map(() => RPG_HP)
    const alive = contestants.map(() => true)
    const events = []
    const kos = []
    let livingCount = contestants.length
    let round = 0

    while (livingCount > 1 && round < RPG_ROUND_CAP) {
      round++
      const order = rng.shuffle(contestants.map((_, i) => i).filter(i => alive[i]))
      events.push({ type: 'round', round })
      for (const attacker of order) {
        if (!alive[attacker] || livingCount < 2) continue
        const targets = contestants.map((_, i) => i).filter(i => alive[i] && i !== attacker)
        const target = targets[rng.nextInt(targets.length)]
        const missed = rng.nextInt(100) < RPG_MISS_PCT
        const crit = rng.nextInt(100) < RPG_CRIT_PCT
        const base = 6 + rng.nextInt(13) // 6..18
        const verb = VERBS[rng.nextInt(VERBS.length)]
        const dmg = missed ? 0 : (crit ? base * 2 : base)
        hp[target] = Math.max(0, hp[target] - dmg)
        events.push({
          type: 'attack',
          round,
          attacker: contestants[attacker],
          attackerIndex: attacker,
          target: contestants[target],
          targetIndex: target,
          dmg,
          missed,
          crit: !missed && crit,
          verb,
          hpAfter: hp[target]
        })
        if (hp[target] === 0) {
          alive[target] = false
          livingCount--
          kos.push(contestants[target])
          events.push({ type: 'ko', name: contestants[target], index: target, by: contestants[attacker] })
        }
      }
    }

    // Safety net: only reachable if the round cap is hit (effectively never).
    let survivor
    if (livingCount === 1) {
      survivor = contestants[alive.findIndex(Boolean)]
    } else {
      const stillUp = contestants.map((n, i) => i).filter(i => alive[i])
      // Ties are broken from the stream, not by roster position — this is the
      // only place identity could otherwise leak into a fairness decision.
      let best = stillUp[0]
      let tied = 1
      for (let k = 1; k < stillUp.length; k++) {
        const i = stillUp[k]
        if (hp[i] > hp[best]) { best = i; tied = 1 } else if (hp[i] === hp[best]) {
          tied++
          if (rng.nextInt(tied) === 0) best = i
        }
      }
      survivor = contestants[best]
      for (const i of stillUp) if (i !== best) kos.push(contestants[i])
      events.push({ type: 'timeout', winner: survivor })
    }

    const standings = [survivor].concat(kos.slice().reverse().filter(n => n !== survivor))
    return { winners: standings.slice(0, winnerCount), events, standings, finalHp: hp.slice() }
  }

  /* ------------------------------------------------------------------ *
   * Public API                                                          *
   * ------------------------------------------------------------------ */

  const MODES = ['wheel', 'rumble', 'rpg']

  /* ------------------------------------------------------------------ *
   * Rosters                                                             *
   * ------------------------------------------------------------------ *
   * A roster is either an explicit list of entries, or a numeric range.
   * A range is committed as the short string "range:1-10000" rather than
   * as its expansion, so a ten-thousand-ticket draw has a commitment a
   * person can read aloud and a receipt that does not carry ten thousand
   * rows. The expansion is implied and every verifier derives the same one.
   */
  const ROSTER_SEP = String.fromCharCode(31) // unit separator

  function makeRange (from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error('range bounds must be integers')
    if (to < from) throw new Error('range end is before its start')
    const out = []
    for (let i = from; i <= to; i++) out.push(String(i))
    return out
  }

  /** The exact string a roster contributes to the Draw ID. */
  function rosterKey (roster) {
    if (Array.isArray(roster)) return roster.join(ROSTER_SEP)
    if (roster && roster.kind === 'range') return 'range:' + roster.from + '-' + roster.to
    if (roster && roster.kind === 'tickets') {
      // One record per PERSON, not per ticket, so a 50,000-ticket draw commits
      // to a few hundred bytes. Count comes first: it is always digits followed
      // by a colon, so the holder name after it may contain anything, colons
      // included, and the record is still unambiguous to parse.
      return 'tickets:' + roster.entries
        .map(e => e.entries + ':' + e.holder)
        .join(ROSTER_SEP)
    }
    throw new Error('roster must be an array, or a {kind:"range"|"tickets"} spec')
  }

  /** Resolve whatever a caller supplied into the actual list of entries. */
  function resolveRoster (opts) {
    const r = opts.roster
    if (r && r.kind === 'range') return makeRange(r.from, r.to)
    if (r && r.kind === 'tickets') {
      if (!Array.isArray(r.entries)) throw new Error('ticket roster needs an entries array')
      return makeTickets(r.entries)
    }
    if (Array.isArray(opts.contestants)) return opts.contestants
    throw new Error('need either contestants or a range/tickets roster')
  }

  /* ------------------------------------------------------------------ *
   * Entropy source                                                      *
   * ------------------------------------------------------------------ *
   * Where the client seed comes from. 'manual' means a person typed it.
   * A drand spec names a PUBLIC BEACON ROUND — and because the round is
   * pinned into the Draw ID before that round has happened, nobody,
   * operator included, can know the seed at commit time. That is what
   * closes the nonce-grinding gap: there is nothing to grind against,
   * because the entropy does not exist yet.
   *
   * The engine never fetches anything. It only pins the promise; the
   * checking of it belongs to whatever has a network.
   */
  const DRAND_QUICKNET = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
  const DRAND_GENESIS = 1692803367
  const DRAND_PERIOD = 3

  /** The drand round covering a unix timestamp (seconds). */
  function drandRoundAt (unixSeconds) {
    return Math.floor((unixSeconds - DRAND_GENESIS) / DRAND_PERIOD) + 1
  }

  /** The unix time (seconds) at which a drand round is published. */
  function drandRoundTime (round) {
    return DRAND_GENESIS + (round - 1) * DRAND_PERIOD
  }

  /** The exact string an entropy source contributes to the Draw ID. */
  function entropyKey (entropy) {
    if (!entropy || entropy.source === 'manual') return 'manual'
    if (entropy.source === 'drand') {
      if (!Number.isInteger(entropy.round) || entropy.round < 1) {
        throw new Error('drand entropy needs a positive integer round')
      }
      return 'drand:' + (entropy.chain || DRAND_QUICKNET) + ':' + entropy.round
    }
    throw new Error('unknown entropy source: ' + entropy.source)
  }

  /**
   * Pins every input that affects the outcome into one short string, so
   * publishing the Draw ID before the draw makes the roster, the mode,
   * the winner count AND the server-seed commitment all tamper-evident.
   *
   * Two formats. 'fairdraw-2' additionally pins the alternate count and the
   * one-prize-per-person rule, because how deep the backup list runs and
   * whether repeats are collapsed both have to be fixed in advance too.
   * Any other version uses the original preimage, so receipts issued before
   * those existed still verify unchanged.
   *
   * `roster` may be the list of entries, a {kind:'range'} spec, or an
   * already-computed roster key string.
   */
  function drawId (commit, mode, winnerCount, roster, alternates, version, groupBy, draws, entropy) {
    const key = typeof roster === 'string' ? roster : rosterKey(roster)
    if (version === 'fairdraw-2') {
      return sha256Hex(['fairdraw-2', commit, mode, winnerCount, alternates | 0,
        groupBy || 'none', draws === undefined || draws === null ? 'open' : draws,
        typeof entropy === 'string' ? entropy : entropyKey(entropy), key].join('|'))
    }
    return sha256Hex([commit, mode, winnerCount, key].join('|'))
  }

  /**
   * Replay a draw. Deterministic: same inputs -> same winners, always.
   * @returns {{winners:string[], standings:string[], events:object[], bytesUsed:number}}
   */
  function run (opts) {
    const { mode, serverSeed, clientSeed, nonce } = opts
    const contestants = resolveRoster(opts)
    if (MODES.indexOf(mode) === -1) throw new Error('unknown mode: ' + mode)
    if (!Array.isArray(contestants) || contestants.length < 2) throw new Error('need at least 2 contestants')
    if (!/^[0-9a-f]{64}$/.test(String(serverSeed))) throw new Error('server seed must be 64 lowercase hex chars')
    if (contestants.some(n => typeof n !== 'string' || n.length === 0)) {
      throw new Error('every contestant must be a non-empty string')
    }
    // Duplicates would make the standings ambiguous (two entries share a name),
    // so they are rejected here rather than silently mis-ranked. Via a Set, not
    // indexOf: the quadratic version cost 2.4s at 60k entries and dominated the
    // entire draw.
    const seen = new Set()
    for (const n of contestants) {
      if (seen.has(n)) throw new Error('duplicate contestant: ' + n)
      seen.add(n)
    }
    // winnerCount is hashed into the Draw ID verbatim, so it must not be
    // silently clamped here — a clamped value would verify against a Draw ID
    // computed over the unclamped one.
    const winnerCount = opts.winnerCount
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > contestants.length) {
      throw new Error('winnerCount must be an integer between 1 and ' + contestants.length)
    }
    const alternates = opts.alternates === undefined ? 0 : opts.alternates
    if (!Number.isInteger(alternates) || alternates < 0) {
      throw new Error('alternates must be a non-negative integer')
    }
    if (winnerCount + alternates > contestants.length) {
      throw new Error('winners plus alternates cannot exceed ' + contestants.length + ' contestants')
    }
    if (!Number.isInteger(nonce) || nonce < 0 || nonce > Number.MAX_SAFE_INTEGER) {
      throw new Error('nonce must be a non-negative integer')
    }
    // How many draws this commitment authorises. Announcing it up front is
    // what makes a suppressed draw visible: an operator who privately runs
    // nonces 0,1,2 and publishes only the flattering one is now missing
    // receipts from a run everyone was told to expect. It does not make
    // grinding impossible — only conspicuous. Real entropy the operator
    // could not know at commit time is the actual fix.
    const draws = opts.draws
    if (draws !== undefined && draws !== null) {
      if (!Number.isInteger(draws) || draws < 1) throw new Error('draws must be a positive integer')
      if (nonce >= draws) {
        throw new Error('nonce ' + nonce + ' is outside the ' + draws + ' draw(s) this commitment authorises')
      }
    }

    const groupBy = opts.groupBy === undefined || opts.groupBy === null ? 'none' : opts.groupBy
    if (groupBy !== 'none' && groupBy !== 'holder') {
      throw new Error("groupBy must be 'none' or 'holder'")
    }

    const rankedCount = winnerCount + alternates
    const rng = new FairRng(serverSeed, clientSeed, nonce)
    let result
    if (mode === 'wheel') result = runWheel(rng, contestants, winnerCount, rankedCount, groupBy)
    else if (mode === 'rumble') result = runRumble(rng, contestants, winnerCount)
    else result = runRpg(rng, contestants, winnerCount)
    // The brawl modes rank the whole field as a side effect of playing out;
    // the wheel ranks exactly as many as asked. Publish the same depth either
    // way, so a receipt's shape does not depend on which game was chosen.
    if (groupBy === 'holder') {
      // Keep the first ticket drawn for each holder, so nobody wins twice.
      // This is a pure function of the drawn order, so a verifier reaches the
      // same answer from the published standings alone.
      const seenHolder = new Set()
      const ranked = []
      for (const label of result.standings) {
        const h = holderOf(label)
        if (seenHolder.has(h)) continue
        seenHolder.add(h)
        ranked.push(label)
        if (ranked.length >= rankedCount) break
      }
      result.standings = ranked
    } else {
      result.standings = result.standings.slice(0, rankedCount)
    }
    result.winners = result.standings.slice(0, winnerCount)
    result.alternates = result.standings.slice(winnerCount)
    result.bytesUsed = rng.bytesUsed
    return result
  }

  /**
   * Check a receipt end to end: commitment opens, Draw ID matches, and
   * replaying the algorithm reproduces the announced winners.
   * @returns {{ok:boolean, checks:Array<{name:string, ok:boolean, detail:string}>, winners:string[]}}
   */
  function verifyReceipt (receipt) {
    const checks = []
    const add = (name, ok, detail) => checks.push({ name, ok, detail })
    let winners = []

    // Shape-check first so a malformed receipt fails a check instead of
    // throwing a raw TypeError out of drawId().
    const missing = ['commit', 'serverSeed', 'mode', 'clientSeed', 'winners']
      .filter(k => receipt == null || receipt[k] === undefined || receipt[k] === null)
    const spec = receipt == null ? null : receipt.roster
    const hasSpec = !!(spec && (spec.kind === 'range' || spec.kind === 'tickets'))
    if (receipt == null || (!Array.isArray(receipt.contestants) && !hasSpec)) missing.push('contestants')
    if (!Array.isArray(receipt && receipt.winners)) {
      if (missing.indexOf('winners') === -1) missing.push('winners')
    }
    if (missing.length) {
      add('Receipt is well formed', false, 'missing or malformed: ' + missing.join(', '))
      return { ok: false, checks, winners }
    }

    const commitOk = sha256Hex(receipt.serverSeed) === receipt.commit
    add('Commitment opens', commitOk,
      commitOk
        ? 'SHA-256(serverSeed) equals the published commit'
        : 'SHA-256(serverSeed) = ' + sha256Hex(receipt.serverSeed) + ', published commit = ' + receipt.commit)

    // The Draw ID is what binds the roster, mode and winner count to the
    // commitment. A receipt that omits it has NOT proven those were fixed in
    // advance, so a missing Draw ID is a failure, never a pass.
    const id = drawId(receipt.commit, receipt.mode, receipt.winnerCount,
      hasSpec ? spec : receipt.contestants,
      receipt.alternates || 0, receipt.version, receipt.groupBy, receipt.draws, receipt.entropy)
    const idOk = id === receipt.drawId
    add('Draw ID matches', idOk,
      idOk
        ? 'roster, mode and winner count are unchanged since the commitment'
        : (receipt.drawId
            ? 'recomputed ' + id + ', receipt says ' + receipt.drawId
            : 'receipt states no Draw ID, so the roster was never pinned (expected ' + id + ')'))

    let replayOk = false
    let standingsOk = true
    try {
      const result = run(receipt)
      winners = result.winners
      replayOk = JSON.stringify(result.winners) === JSON.stringify(receipt.winners)
      add('Replay reproduces winners', replayOk,
        replayOk ? receipt.winners.join(', ') : 'replay produced: ' + result.winners.join(', '))
      // Standings are optional, but if published they are a claim about who
      // stands in line for an unclaimed prize, so they get checked too.
      if (Array.isArray(receipt.standings)) {
        standingsOk = JSON.stringify(result.standings) === JSON.stringify(receipt.standings)
        add('Standings reproduce', standingsOk,
          standingsOk
            ? receipt.standings.length + ' places ranked, alternates included'
            : 'replay produced: ' + result.standings.join(', '))
      }
    } catch (err) {
      add('Replay reproduces winners', false, String(err.message || err))
    }

    return { ok: commitOk && idOk && replayOk && standingsOk, checks, winners }
  }

  return {
    sha256, sha256Hex, hmacSha256, toHex, utf8,
    randomSeedHex, FairRng,
    MODES, drawId, run, verifyReceipt, makeTickets, holderOf, makeRange, rosterKey, resolveRoster,
    entropyKey, drandRoundAt, drandRoundTime,
    DRAND: { chain: DRAND_QUICKNET, genesis: DRAND_GENESIS, period: DRAND_PERIOD },
    constants: { RPG_HP, RPG_MISS_PCT, RPG_CRIT_PCT, RPG_ROUND_CAP, FINISHERS, VERBS }
  }
})
