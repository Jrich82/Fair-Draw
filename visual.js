/*
 * FairDraw "show plan" — deterministic, presentation-only derivations.
 *
 * NOTHING here decides who wins. Winners, alternates and their order come
 * only from FairDraw.run() (engine.js). This file turns that result into a
 * replayable show: a full elimination order (unranked entrants are shuffled
 * cosmetically), commentary lines, bracket seeding, slot/plinko jitter.
 *
 * Every cosmetic choice reads a SEPARATE, domain-separated HMAC stream
 *   FairRng(serverSeed, 'fairdraw-visual-1|' + clientSeed, nonce)
 * so the show is identical on every replay and in `verify.js --show`,
 * and it never consumes bytes from the result stream. See PROTOCOL.md
 * "Presentation layer".
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'))
  else root.FairShow = factory(root.FairDraw)
})(typeof self !== 'undefined' ? self : globalThis, function (F) {
  'use strict'

  const DOMAIN = 'fairdraw-visual-1|'
  const VISUAL_MODES = ['horse', 'battle', 'plinko', 'slots', 'claw', 'bracket']

  const QUIPS = [
    '{name} tripped over a snowbank.',
    '{name} went back for the truck keys and missed the bell.',
    '{name} stopped to watch a moose cross Route 1.',
    '{name} got stuck in mud season.',
    '{name} slipped on the ice at the bean supper.',
    '{name} was distracted by a fresh whoopie pie.',
    '{name} ran out of gas halfway to Bangor.',
    '{name} got lost on a road with no name.',
    '{name} stopped to haul lobster traps.',
    '{name} had to go stack the woodpile.',
    '{name} got swarmed by blackflies.',
    '{name} took the wrong turn at the dump.',
    '{name} went ice fishing and forgot to come back.',
    '{name} was busy shoveling the roof.',
    '{name} lost a boot in a snowdrift.',
    '{name} stopped for a red hot dog and a Moxie.',
    '{name} got snowed in. Again.',
    '{name} hit a frost heave and bounced out.',
    '{name} waited on the plow truck too long.',
    '{name} argued about where "downeast" starts.',
    '{name} went to the camp and lost signal.',
    '{name} was out tapping maple trees.',
    '{name} got stuck behind a tractor on a two-lane.',
    '{name} fell asleep by the woodstove.',
    '{name} paused to say "ayuh" and the moment passed.',
    '{name} rolled a degen parlay and it bricked.',
    '{name} got rugged by a snowmobile with a dead battery.',
    '{name} wicked close, but not today, bub.'
  ]

  function showRng (serverSeed, clientSeed, nonce) {
    return new F.FairRng(serverSeed, DOMAIN + clientSeed, nonce)
  }

  /**
   * Full finishing order, champion first. Ranked places (winners then
   * alternates) are copied verbatim from the engine; everyone else is
   * cosmetically shuffled from the show stream.
   * eliminations = reverse of that (first out first).
   */
  function plan (opts) {
    const { serverSeed, clientSeed, nonce, contestants, standings } = opts
    if (!Array.isArray(standings) || !standings.length) throw new Error('standings required')
    const rng = showRng(serverSeed, clientSeed, nonce)
    const ranked = new Set(standings)
    const rest = rng.shuffle(contestants.filter(n => !ranked.has(n)))
    const order = standings.concat(rest) // place 1 .. N
    const eliminations = order.slice(1).reverse()
    const quips = eliminations.map(n => pickQuip(rng, n))
    const bracket = buildBracket(rng, order)
    // per-elimination cosmetic jitter in [0,1) (near-miss offsets, plinko bounces...)
    const jitter = order.map(() => rng.nextInt(1000) / 1000)
    return { order, eliminations, quips, bracket, jitter, bytesUsed: rng.bytesUsed }
  }

  function pickQuip (rng, name) {
    return QUIPS[rng.nextInt(QUIPS.length)].split('{name}').join(name)
  }

  /**
   * Single-elimination bracket. Slots = next power of two; entrants are
   * placed by a show-stream shuffle, byes fill the rest. Each match is won
   * by whoever finishes HIGHER in `order`, so the champion is always
   * order[0] (the engine's first winner) and nothing else can win.
   */
  function buildBracket (rng, order) {
    const place = new Map(order.map((n, i) => [n, i]))
    let size = 1
    while (size < order.length) size *= 2
    const seeded = rng.shuffle(order.slice())
    const slots = seeded.concat(new Array(size - seeded.length).fill(null))
    // spread byes: interleave so no match is bye vs bye
    const firstRound = []
    const half = size / 2
    for (let i = 0; i < half; i++) firstRound.push([slots[i], slots[i + half]])
    const rounds = []
    let cur = firstRound
    for (;;) {
      const r = cur.map(([a, b]) => {
        let w
        if (a === null) w = b
        else if (b === null) w = a
        else w = place.get(a) < place.get(b) ? a : b
        return { a, b, winner: w }
      })
      rounds.push(r)
      if (r.length === 1) break
      const next = []
      for (let i = 0; i < r.length; i += 2) next.push([r[i].winner, r[i + 1].winner])
      cur = next
    }
    return rounds
  }

  return { DOMAIN, VISUAL_MODES, QUIPS, plan, showRng }
})
