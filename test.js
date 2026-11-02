/*
 * FairDraw test suite — zero dependencies beyond Node's own `crypto`,
 * which is used ONLY as an independent cross-check. engine.js itself
 * never touches it.
 *
 *   node test.js
 *
 * Exits 0 if every test passes, 1 otherwise.
 */
'use strict'

const crypto = require('crypto')
const FairDraw = require('./engine.js')

/* ------------------------------------------------------------------ *
 * Tiny test harness                                                   *
 * ------------------------------------------------------------------ */

let passCount = 0
let failCount = 0
const failures = []
let notes = []

/** Detail a test wants printed underneath its own result line. */
function note (line) { notes.push(line) }

function test (name, fn) {
  notes = []
  let err = null
  try {
    fn()
  } catch (e) {
    err = e
  }
  if (err) {
    failCount++
    failures.push(name)
    console.log('  FAIL  ' + name)
  } else {
    passCount++
    console.log('  PASS  ' + name)
  }
  for (const line of notes) console.log('          ' + line)
  if (err) {
    const msg = String((err && err.message) || err)
    for (const line of msg.split('\n')) console.log('          ' + line)
  }
}

function section (title) {
  console.log('')
  console.log(title)
  console.log('-'.repeat(title.length))
}

function assert (cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

function assertEqual (actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg ? msg + '\n' : '') + 'expected: ' + expected + '\n  actual: ' + actual)
  }
}

/* ------------------------------------------------------------------ *
 * Statistics — real chi-square, no shortcuts                          *
 * ------------------------------------------------------------------ *
 *
 * chiSquareStat  : Pearson's X^2 = sum (O - E)^2 / E
 * chiSquareP     : upper-tail p-value = Q(df/2, X^2/2), the regularised
 *                  upper incomplete gamma function, computed with the
 *                  standard series / continued-fraction pair.
 * chiSquareCrit  : the critical value for a given tail area, found by
 *                  bisecting chiSquareP.
 */

function chiSquareStat (counts, expected) {
  let stat = 0
  for (let i = 0; i < counts.length; i++) {
    const d = counts[i] - expected
    stat += (d * d) / expected
  }
  return stat
}

// Lanczos approximation, g = 5, n = 6.
function logGamma (x) {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += c[j] / ++y
  return -tmp + Math.log(2.5066282746310005 * ser / x)
}

// Regularised lower incomplete gamma P(a,x) by series. Good for x < a+1.
function gammaSeries (a, x) {
  let ap = a
  let sum = 1 / a
  let del = sum
  for (let n = 0; n < 2000; n++) {
    ap++
    del *= x / ap
    sum += del
    if (Math.abs(del) < Math.abs(sum) * 1e-16) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

// Regularised upper incomplete gamma Q(a,x) by continued fraction (Lentz).
function gammaContinuedFraction (a, x) {
  const TINY = 1e-300
  let b = x + 1 - a
  let c = 1 / TINY
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 2000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < TINY) d = TINY
    c = b + an / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
}

/** P(X^2 >= stat) for `df` degrees of freedom. */
function chiSquareP (stat, df) {
  const a = df / 2
  const x = stat / 2
  if (x <= 0) return 1
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x)
}

/** The value v such that P(X^2 >= v) == tail. */
function chiSquareCrit (df, tail) {
  let lo = 0
  let hi = 10
  while (chiSquareP(hi, df) > tail) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (chiSquareP(mid, df) > tail) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

const bytes = (str) => new Uint8Array(Buffer.from(str, 'utf8'))
const repeatByte = (b, n) => new Uint8Array(n).fill(b)

function nodeSha256 (u8) {
  return crypto.createHash('sha256').update(Buffer.from(u8)).digest('hex')
}

function nodeHmac (key, msg) {
  return crypto.createHmac('sha256', Buffer.from(key)).update(Buffer.from(msg)).digest('hex')
}

function makeReceipt (opts) {
  const commit = FairDraw.sha256Hex(opts.serverSeed)
  const result = FairDraw.run(opts)
  return {
    version: 'fairdraw-1',
    drawId: FairDraw.drawId(commit, opts.mode, opts.winnerCount, opts.contestants),
    commit,
    mode: opts.mode,
    contestants: opts.contestants.slice(),
    winnerCount: opts.winnerCount,
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    winners: result.winners.slice(),
    serverSeed: opts.serverSeed,
    drawnAt: '2026-01-01T00:00:00.000Z'
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o))

// A fixed seed keeps the statistical tests reproducible: the numbers you
// see here are the numbers everyone sees.
const SEED_A = '4f2b8c1d9e0a37465b8c1d2e3f405162738495a6b7c8d9e0f1a2b3c4d5e6f708'
const SEED_B = 'a1b2c3d4e5f60718293a4b5c6d7e8f901122334455667788990aabbccddeeff0'

/* ================================================================== *
 * 1. SHA-256                                                          *
 * ================================================================== */

section('1. SHA-256 (FIPS 180-4)')

test('NIST vector: empty string', function () {
  assertEqual(FairDraw.sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('NIST vector: "abc"', function () {
  assertEqual(FairDraw.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('NIST vector: 448-bit two-block message', function () {
  assertEqual(FairDraw.sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
})

test('NIST vector: one million "a"', function () {
  const million = 'a'.repeat(1000000)
  assertEqual(FairDraw.sha256Hex(million),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
})

test('padding boundaries 55/56/63/64/119 bytes match Node crypto', function () {
  for (const len of [55, 56, 63, 64, 119]) {
    const msg = new Uint8Array(len)
    for (let i = 0; i < len; i++) msg[i] = (i * 37 + 11) & 0xff
    assertEqual(FairDraw.toHex(FairDraw.sha256(msg)), nodeSha256(msg),
      'length ' + len + ' (padded block boundary)')
  }
})

test('every length 0..200 matches Node crypto', function () {
  for (let len = 0; len <= 200; len++) {
    const msg = new Uint8Array(len)
    for (let i = 0; i < len; i++) msg[i] = (i * 173 + 7) & 0xff
    assertEqual(FairDraw.toHex(FairDraw.sha256(msg)), nodeSha256(msg), 'length ' + len)
  }
})

test('random lengths up to 5000 bytes match Node crypto', function () {
  for (let t = 0; t < 60; t++) {
    const len = crypto.randomInt(0, 5000)
    const msg = new Uint8Array(crypto.randomBytes(len))
    assertEqual(FairDraw.toHex(FairDraw.sha256(msg)), nodeSha256(msg), 'length ' + len)
  }
})

test('sha256Hex matches Node on multi-byte UTF-8', function () {
  for (const s of ['Ada', 'naïve café', '日本語テスト', 'emoji: 🎲🎯', 'a\u0000b']) {
    assertEqual(FairDraw.sha256Hex(s),
      crypto.createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s))
  }
})

/* ================================================================== *
 * 2. HMAC-SHA256                                                      *
 * ================================================================== */

section('2. HMAC-SHA256 (RFC 2104 / RFC 4231)')

const RFC4231 = [
  {
    name: 'RFC 4231 case 1 (20-byte key, "Hi There")',
    key: repeatByte(0x0b, 20),
    msg: bytes('Hi There'),
    mac: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
  },
  {
    name: 'RFC 4231 case 2 ("Jefe", short key)',
    key: bytes('Jefe'),
    msg: bytes('what do ya want for nothing?'),
    mac: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
  },
  {
    name: 'RFC 4231 case 3 (0xaa x20 key, 0xdd x50 data)',
    key: repeatByte(0xaa, 20),
    msg: repeatByte(0xdd, 50),
    mac: '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe'
  },
  {
    name: 'RFC 4231 case 4 (25-byte incrementing key, 0xcd x50 data)',
    key: new Uint8Array(Array.from({ length: 25 }, (_, i) => i + 1)),
    msg: repeatByte(0xcd, 50),
    mac: '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b'
  }
]

for (const v of RFC4231) {
  test(v.name, function () {
    assertEqual(FairDraw.toHex(FairDraw.hmacSha256(v.key, v.msg)), v.mac)
    // belt and braces: Node must agree with the published vector too
    assertEqual(nodeHmac(v.key, v.msg), v.mac, 'Node crypto disagrees with the RFC vector')
  })
}

test('key longer than the 64-byte block is hashed first (RFC 4231 case 5 style)', function () {
  const key = repeatByte(0xaa, 131)
  const msg = bytes('Test Using Larger Than Block-Size Key - Hash Key First')
  assertEqual(FairDraw.toHex(FairDraw.hmacSha256(key, msg)), nodeHmac(key, msg))
})

test('random keys/messages of assorted lengths match Node crypto', function () {
  const lengths = [0, 1, 15, 31, 32, 33, 63, 64, 65, 100, 128, 200, 1000]
  for (const kl of lengths) {
    for (const ml of [0, 1, 32, 64, 65, 200, 1500]) {
      const key = new Uint8Array(crypto.randomBytes(kl))
      const msg = new Uint8Array(crypto.randomBytes(ml))
      assertEqual(FairDraw.toHex(FairDraw.hmacSha256(key, msg)), nodeHmac(key, msg),
        'key ' + kl + ' bytes, msg ' + ml + ' bytes')
    }
  }
})

test('the RNG stream itself matches an independent HMAC implementation', function () {
  const rng = new FairDraw.FairRng(SEED_A, 'crowd-seed', 7)
  for (let block = 0; block < 4; block++) {
    const expected = crypto.createHmac('sha256', Buffer.from(SEED_A, 'utf8'))
      .update('crowd-seed:7:' + block, 'utf8').digest('hex')
    let got = ''
    for (let i = 0; i < 32; i++) got += rng.nextByte().toString(16).padStart(2, '0')
    assertEqual(got, expected, 'block ' + block)
  }
})

/* ================================================================== *
 * 3. Determinism                                                      *
 * ================================================================== */

section('3. Determinism')

for (const mode of FairDraw.MODES) {
  test('50 identical replays in "' + mode + '" mode', function () {
    const opts = {
      mode,
      contestants: ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'],
      serverSeed: SEED_A,
      clientSeed: 'block-height-871402',
      nonce: 3,
      winnerCount: 3
    }
    const first = FairDraw.run(opts)
    const winners = JSON.stringify(first.winners)
    const events = JSON.stringify(first.events)
    for (let i = 0; i < 50; i++) {
      const again = FairDraw.run(opts)
      assertEqual(JSON.stringify(again.winners), winners, 'winners diverged on run ' + (i + 2))
      assertEqual(JSON.stringify(again.events), events, 'events diverged on run ' + (i + 2))
      assertEqual(again.bytesUsed, first.bytesUsed, 'byte usage diverged on run ' + (i + 2))
    }
    assert(first.events.length > 0, 'no events produced')
  })
}

test('run() does not mutate the contestants array it is given', function () {
  const roster = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli']
  const before = roster.join('|')
  for (const mode of FairDraw.MODES) {
    FairDraw.run({ mode, contestants: roster, serverSeed: SEED_A, clientSeed: 'x', nonce: 1, winnerCount: 2 })
    assertEqual(roster.join('|'), before, 'roster mutated by "' + mode + '" mode')
  }
})

test('a one-character change to any input changes the outcome stream', function () {
  const base = {
    mode: 'wheel',
    contestants: ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'],
    serverSeed: SEED_A,
    clientSeed: 'abc',
    nonce: 1,
    winnerCount: 8
  }
  const ref = JSON.stringify(FairDraw.run(base).winners)
  const seedTweak = SEED_A.slice(0, 63) + (SEED_A[63] === '8' ? '9' : '8')
  assert(JSON.stringify(FairDraw.run(Object.assign({}, base, { serverSeed: seedTweak })).winners) !== ref,
    'server seed change had no effect')
  assert(JSON.stringify(FairDraw.run(Object.assign({}, base, { clientSeed: 'abd' })).winners) !== ref,
    'client seed change had no effect')
  assert(JSON.stringify(FairDraw.run(Object.assign({}, base, { nonce: 2 })).winners) !== ref,
    'nonce change had no effect')
})

/* ================================================================== *
 * 4. Uniformity — the test that actually proves fairness              *
 * ================================================================== */

section('4. Uniformity of winners (chi-square, 6000 draws per mode)')

test('chi-square implementation agrees with published critical values', function () {
  const known = [
    [1, 3.841459, 0.05],
    [2, 5.991465, 0.05],
    [4, 9.487729, 0.05],
    [4, 18.466827, 0.001],
    [6, 22.457744, 0.001],
    [99, 148.230, 0.001]
  ]
  for (const [df, x, tail] of known) {
    const p = chiSquareP(x, df)
    assert(Math.abs(p - tail) < tail * 0.01,
      'P(X^2 >= ' + x + ' | df=' + df + ') = ' + p.toFixed(6) + ', expected ~' + tail)
  }
  assertEqual(chiSquareP(0, 4), 1, 'zero statistic must give p = 1')
  assert(Math.abs(chiSquareCrit(4, 0.001) - 18.4668) < 0.001,
    'inverted critical value for df=4 is ' + chiSquareCrit(4, 0.001))
})

const UNIFORM_DRAWS = 6000
const UNIFORM_ROSTER = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli']
const CRIT_4DF_999 = 18.467 // 99.9th percentile, 4 degrees of freedom

for (const mode of FairDraw.MODES) {
  test('winner distribution is uniform in "' + mode + '" mode', function () {
    const counts = new Array(UNIFORM_ROSTER.length).fill(0)
    for (let nonce = 0; nonce < UNIFORM_DRAWS; nonce++) {
      const res = FairDraw.run({
        mode,
        contestants: UNIFORM_ROSTER,
        serverSeed: SEED_A,
        clientSeed: 'uniformity',
        nonce,
        winnerCount: 1
      })
      const idx = UNIFORM_ROSTER.indexOf(res.winners[0])
      assert(idx >= 0, 'winner "' + res.winners[0] + '" is not on the roster')
      counts[idx]++
    }
    const expected = UNIFORM_DRAWS / UNIFORM_ROSTER.length
    const stat = chiSquareStat(counts, expected)
    const p = chiSquareP(stat, UNIFORM_ROSTER.length - 1)
    note('counts   ' + UNIFORM_ROSTER.map((n, i) => n + '=' + counts[i]).join('  ') +
      '   (expected ' + expected + ' each)')
    note('chi2 = ' + stat.toFixed(4) + '   df = 4   p = ' + p.toFixed(4) +
      '   critical(99.9%) = ' + CRIT_4DF_999)
    assertEqual(counts.reduce((a, b) => a + b, 0), UNIFORM_DRAWS, 'lost some draws')
    assert(stat < CRIT_4DF_999,
      'chi-square ' + stat.toFixed(4) + ' exceeds the 99.9% critical value ' + CRIT_4DF_999)
  })
}

test('the same chi-square test rejects a deliberately rigged draw', function () {
  // Guard against a vacuous test: if the check above cannot fail, it proves
  // nothing. Here one contestant is handed 24% of the draws instead of 20%,
  // and the identical statistic must blow past the critical value.
  const rng = new FairDraw.FairRng(SEED_B, 'rigged', 0)
  const counts = new Array(5).fill(0)
  for (let i = 0; i < UNIFORM_DRAWS; i++) {
    const r = rng.nextInt(100)
    counts[r < 24 ? 0 : 1 + Math.floor((r - 24) / 19)]++
  }
  const stat = chiSquareStat(counts, UNIFORM_DRAWS / 5)
  note('rigged counts   ' + counts.join('  ') + '   chi2 = ' + stat.toFixed(4) +
    '   critical(99.9%) = ' + CRIT_4DF_999)
  assert(stat > CRIT_4DF_999,
    'a 24%/19% rig slipped past the test (chi2 = ' + stat.toFixed(4) + '), so the test is too weak')
})

test('every finishing position is uniform in "rumble" mode (full standings)', function () {
  // Stronger than a winner-only check: the whole permutation should be
  // exchangeable, so each name should land in each place equally often.
  const n = 4
  const roster = ['Ada', 'Bo', 'Cy', 'Dee']
  const draws = 4000
  const table = roster.map(() => new Array(n).fill(0))
  for (let nonce = 0; nonce < draws; nonce++) {
    const res = FairDraw.run({
      mode: 'rumble', contestants: roster, serverSeed: SEED_B, clientSeed: 'places', nonce, winnerCount: n
    })
    res.winners.forEach((name, place) => { table[roster.indexOf(name)][place]++ })
  }
  const flat = []
  for (const row of table) for (const c of row) flat.push(c)
  const stat = chiSquareStat(flat, draws / n)
  const df = (n - 1) * (n - 1)
  note('place table chi2 = ' + stat.toFixed(4) + '   df = ' + df +
    '   critical(99.9%) = ' + chiSquareCrit(df, 0.001).toFixed(3))
  assert(stat < chiSquareCrit(df, 0.001), 'standings are not exchangeable: chi2 = ' + stat.toFixed(4))
})

/* ================================================================== *
 * 5. nextInt has no modulo bias                                       *
 * ================================================================== */

section('5. FairRng.nextInt - modulo bias')

for (const n of [3, 7, 100]) {
  test('nextInt(' + n + ') is uniform over 200000 samples', function () {
    const SAMPLES = 200000
    const counts = new Array(n).fill(0)
    const rng = new FairDraw.FairRng(SEED_B, 'bias-check-' + n, 0)
    for (let i = 0; i < SAMPLES; i++) {
      const v = rng.nextInt(n)
      assert(v >= 0 && v < n && Number.isInteger(v), 'out of range value ' + v)
      counts[v]++
    }
    const stat = chiSquareStat(counts, SAMPLES / n)
    const df = n - 1
    const crit = chiSquareCrit(df, 0.001)
    const p = chiSquareP(stat, df)
    note('chi2 = ' + stat.toFixed(4) + '   df = ' + df +
      '   p = ' + p.toFixed(4) + '   critical(99.9%) = ' + crit.toFixed(3))
    assert(stat < crit, 'chi-square ' + stat.toFixed(4) + ' exceeds critical ' + crit.toFixed(3))
  })
}

test('nextInt(1) and nextInt(0) are always 0 and consume no bytes', function () {
  const rng = new FairDraw.FairRng(SEED_A, 'edge', 0)
  const before = rng.bytesUsed
  for (let i = 0; i < 100; i++) {
    assertEqual(rng.nextInt(1), 0)
    assertEqual(rng.nextInt(0), 0)
  }
  assertEqual(rng.bytesUsed, before, 'degenerate nextInt consumed randomness')
})

test('shuffle produces every permutation of 4 items roughly equally often', function () {
  const rng = new FairDraw.FairRng(SEED_A, 'perms', 0)
  const seen = new Map()
  const TRIALS = 24000
  for (let i = 0; i < TRIALS; i++) {
    const key = rng.shuffle([0, 1, 2, 3]).join('')
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  assertEqual(seen.size, 24, 'expected all 24 permutations, saw ' + seen.size)
  const stat = chiSquareStat(Array.from(seen.values()), TRIALS / 24)
  const crit = chiSquareCrit(23, 0.001)
  note('permutation chi2 = ' + stat.toFixed(4) + '   df = 23   critical(99.9%) = ' + crit.toFixed(3))
  assert(stat < crit, 'shuffle is biased: chi2 = ' + stat.toFixed(4))
})

/* ================================================================== *
 * 6. Tamper detection                                                 *
 * ================================================================== */

section('6. verifyReceipt rejects tampering')

const TAMPER_BASE = {
  contestants: ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'],
  serverSeed: SEED_A,
  clientSeed: 'crowd-picked-this',
  nonce: 11,
  winnerCount: 3
}

for (const mode of FairDraw.MODES) {
  const good = makeReceipt(Object.assign({ mode }, TAMPER_BASE))

  const tampers = {
    'flipped server seed': (r) => { r.serverSeed = r.serverSeed.slice(0, 40) + (r.serverSeed[40] === 'c' ? 'd' : 'c') + r.serverSeed.slice(41) },
    'altered commit': (r) => { r.commit = r.commit.slice(0, 5) + (r.commit[5] === 'a' ? 'b' : 'a') + r.commit.slice(6) },
    'reordered contestants': (r) => { const t = r.contestants[0]; r.contestants[0] = r.contestants[1]; r.contestants[1] = t },
    'changed mode': (r) => { r.mode = FairDraw.MODES[(FairDraw.MODES.indexOf(r.mode) + 1) % 3] },
    'changed clientSeed': (r) => { r.clientSeed = r.clientSeed + '!' },
    'changed nonce': (r) => { r.nonce = r.nonce + 1 },
    'swapped winners': (r) => { r.winners.reverse() }
  }

  test('"' + mode + '" receipt verifies as issued', function () {
    const v = FairDraw.verifyReceipt(good)
    assert(v.ok, 'a freshly built receipt failed: ' +
      v.checks.filter(c => !c.ok).map(c => c.name + ' - ' + c.detail).join('; '))
    assertEqual(v.checks.length, 3, 'expected 3 checks')
    assertEqual(JSON.stringify(v.winners), JSON.stringify(good.winners))
  })

  for (const label of Object.keys(tampers)) {
    test('"' + mode + '" rejects: ' + label, function () {
      const bad = clone(good)
      tampers[label](bad)
      assert(JSON.stringify(bad) !== JSON.stringify(good), 'tamper was a no-op')
      const v = FairDraw.verifyReceipt(bad)
      assert(!v.ok, 'tampered receipt still verified')
      assert(v.checks.some(c => !c.ok), 'no individual check reported the problem')
    })
  }
}

test('the Draw ID is unambiguous about where one name ends and the next begins', function () {
  // engine.js joins the roster with U+001F (ASCII unit separator) before
  // hashing. That separator is what stops ["ab","c"] and ["a","bc"] from
  // sharing a Draw ID, which would let an operator re-cut the roster after
  // publishing the commitment. NOTE: in engine.js it is written as a raw
  // control character inside the string literal, so it is invisible in most
  // editors and diffs — if anything ever strips it, this test fails loudly.
  const commit = '0'.repeat(64)
  const a = FairDraw.drawId(commit, 'wheel', 1, ['ab', 'c', 'd'])
  const b = FairDraw.drawId(commit, 'wheel', 1, ['a', 'bc', 'd'])
  assert(a !== b, 'rosters ["ab","c","d"] and ["a","bc","d"] share a Draw ID — the separator is gone')

  const US = String.fromCharCode(31)
  assertEqual(FairDraw.drawId(commit, 'wheel', 1, ['Ada', 'Bo']),
    crypto.createHash('sha256')
      .update([commit, 'wheel', 1, ['Ada', 'Bo'].join(US)].join('|'), 'utf8').digest('hex'),
    'Draw ID construction changed')
  assertEqual(FairDraw.drawId(commit, 'wheel', 1, ['Ada', 'Bo']),
    '347c7b311ee5aa406a9c873e5470430bdb9c3095b59ff5bddedf82fb4c230aee',
    'pinned Draw ID vector changed — every previously published Draw ID just became invalid')

  assert(FairDraw.drawId(commit, 'wheel', 1, ['Ada', 'Bo']) !==
    FairDraw.drawId(commit, 'wheel', 2, ['Ada', 'Bo']), 'winner count is not pinned')
  assert(FairDraw.drawId(commit, 'wheel', 1, ['Ada', 'Bo']) !==
    FairDraw.drawId(commit, 'rpg', 1, ['Ada', 'Bo']), 'mode is not pinned')
})

test('rejects an extra name smuggled onto the roster', function () {
  const good = makeReceipt(Object.assign({ mode: 'wheel' }, TAMPER_BASE))
  const bad = clone(good)
  bad.contestants.push('Ivy')
  assert(!FairDraw.verifyReceipt(bad).ok, 'roster growth was not detected')
})

test('rejects a truncated server seed without throwing', function () {
  const good = makeReceipt(Object.assign({ mode: 'wheel' }, TAMPER_BASE))
  const bad = clone(good)
  bad.serverSeed = bad.serverSeed.slice(0, 32)
  const v = FairDraw.verifyReceipt(bad)
  assert(!v.ok, 'short seed accepted')
  assert(v.checks.some(c => c.name === 'Replay reproduces winners' && !c.ok), 'replay check did not fail')
})

/* ================================================================== *
 * 7. Round trip                                                       *
 * ================================================================== */

section('7. Round trip')

test('random seed -> draw -> receipt -> verify, 25 times across all modes', function () {
  for (let i = 0; i < 25; i++) {
    const mode = FairDraw.MODES[i % 3]
    const serverSeed = FairDraw.randomSeedHex()
    assert(/^[0-9a-f]{64}$/.test(serverSeed), 'randomSeedHex produced ' + serverSeed)
    const roster = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'].slice(0, 2 + (i % 5))
    const receipt = makeReceipt({
      mode,
      contestants: roster,
      serverSeed,
      clientSeed: 'round-trip-' + i,
      nonce: i,
      winnerCount: 1 + (i % 2)
    })
    const v = FairDraw.verifyReceipt(receipt)
    assert(v.ok, 'round trip ' + i + ' (' + mode + ') failed: ' +
      v.checks.filter(c => !c.ok).map(c => c.name + ' - ' + c.detail).join('; '))
    // the receipt must survive a JSON round trip too, since that is how it travels
    assert(FairDraw.verifyReceipt(JSON.parse(JSON.stringify(receipt))).ok, 'failed after JSON round trip')
  }
})

test('two independent server seeds are never equal', function () {
  const seen = new Set()
  for (let i = 0; i < 200; i++) seen.add(FairDraw.randomSeedHex())
  assertEqual(seen.size, 200, 'randomSeedHex repeated itself')
})

/* ------------------------------------------------------------------ *
 * 8. Input validation and receipt shape                               *
 *                                                                     *
 * Regression cover for defects found by review: a receipt that simply *
 * OMITTED its Draw ID used to pass verification, and a malformed one  *
 * threw a raw TypeError instead of failing a check.                   *
 * ------------------------------------------------------------------ */

section('8. Input validation and receipt shape')

const VALID = makeReceipt(Object.assign({ mode: 'wheel' }, {
  contestants: ['Ada', 'Bo', 'Cy', 'Dee'],
  serverSeed: SEED_A,
  clientSeed: 'pinned',
  nonce: 3,
  winnerCount: 1
}))

test('a well-formed receipt still verifies', function () {
  assert(FairDraw.verifyReceipt(VALID).ok, 'baseline receipt should pass')
})

// The Draw ID is the ONLY thing binding roster/mode/winnerCount to the
// commitment. Treating a missing one as "nothing to compare" silently
// dropped that guarantee.
for (const [label, mutate] of Object.entries({
  'omitted entirely': (r) => { delete r.drawId },
  'set to null': (r) => { r.drawId = null },
  'set to empty string': (r) => { r.drawId = '' }
})) {
  test('a receipt whose Draw ID is ' + label + ' is rejected', function () {
    const r = clone(VALID)
    mutate(r)
    assert(!FairDraw.verifyReceipt(r).ok, 'unpinned roster was accepted')
  })
}

for (const [label, bad] of Object.entries({
  'null': null,
  'a receipt with no contestants': Object.assign(clone(VALID), { contestants: undefined }),
  'a receipt with no winners array': Object.assign(clone(VALID), { winners: undefined }),
  'a receipt with no commit': Object.assign(clone(VALID), { commit: undefined })
})) {
  test('verifyReceipt fails cleanly on ' + label, function () {
    let v
    try {
      v = FairDraw.verifyReceipt(bad)
    } catch (err) {
      assert(false, 'threw instead of failing a check: ' + err.message)
    }
    assert(!v.ok, 'malformed receipt was accepted')
    assert(v.checks.length > 0, 'no check was reported')
  })
}

const RUN_BASE = {
  mode: 'wheel',
  contestants: ['Ada', 'Bo', 'Cy', 'Dee'],
  serverSeed: SEED_A,
  clientSeed: 'x',
  nonce: 0,
  winnerCount: 1
}
const runWith = (over) => () => FairDraw.run(Object.assign({}, RUN_BASE, over))

for (const [label, over] of Object.entries({
  'duplicate contestants': { contestants: ['Ada', 'Bo', 'Ada'] },
  'an empty-string contestant': { contestants: ['Ada', '', 'Cy'] },
  'a non-string contestant': { contestants: ['Ada', 7, 'Cy'] },
  'winnerCount 0': { winnerCount: 0 },
  'winnerCount above the roster size': { winnerCount: 5 },
  'a fractional winnerCount': { winnerCount: 1.5 },
  'a negative nonce': { nonce: -1 },
  'a fractional nonce': { nonce: 0.5 }
})) {
  test('run() rejects ' + label, function () {
    let threw = false
    try { runWith(over)() } catch (err) { threw = true }
    assert(threw, label + ' was silently accepted')
  })
}

// nonce used to go through `| 0` (ToInt32), so 2^31 wrapped to -2^31 and
// replayed a different draw's byte stream.
test('a nonce at 2^31 does not wrap into another draw\'s stream', function () {
  const streamAt = (n) => {
    const rng = new FairDraw.FairRng(SEED_A, 'x', n)
    return [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()].join(',')
  }
  assert(streamAt(2147483648) !== streamAt(0), '2^31 collided with nonce 0')
  assertEqual(streamAt(2147483648), streamAt(2147483648), 'not deterministic')
  // Every nonce below 2^31 stringifies the same with or without ToInt32,
  // so historical draws must be untouched by that fix.
  assertEqual(streamAt(3), '3993110742,3220517043,2892530863', 'nonce 3 stream changed')
})

test('a roster given as a numeric range draws and verifies', function () {
  const nums = []
  for (let i = 1; i <= 100; i++) nums.push(String(i))
  const r = makeReceipt({
    mode: 'wheel', contestants: nums, serverSeed: SEED_B,
    clientSeed: 'raffle', nonce: 0, winnerCount: 3
  })
  const v = FairDraw.verifyReceipt(r)
  assert(v.ok, 'numeric-range receipt failed to verify')
  assertEqual(r.winners.length, 3, 'expected 3 winners')
  assertEqual(new Set(r.winners).size, 3, 'a number won twice')
  for (const w of r.winners) {
    assert(nums.indexOf(w) !== -1, 'winner ' + w + ' is not in 1..100')
  }
})

/* ------------------------------------------------------------------ *
 * 9. Ticket entries and one-prize-per-person                          *
 * ------------------------------------------------------------------ */

section('9. Ticket entries')

const TICKET_ENTRIES = [
  { holder: 'Ada', entries: 5 },
  { holder: 'Bo', entries: 3 },
  { holder: 'Cy', entries: 1 },
  { holder: 'Dee', entries: 1 }
]
const TICKETS = FairDraw.makeTickets(TICKET_ENTRIES)

test('makeTickets expands entries into unique labelled tickets', function () {
  assertEqual(TICKETS.length, 10, 'wrong ticket count')
  assertEqual(new Set(TICKETS).size, 10, 'tickets are not unique')
  assertEqual(TICKETS[0], 'Ada #1')
  assertEqual(TICKETS[4], 'Ada #5')
  assertEqual(TICKETS[5], 'Bo #1')
})

test('holderOf recovers the person from a ticket label', function () {
  assertEqual(FairDraw.holderOf('Ada #3'), 'Ada')
  assertEqual(FairDraw.holderOf('Van Halen #12'), 'Van Halen')
  assertEqual(FairDraw.holderOf('no-ticket-suffix'), 'no-ticket-suffix')
})

test('makeTickets rejects a holder name containing the ticket separator', function () {
  let threw = false
  try { FairDraw.makeTickets([{ holder: 'Ada #1', entries: 1 }]) } catch (e) { threw = true }
  assert(threw, 'a name that would collide with a ticket label was accepted')
})

test('makeTickets rejects non-positive entry counts', function () {
  for (const bad of [0, -1, 1.5, '3']) {
    let threw = false
    try { FairDraw.makeTickets([{ holder: 'Ada', entries: bad }]) } catch (e) { threw = true }
    assert(threw, 'entries=' + JSON.stringify(bad) + ' was accepted')
  }
})

// The whole point of tickets: odds must track ticket share, with no
// weighting code anywhere in the draw.
test('win probability is proportional to tickets held', function () {
  const DRAWS = 20000
  const counts = {}
  for (let i = 0; i < DRAWS; i++) {
    const r = FairDraw.run({
      mode: 'wheel', contestants: TICKETS, serverSeed: SEED_A,
      clientSeed: 'odds', nonce: i, winnerCount: 1
    })
    const h = FairDraw.holderOf(r.winners[0])
    counts[h] = (counts[h] || 0) + 1
  }
  let stat = 0
  const lines = []
  for (const e of TICKET_ENTRIES) {
    const expected = DRAWS * (e.entries / 10)
    const got = counts[e.holder] || 0
    stat += Math.pow(got - expected, 2) / expected
    lines.push(e.holder + ' ' + e.entries + 'tix ' + (got / DRAWS * 100).toFixed(2) + '%')
  }
  console.log('        ' + lines.join('   '))
  assert(stat < chiSquareCrit(3, 0.001),
    'ticket odds are not proportional: chi2 = ' + stat.toFixed(4))
})

test('groupBy holder gives each person at most one prize', function () {
  for (let nonce = 0; nonce < 200; nonce++) {
    const r = FairDraw.run({
      mode: 'wheel', contestants: TICKETS, serverSeed: SEED_A,
      clientSeed: 'grouped', nonce: nonce, winnerCount: 3, alternates: 1, groupBy: 'holder'
    })
    const holders = r.standings.map(FairDraw.holderOf)
    assertEqual(new Set(holders).size, holders.length,
      'a holder appeared twice at nonce ' + nonce + ': ' + r.standings.join(', '))
    assertEqual(r.winners.length, 3, 'wrong winner count at nonce ' + nonce)
  }
})

test('groupBy is pinned by the Draw ID', function () {
  const commit = FairDraw.sha256Hex(SEED_A)
  const none = FairDraw.drawId(commit, 'wheel', 2, TICKETS, 1, 'fairdraw-2', 'none')
  const held = FairDraw.drawId(commit, 'wheel', 2, TICKETS, 1, 'fairdraw-2', 'holder')
  assert(none !== held, 'the one-prize-per-person rule is not pinned, so it could be flipped after the draw')
})

test('a ticket receipt verifies end to end', function () {
  const r = makeReceipt({
    mode: 'wheel', contestants: TICKETS, serverSeed: SEED_B,
    clientSeed: 'raffle-night', nonce: 4, winnerCount: 2, alternates: 2
  })
  const v = FairDraw.verifyReceipt(r)
  assert(v.ok, 'ticket receipt failed: ' +
    v.checks.filter(c => !c.ok).map(c => c.name + ' - ' + c.detail).join('; '))
})

/* ------------------------------------------------------------------ *
 * 10. Range rosters and the authorised draw count                     *
 * ------------------------------------------------------------------ */

section('10. Range rosters and draw budget')

test('a range commits as a short key, not its expansion', function () {
  assertEqual(FairDraw.rosterKey({ kind: 'range', from: 1, to: 10000 }), 'range:1-10000')
  const listed = FairDraw.rosterKey(FairDraw.makeRange(1, 10000))
  assert(listed.length > 40000, 'expected the listed form to be huge')
  assert(FairDraw.rosterKey({ kind: 'range', from: 1, to: 10000 }).length < 20,
    'the range key should be short enough to read aloud')
})

test('a range roster and its expansion draw the same winner', function () {
  const spec = { kind: 'range', from: 1, to: 500 }
  const a = FairDraw.run({ mode: 'wheel', roster: spec, serverSeed: SEED_A, clientSeed: 'r', nonce: 0, winnerCount: 3 })
  const b = FairDraw.run({ mode: 'wheel', contestants: FairDraw.makeRange(1, 500), serverSeed: SEED_A, clientSeed: 'r', nonce: 0, winnerCount: 3 })
  assertEqual(JSON.stringify(a.winners), JSON.stringify(b.winners),
    'the compact roster changed the outcome')
})

test('but they are different commitments, so neither can stand in for the other', function () {
  const commit = FairDraw.sha256Hex(SEED_A)
  const compact = FairDraw.drawId(commit, 'wheel', 1, { kind: 'range', from: 1, to: 500 }, 0, 'fairdraw-2', 'none', 1)
  const listed = FairDraw.drawId(commit, 'wheel', 1, FairDraw.makeRange(1, 500), 0, 'fairdraw-2', 'none', 1)
  assert(compact !== listed, 'a range and its expansion must not share a Draw ID')
})

test('a range receipt verifies and stays small', function () {
  const spec = { kind: 'range', from: 1, to: 10000 }
  const commit = FairDraw.sha256Hex(SEED_B)
  const r = FairDraw.run({ mode: 'wheel', roster: spec, serverSeed: SEED_B, clientSeed: 'big', nonce: 0, winnerCount: 1, alternates: 2, draws: 1 })
  const receipt = {
    version: 'fairdraw-2', commit, serverSeed: SEED_B, mode: 'wheel',
    roster: spec, winnerCount: 1, alternates: 2, groupBy: 'none', draws: 1,
    clientSeed: 'big', nonce: 0, winners: r.winners, standings: r.standings,
    drawId: FairDraw.drawId(commit, 'wheel', 1, spec, 2, 'fairdraw-2', 'none', 1)
  }
  const v = FairDraw.verifyReceipt(receipt)
  assert(v.ok, 'range receipt failed: ' + v.checks.filter(c => !c.ok).map(c => c.name + ' - ' + c.detail).join('; '))
  const size = JSON.stringify(receipt).length
  note('receipt is ' + size + ' bytes for a 10,000-entry draw')
  assert(size < 1000, 'range receipt should be tiny, got ' + size + ' bytes')
})

test('a declared draw count bounds which nonces are legal', function () {
  const base = { mode: 'wheel', contestants: ['A', 'B', 'C', 'D'], serverSeed: SEED_A, clientSeed: 'x', winnerCount: 1, draws: 3 }
  for (const n of [0, 1, 2]) {
    FairDraw.run(Object.assign({}, base, { nonce: n }))
  }
  for (const n of [3, 4, 99]) {
    let threw = false
    try { FairDraw.run(Object.assign({}, base, { nonce: n })) } catch (e) { threw = true }
    assert(threw, 'nonce ' + n + ' was accepted beyond the 3 authorised draws')
  }
})

test('an undeclared draw count leaves the nonce unbounded, and says so in the Draw ID', function () {
  FairDraw.run({ mode: 'wheel', contestants: ['A', 'B', 'C'], serverSeed: SEED_A, clientSeed: 'x', nonce: 500, winnerCount: 1 })
  const commit = FairDraw.sha256Hex(SEED_A)
  const open = FairDraw.drawId(commit, 'wheel', 1, ['A', 'B', 'C'], 0, 'fairdraw-2', 'none', undefined)
  const one = FairDraw.drawId(commit, 'wheel', 1, ['A', 'B', 'C'], 0, 'fairdraw-2', 'none', 1)
  assert(open !== one, 'an open-ended commitment must not hash the same as a one-draw commitment')
})

test('the draw count is pinned, so it cannot be widened after the fact', function () {
  const commit = FairDraw.sha256Hex(SEED_A)
  const three = FairDraw.drawId(commit, 'wheel', 1, ['A', 'B'], 0, 'fairdraw-2', 'none', 3)
  const ten = FairDraw.drawId(commit, 'wheel', 1, ['A', 'B'], 0, 'fairdraw-2', 'none', 10)
  assert(three !== ten, 'the authorised draw count is not pinned')
})

/* ------------------------------------------------------------------ *
 * 11. Compact ticket rosters                                          *
 * ------------------------------------------------------------------ */

section('11. Compact ticket rosters')

const TSPEC = {
  kind: 'tickets',
  entries: [
    { holder: 'Ada', entries: 5 },
    { holder: 'Bo', entries: 3 },
    { holder: 'Cy', entries: 1 }
  ]
}

test('a ticket roster commits one record per person, not per ticket', function () {
  const key = FairDraw.rosterKey(TSPEC)
  assert(key.indexOf('tickets:') === 0, 'missing the tickets: prefix')
  assertEqual(key.split(String.fromCharCode(31)).length, 3, 'expected one record per person')
  const expanded = FairDraw.rosterKey(FairDraw.resolveRoster({ roster: TSPEC }))
  assert(key.length < expanded.length, 'the compact form should be shorter')
})

test('a holder name containing a colon stays unambiguous', function () {
  const a = { kind: 'tickets', entries: [{ holder: 'a:b', entries: 2 }] }
  const b = { kind: 'tickets', entries: [{ holder: 'b', entries: 2 }] }
  assert(FairDraw.rosterKey(a) !== FairDraw.rosterKey(b), 'colon in a holder name collided')
  // count first means everything after the first colon is the name, verbatim
  assertEqual(FairDraw.rosterKey(a), 'tickets:2:a:b')
})

test('the compact roster expands to exactly the same tickets', function () {
  assertEqual(FairDraw.resolveRoster({ roster: TSPEC }).join(','),
    FairDraw.makeTickets(TSPEC.entries).join(','))
})

test('compact and listed rosters draw the same winner', function () {
  const listed = FairDraw.makeTickets(TSPEC.entries)
  const a = FairDraw.run({ mode: 'wheel', roster: TSPEC, serverSeed: SEED_A, clientSeed: 't', nonce: 0, winnerCount: 2 })
  const b = FairDraw.run({ mode: 'wheel', contestants: listed, serverSeed: SEED_A, clientSeed: 't', nonce: 0, winnerCount: 2 })
  assertEqual(JSON.stringify(a.winners), JSON.stringify(b.winners))
})

test('but they are different commitments', function () {
  const commit = FairDraw.sha256Hex(SEED_A)
  const compact = FairDraw.drawId(commit, 'wheel', 1, TSPEC, 0, 'fairdraw-2', 'none', 1)
  const listed = FairDraw.drawId(commit, 'wheel', 1, FairDraw.makeTickets(TSPEC.entries), 0, 'fairdraw-2', 'none', 1)
  assert(compact !== listed, 'a ticket spec must not share a Draw ID with its expansion')
})

test('changing one person\'s entry count changes the Draw ID', function () {
  const commit = FairDraw.sha256Hex(SEED_A)
  const bumped = { kind: 'tickets', entries: TSPEC.entries.map((e, i) => i === 1 ? { holder: e.holder, entries: 4 } : e) }
  assert(FairDraw.drawId(commit, 'wheel', 1, TSPEC, 0, 'fairdraw-2', 'none', 1) !==
    FairDraw.drawId(commit, 'wheel', 1, bumped, 0, 'fairdraw-2', 'none', 1),
  'entry counts are not pinned, so they could be topped up after the commitment')
})

test('50,000 tickets stay small and still verify', function () {
  const entries = []
  for (let i = 0; i < 1000; i++) entries.push({ holder: 'person' + i, entries: 50 })
  const spec = { kind: 'tickets', entries }
  const commit = FairDraw.sha256Hex(SEED_B)
  const r = FairDraw.run({
    mode: 'wheel', roster: spec, serverSeed: SEED_B, clientSeed: 'big',
    nonce: 0, winnerCount: 3, alternates: 2, groupBy: 'holder', draws: 1
  })
  const receipt = {
    version: 'fairdraw-2', commit, serverSeed: SEED_B, mode: 'wheel', roster: spec,
    winnerCount: 3, alternates: 2, groupBy: 'holder', draws: 1,
    clientSeed: 'big', nonce: 0, winners: r.winners, standings: r.standings,
    drawId: FairDraw.drawId(commit, 'wheel', 3, spec, 2, 'fairdraw-2', 'holder', 1)
  }
  const v = FairDraw.verifyReceipt(receipt)
  assert(v.ok, 'failed: ' + v.checks.filter(c => !c.ok).map(c => c.name + ' - ' + c.detail).join('; '))
  assertEqual(FairDraw.resolveRoster({ roster: spec }).length, 50000, 'wrong ticket count')

  const compactBytes = JSON.stringify(receipt).length
  const listedBytes = JSON.stringify(Object.assign({}, receipt, {
    roster: undefined, contestants: FairDraw.resolveRoster({ roster: spec })
  })).length
  note('receipt ' + compactBytes.toLocaleString() + ' bytes vs ' +
    listedBytes.toLocaleString() + ' listed (' + Math.round(listedBytes / compactBytes) + 'x smaller)')
  assert(compactBytes * 5 < listedBytes, 'compact form is not meaningfully smaller')

  const holders = r.standings.map(FairDraw.holderOf)
  assertEqual(new Set(holders).size, holders.length, 'a holder won twice')
})

/* ------------------------------------------------------------------ *
 * 12. Beacon entropy                                                  *
 * ------------------------------------------------------------------ *
 * No network here: the engine only pins the promise of a future round.
 * Checking that the promise was kept needs a network and lives in
 * verify.js and the page.
 * ------------------------------------------------------------------ */

section('12. Beacon entropy')

test('drand round timing matches the published chain parameters', function () {
  assertEqual(FairDraw.DRAND.period, 3)
  assertEqual(FairDraw.DRAND.genesis, 1692803367)
  assertEqual(FairDraw.DRAND.chain,
    '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971')
  // round 1 is published at genesis
  assertEqual(FairDraw.drandRoundAt(FairDraw.DRAND.genesis), 1)
  assertEqual(FairDraw.drandRoundTime(1), FairDraw.DRAND.genesis)
  // and the two are inverses across a wide span
  for (const r of [2, 1000, 31459941, 99999999]) {
    assertEqual(FairDraw.drandRoundAt(FairDraw.drandRoundTime(r)), r, 'round ' + r)
  }
})

test('a round covers exactly one period', function () {
  const r = 31459941
  const t = FairDraw.drandRoundTime(r)
  assertEqual(FairDraw.drandRoundAt(t), r)
  assertEqual(FairDraw.drandRoundAt(t + FairDraw.DRAND.period - 1), r, 'end of the window')
  assertEqual(FairDraw.drandRoundAt(t + FairDraw.DRAND.period), r + 1, 'next window')
})

test('the entropy source is pinned by the Draw ID', function () {
  const commit = FairDraw.sha256Hex(SEED_A)
  const id = (entropy) => FairDraw.drawId(commit, 'wheel', 1, ['A', 'B'], 0, 'fairdraw-2', 'none', 1, entropy)
  const manual = id({ source: 'manual' })
  const r1 = id({ source: 'drand', round: 31459941 })
  const r2 = id({ source: 'drand', round: 31459942 })
  assert(manual !== r1, 'a beacon commitment must not hash like a hand-picked one')
  assert(r1 !== r2, 'the round is not pinned, so it could be chosen after the fact')
  assertEqual(id(undefined), manual, 'omitted entropy should mean manual')
})

test('entropyKey rejects a malformed beacon spec', function () {
  for (const bad of [{ source: 'drand' }, { source: 'drand', round: 0 },
    { source: 'drand', round: 1.5 }, { source: 'lava-lamp' }]) {
    let threw = false
    try { FairDraw.entropyKey(bad) } catch (e) { threw = true }
    assert(threw, JSON.stringify(bad) + ' was accepted')
  }
})

test('a beacon receipt verifies offline, seed origin aside', function () {
  const commit = FairDraw.sha256Hex(SEED_B)
  const entropy = { source: 'drand', chain: FairDraw.DRAND.chain, round: 31459941 }
  const clientSeed = 'b5ce98a4ad3e1e6ba86b743b1eff8de4ac80aebccdc8b33b3adbf21f5e989c60'
  const opts = {
    mode: 'wheel', contestants: ['Ada', 'Bo', 'Cy', 'Dee'], serverSeed: SEED_B,
    clientSeed, nonce: 0, winnerCount: 1, draws: 1
  }
  const r = FairDraw.run(opts)
  const receipt = Object.assign({}, opts, {
    version: 'fairdraw-2', commit, entropy, alternates: 0, groupBy: 'none',
    winners: r.winners, standings: r.standings,
    drawId: FairDraw.drawId(commit, 'wheel', 1, opts.contestants, 0, 'fairdraw-2', 'none', 1, entropy)
  })
  assert(FairDraw.verifyReceipt(receipt).ok, 'beacon receipt failed to verify')

  // Swapping the round invalidates the Draw ID even though the seed is unchanged
  const swapped = Object.assign({}, receipt, {
    entropy: { source: 'drand', chain: FairDraw.DRAND.chain, round: 31459942 }
  })
  assert(!FairDraw.verifyReceipt(swapped).ok, 'the round could be swapped after the draw')
})

section('Manual verifier form uses the receipt params path')

// Mirror of what index.html builds when a host runs a draw, as a receipt.
function hostReceipt (o) {
  const commit = FairDraw.sha256Hex(o.serverSeed)
  const groupBy = o.groupBy || 'none'
  const entropy = o.entropy || { source: 'manual' }
  const opts = Object.assign({ alternates: 0, draws: 1, nonce: 0, groupBy }, o)
  const r = FairDraw.run(opts)
  return Object.assign({}, opts, {
    version: 'fairdraw-2', commit, entropy, winners: r.winners, standings: r.standings,
    drawId: FairDraw.drawId(commit, o.mode, o.winnerCount, o.roster || o.contestants,
      opts.alternates, 'fairdraw-2', groupBy, opts.draws, entropy)
  })
}

test('form: ticket + one-prize-per-person draw reproduces the host Draw ID', function () {
  const roster = { kind: 'tickets', entries: [{ holder: 'Ada', entries: 3 }, { holder: 'Bo', entries: 1 }, { holder: 'Cy', entries: 2 }, { holder: 'Dee', entries: 5 }] }
  const rec = hostReceipt({ mode: 'rumble', roster, serverSeed: SEED_A, clientSeed: 'crowd', winnerCount: 2, alternates: 1, groupBy: 'holder' })
  assert(FairDraw.verifyReceipt(rec).ok, 'host receipt should verify')
  const p = FairDraw.paramsFromFields({
    serverSeed: SEED_A, clientSeed: 'crowd', nonce: 0, mode: 'rumble', winnerCount: 2, alternates: 1, draws: 1,
    rosterKind: 'tickets', rosterText: 'Ada, 3\nBo, 1\nCy x 2\nDee, 5', onePrize: true, seedSource: 'manual'
  })
  assertEqual(p.drawId, rec.drawId, 'draw id')
  assertEqual(JSON.stringify(FairDraw.run(p).winners), JSON.stringify(rec.winners), 'winners')
  // The old form behaviour (rule forced off) must NOT match:
  const off = FairDraw.paramsFromFields({
    serverSeed: SEED_A, clientSeed: 'crowd', mode: 'rumble', winnerCount: 2, alternates: 1, draws: 1,
    rosterKind: 'tickets', rosterText: 'Ada, 3\nBo, 1\nCy x 2\nDee, 5', onePrize: false, seedSource: 'manual'
  })
  assert(off.drawId !== rec.drawId, 'one-prize rule is not pinned')
})

test('form: drand draw reproduces the host Draw ID', function () {
  const entropy = { source: 'drand', chain: FairDraw.DRAND.chain, round: 31459941 }
  const rec = hostReceipt({ mode: 'wheel', contestants: ['Ada', 'Bo', 'Cy', 'Dee'], serverSeed: SEED_B, clientSeed: 'b5ce98', winnerCount: 1, entropy })
  const p = FairDraw.paramsFromFields({
    serverSeed: SEED_B, clientSeed: 'b5ce98', mode: 'wheel', winnerCount: 1, rosterKind: 'list',
    rosterText: 'Ada\nBo\nCy\nDee', seedSource: 'drand', drandRound: '31459941'
  })
  assertEqual(p.drawId, rec.drawId, 'draw id')
  assert(FairDraw.verifyReceipt(Object.assign({}, p, { winners: rec.winners })).ok, 'form params verify as a receipt')
  const manual = FairDraw.paramsFromFields(Object.assign({}, p, { rosterText: 'Ada\nBo\nCy\nDee', rosterKind: 'list', seedSource: 'manual' }))
  assert(manual.drawId !== rec.drawId, 'seed source is not pinned')
})

test('form: range roster and plain manual draw match the host', function () {
  const rec = hostReceipt({ mode: 'rpg', roster: { kind: 'range', from: 1, to: 50 }, serverSeed: SEED_A, clientSeed: 'x', winnerCount: 3, draws: 2 })
  const p = FairDraw.paramsFromFields({ serverSeed: SEED_A.toUpperCase(), clientSeed: 'x', mode: 'rpg', winnerCount: '3', draws: '2', rosterKind: 'list', rosterText: ' 50 - 1 ', seedSource: 'manual' })
  assertEqual(p.drawId, rec.drawId, 'draw id')
  assertEqual(JSON.stringify(FairDraw.run(p).winners), JSON.stringify(rec.winners), 'winners')
})

test('form: shipped sample receipts still verify', function () {
  for (const f of ['sample-receipt.json', 'beacon-receipt.json']) {
    const r = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, f), 'utf8'))
    assert(FairDraw.verifyReceipt(r).ok, f + ' no longer verifies')
  }
})

/* ------------------------------------------------------------------ *
 * Presentation layer (visual.js) — must never change winners          *
 * ------------------------------------------------------------------ */
const FairShow = require('./visual.js')
function showFor (n, cs, w, a) {
  const c = Array.from({ length: n }, (_, i) => 'P' + i)
  const r = FairDraw.run({ mode: 'wheel', contestants: c, serverSeed: SEED_A, clientSeed: cs, nonce: 0, winnerCount: w, alternates: a })
  return { c, r, p: FairShow.plan({ serverSeed: SEED_A, clientSeed: cs, nonce: 0, contestants: c, standings: r.standings }) }
}
test('show: order starts with the engine standings verbatim', function () {
  for (const n of [2, 3, 7, 16, 33]) {
    const { r, p } = showFor(n, 'seed' + n, 1, Math.min(2, n - 1))
    assertEqual(JSON.stringify(p.order.slice(0, r.standings.length)), JSON.stringify(r.standings), 'prefix n=' + n)
    assertEqual(p.order.length, n, 'everyone placed')
    assertEqual(new Set(p.order).size, n, 'no duplicates')
  }
})
test('show: elimination order is the reverse, champion never eliminated', function () {
  const { r, p } = showFor(10, 'elim', 2, 1)
  assertEqual(p.eliminations.length, 9, 'n-1 eliminations')
  assert(p.eliminations.indexOf(r.winners[0]) === -1, 'winner eliminated')
  assertEqual(p.eliminations[p.eliminations.length - 1], r.standings[1], 'final two loser is place 2')
})
test('show: deterministic and domain-separated from the result stream', function () {
  const a = showFor(12, 'det', 1, 0).p, b = showFor(12, 'det', 1, 0).p
  assertEqual(JSON.stringify(a), JSON.stringify(b), 'replay identical')
  const c = showFor(12, 'det2', 1, 0).p
  assert(JSON.stringify(a.order) !== JSON.stringify(c.order) || JSON.stringify(a.quips) !== JSON.stringify(c.quips), 'seed affects show')
  assertEqual(FairShow.DOMAIN, 'fairdraw-visual-1|', 'domain tag pinned')
})
test('show: commentary picker uses the pinned list and names the entrant', function () {
  const { p } = showFor(9, 'quips', 1, 0)
  p.quips.forEach((q, i) => {
    assert(q.indexOf(p.eliminations[i]) !== -1, 'quip names entrant')
    assert(FairShow.QUIPS.some(t => t.split('{name}').join(p.eliminations[i]) === q), 'quip from list')
  })
})
test('show: bracket champion is always the engine winner, byes never meet', function () {
  for (const n of [2, 3, 5, 8, 9, 17, 64]) {
    const { r, p } = showFor(n, 'br' + n, 1, 0)
    const last = p.bracket[p.bracket.length - 1]
    assertEqual(last.length, 1, 'one final')
    assertEqual(last[0].winner, r.winners[0], 'champion n=' + n)
    p.bracket[0].forEach(m => assert(m.a !== null || m.b !== null, 'bye vs bye'))
    const seen = new Set(); p.bracket[0].forEach(m => { if (m.a) seen.add(m.a); if (m.b) seen.add(m.b) })
    assertEqual(seen.size, n, 'everyone seeded once')
  }
})
test('show: shipped receipts are unaffected (plan does not touch the result stream)', function () {
  const r = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'sample-receipt.json'), 'utf8'))
  const before = JSON.stringify(FairDraw.run(r).winners)
  FairShow.plan({ serverSeed: r.serverSeed, clientSeed: r.clientSeed, nonce: r.nonce, contestants: FairDraw.resolveRoster(r), standings: r.standings || r.winners })
  assertEqual(JSON.stringify(FairDraw.run(r).winners), before, 'winners unchanged')
  assert(FairDraw.verifyReceipt(r).ok, 'still verifies')
})

/* ------------------------------------------------------------------ *
 * Summary                                                             *
 * ------------------------------------------------------------------ */

console.log('')
console.log('='.repeat(60))
console.log(failCount === 0
  ? 'ALL TESTS PASSED  (' + passCount + '/' + passCount + ')'
  : failCount + ' FAILED, ' + passCount + ' passed')
if (failCount) for (const f of failures) console.log('  - ' + f)
console.log('='.repeat(60))

process.exitCode = failCount === 0 ? 0 : 1

// Requiring this file runs the suite (everything above is synchronous) and
// leaves the tally here, which is how `verify.js --selftest` reports it.
module.exports = { passed: passCount, failed: failCount, failures }
