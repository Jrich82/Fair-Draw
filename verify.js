#!/usr/bin/env node
/*
 * FairDraw independent verifier.
 *
 *   node verify.js <receipt.json>   verify a receipt file
 *   node verify.js                  verify a receipt piped in on stdin
 *   node verify.js --selftest       run the full test suite (test.js)
 *   node verify.js --help           this message
 *
 * Exit code 0 = verified, 1 = anything else. Zero dependencies: it uses
 * the very same engine.js the browser page uses, so if this says the draw
 * checks out, the draw checks out.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const FairDraw = require('./engine.js')

const USAGE = [
  'FairDraw verifier',
  '',
  'Usage:',
  '  node verify.js <receipt.json>   verify a receipt file',
  '  node verify.js                  verify a receipt read from stdin',
  '  node verify.js --selftest       run the test suite',
  '  node verify.js --no-beacon <f>  skip the network check of a drand seed',
  '  node verify.js --help           show this message',
  '',
  'Exit code is 0 when the receipt verifies, 1 otherwise.',
  '',
  'A receipt looks like:',
  '  {',
  '    "version": "fairdraw-2",',
  '    "drawId": "<64 hex>",',
  '    "commit": "<64 hex>",',
  '    "mode": "wheel" | "rumble" | "rpg",',
  '    "contestants": ["Ada", "Bo"],          // or:',
  '    "roster": {"kind":"range","from":1,"to":10000},',
  '    "alternates": 2,',
  '    "groupBy": "none" | "holder",',
  '    "draws": 1,',
  '    "winnerCount": 1,',
  '    "clientSeed": "block-height-871402",',
  '    "nonce": 0,',
  '    "winners": ["Ada"],',
  '    "standings": ["Ada", "Bo"],',
  '    "serverSeed": "<64 hex>",',
  '    "drawnAt": "2026-01-01T00:00:00.000Z"',
  '  }'
].join('\n')

/* ------------------------------------------------------------------ *
 * Output helpers — ASCII only, Windows consoles mangle box drawing    *
 * ------------------------------------------------------------------ */

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR
const bold = (s) => (COLOR ? '\u001b[1m' + s + '\u001b[0m' : s)
const green = (s) => (COLOR ? '\u001b[32m' + s + '\u001b[0m' : s)
const red = (s) => (COLOR ? '\u001b[31m' + s + '\u001b[0m' : s)
const boldGreen = (s) => (COLOR ? '\u001b[1;32m' + s + '\u001b[0m' : s)
const boldRed = (s) => (COLOR ? '\u001b[1;31m' + s + '\u001b[0m' : s)

function out (line) { console.log(line === undefined ? '' : line) }
function fail (message) {
  console.error('Error: ' + message)
  console.error('Run `node verify.js --help` for usage.')
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * Receipt validation — every complaint must be a sentence, never a    *
 * stack trace.                                                        *
 * ------------------------------------------------------------------ */

const HEX64 = /^[0-9a-f]{64}$/

function validate (r) {
  const problems = []
  const isStr = (v) => typeof v === 'string'

  if (r === null || typeof r !== 'object' || Array.isArray(r)) {
    return ['the receipt must be a JSON object']
  }

  if (!isStr(r.serverSeed)) problems.push('"serverSeed" is missing (it is revealed after the draw)')
  else if (!HEX64.test(r.serverSeed)) problems.push('"serverSeed" must be 64 lowercase hex characters')

  if (!isStr(r.commit)) problems.push('"commit" is missing')
  else if (!HEX64.test(r.commit)) problems.push('"commit" must be 64 lowercase hex characters')

  if (r.drawId !== undefined && r.drawId !== null && !HEX64.test(String(r.drawId))) {
    problems.push('"drawId" must be 64 lowercase hex characters if present')
  }

  if (!isStr(r.mode)) problems.push('"mode" is missing')
  else if (FairDraw.MODES.indexOf(r.mode) === -1) {
    problems.push('"mode" must be one of: ' + FairDraw.MODES.join(', ') + ' (got "' + r.mode + '")')
  }

  const specRoster = r.roster && typeof r.roster === 'object' &&
    (r.roster.kind === 'range' || r.roster.kind === 'tickets')
  const rangeRoster = specRoster && r.roster.kind === 'range'
  if (specRoster && r.roster.kind === 'tickets') {
    if (!Array.isArray(r.roster.entries) || !r.roster.entries.length) {
      problems.push('"roster" ticket entries must be a non-empty array')
    } else if (!r.roster.entries.every(function (e) {
      return e && typeof e.holder === 'string' && e.holder.length &&
        Number.isInteger(e.entries) && e.entries > 0
    })) {
      problems.push('each ticket entry needs a "holder" string and a positive whole "entries" count')
    }
  } else if (rangeRoster) {
    if (!Number.isInteger(r.roster.from) || !Number.isInteger(r.roster.to)) {
      problems.push('"roster" range bounds must be whole numbers')
    } else if (r.roster.to < r.roster.from) {
      problems.push('"roster" range ends before it starts')
    } else if (r.roster.to - r.roster.from + 1 < 2) {
      problems.push('"roster" range needs at least 2 entries')
    }
  } else if (!Array.isArray(r.contestants)) {
    problems.push('"contestants" is missing or not an array (and no {kind:"range"|"tickets"} roster was given)')
  } else if (r.contestants.length < 2) problems.push('"contestants" needs at least 2 names')
  else if (!r.contestants.every(isStr)) problems.push('"contestants" must contain only strings')

  if (!Array.isArray(r.winners)) problems.push('"winners" is missing or not an array')
  else if (!r.winners.every(isStr)) problems.push('"winners" must contain only strings')

  if (!Number.isInteger(r.winnerCount) || r.winnerCount < 1) {
    problems.push('"winnerCount" must be a whole number of at least 1')
  }

  if (!isStr(r.clientSeed) || r.clientSeed.length === 0) problems.push('"clientSeed" is missing')
  if (!Number.isInteger(r.nonce)) problems.push('"nonce" must be a whole number')

  if (r.alternates !== undefined && (!Number.isInteger(r.alternates) || r.alternates < 0)) {
    problems.push('"alternates" must be a whole number of 0 or more')
  }
  if (r.draws !== undefined && r.draws !== null && (!Number.isInteger(r.draws) || r.draws < 1)) {
    problems.push('"draws" must be a whole number of at least 1')
  }
  if (r.groupBy !== undefined && r.groupBy !== null && r.groupBy !== 'none' && r.groupBy !== 'holder') {
    problems.push('"groupBy" must be "none" or "holder"')
  }
  if (r.standings !== undefined && (!Array.isArray(r.standings) || !r.standings.every(isStr))) {
    problems.push('"standings" must be an array of strings if present')
  }

  const KNOWN_VERSIONS = ['fairdraw-1', 'fairdraw-2']
  if (r.version !== undefined && KNOWN_VERSIONS.indexOf(r.version) === -1) {
    problems.push('unsupported "version": ' + JSON.stringify(r.version) +
      ' (this verifier speaks ' + KNOWN_VERSIONS.join(' and ') + ')')
  }

  return problems
}

/* ------------------------------------------------------------------ *
 * Beacon check (optional, needs network)                              *
 * ------------------------------------------------------------------ *
 * When a receipt promises its client seed came from a drand round, go
 * and look. Several independent mirrors are asked and must agree.
 *
 * This is NOT a signature verification: we do not check drand's BLS
 * signature, which would need pairing crypto. We check that what the
 * public beacon serves matches what the receipt claims. That defeats an
 * operator who invented a seed; it does not defeat someone who also
 * controls every mirror you asked.
 */

const DRAND_MIRRORS = [
  'https://api.drand.sh',
  'https://api2.drand.sh',
  'https://api3.drand.sh',
  'https://drand.cloudflare.com'
]

async function checkBeacon (receipt) {
  const e = receipt.entropy
  if (!e || e.source !== 'drand') return null
  const chain = e.chain || FairDraw.DRAND.chain
  const round = e.round

  const answers = []
  for (const m of DRAND_MIRRORS) {
    try {
      const res = await fetch(m + '/' + chain + '/public/' + round, { cache: 'no-store' })
      if (!res.ok) continue
      const j = await res.json()
      if (j && j.round === round && typeof j.randomness === 'string') {
        answers.push({ mirror: m, randomness: j.randomness })
      }
    } catch (err) { /* a mirror being down is not a verification failure */ }
  }

  if (!answers.length) {
    return { state: 'unknown', detail: 'no drand mirror could be reached, so the seed could not be checked' }
  }
  const distinct = [...new Set(answers.map(a => a.randomness))]
  if (distinct.length > 1) {
    return { state: 'fail', detail: 'mirrors disagree about round ' + round + ' - do not trust this draw' }
  }
  const published = distinct[0]
  if (published !== receipt.clientSeed) {
    return {
      state: 'fail',
      detail: 'round ' + round + ' published ' + published +
        ' but the receipt used ' + receipt.clientSeed
    }
  }
  return {
    state: 'ok',
    detail: answers.length + ' of ' + DRAND_MIRRORS.length + ' mirrors agree that round ' +
      round + ' is exactly the client seed used'
  }
}

/* ------------------------------------------------------------------ *
 * The report                                                          *
 * ------------------------------------------------------------------ */

function pad (label, width) { return (label + ' '.repeat(width)).slice(0, width) }

async function report (receipt, source, noBeacon) {
  const seedHash = FairDraw.sha256Hex(receipt.serverSeed)
  const rosterSpec = receipt.roster &&
    (receipt.roster.kind === 'range' || receipt.roster.kind === 'tickets') ? receipt.roster : null
  const isRange = !!(rosterSpec && rosterSpec.kind === 'range')
  const entries = FairDraw.resolveRoster(receipt)
  const recomputedId = FairDraw.drawId(receipt.commit, receipt.mode, receipt.winnerCount,
    rosterSpec || receipt.contestants,
    receipt.alternates || 0, receipt.version, receipt.groupBy, receipt.draws)

  out()
  out(bold('FairDraw receipt verification'))
  out('============================================================')
  out(pad('  Source', 16) + source)
  out(pad('  Game', 16) + receipt.mode)
  out(pad('  Draw ID', 16) + (receipt.drawId || '(not stated in the receipt)'))
  out(pad('  Drawn at', 16) + (receipt.drawnAt || '(not stated)'))
  out(pad('  Client seed', 16) + receipt.clientSeed)
  out(pad('  Nonce', 16) + receipt.nonce)
  out(pad('  Winners', 16) + receipt.winnerCount + ' of ' + entries.length.toLocaleString() + ' entries' +
    (receipt.alternates ? ', plus ' + receipt.alternates + ' alternate' + (receipt.alternates === 1 ? '' : 's') : ''))
  if (receipt.groupBy === 'holder') out(pad('  Rule', 16) + 'one prize per person')
  if (receipt.entropy && receipt.entropy.source === 'drand') {
    out(pad('  Seed source', 16) + 'drand round ' + receipt.entropy.round +
      ' (pinned before it was published)')
  } else if (receipt.entropy) {
    out(pad('  Seed source', 16) + 'chosen by hand')
  }
  if (receipt.draws !== undefined && receipt.draws !== null) {
    out(pad('  Draw budget', 16) + 'draw ' + (receipt.nonce + 1) + ' of ' + receipt.draws +
      ' authorised by this commitment')
  }
  // A range prints as its bounds and tickets as one line per person; only a
  // listed roster is worth echoing in full, and even then not ten thousand.
  let rosterLine
  if (isRange) {
    rosterLine = 'range:' + receipt.roster.from + '-' + receipt.roster.to
  } else if (rosterSpec) {
    const shown = rosterSpec.entries.slice(0, 12)
      .map((e) => e.holder + ' x' + e.entries).join(', ')
    rosterLine = rosterSpec.entries.length.toLocaleString() + ' people holding ' +
      entries.length.toLocaleString() + ' tickets: ' + shown +
      (rosterSpec.entries.length > 12 ? ', ...' : '')
  } else if (entries.length > 40) {
    rosterLine = entries.slice(0, 40).join(', ') + ', ... (' + (entries.length - 40) + ' more)'
  } else {
    rosterLine = entries.join(', ')
  }
  out(pad('  Roster', 16) + rosterLine)
  out()

  // Eyeball material: the operator published the commit BEFORE the draw,
  // so these two strings matching is what makes the whole thing honest.
  out(bold('  Commitment (compare these two by eye)'))
  out('    server seed revealed  ' + receipt.serverSeed)
  out('    SHA-256(server seed)  ' + seedHash)
  out('    published commit      ' + receipt.commit)
  out('                          ' + (seedHash === receipt.commit
    ? green('^ identical')
    : red('^ THESE DO NOT MATCH')))
  out()
  out(bold('  Draw ID (pins the roster, game and winner count)'))
  out('    recomputed            ' + recomputedId)
  out('    published             ' + (receipt.drawId || '(none supplied - nothing to compare)'))
  out()

  const result = FairDraw.verifyReceipt(receipt)

  out(bold('  Checks'))
  for (const check of result.checks) {
    const tag = check.ok ? green('[OK]  ') : red('[FAIL]')
    out('    ' + tag + '  ' + check.name)
    out('              ' + check.detail)
  }
  out()

  out(bold('  Recomputed winners'))
  if (result.winners.length === 0) {
    out('    (the draw could not be replayed)')
  } else {
    result.winners.forEach((name, i) => { out('    ' + (i + 1) + '. ' + name) })
  }
  out()
  out('  Claimed on the receipt: ' + (receipt.winners.length ? receipt.winners.join(', ') : '(none)'))
  out()

  // The beacon check must land BEFORE the verdict. A reader who sees
  // "VERIFIED" and then a failure line below it has been told the wrong
  // thing first, and that is the line people screenshot.
  let beacon = null
  if (receipt.entropy && receipt.entropy.source === 'drand' && !noBeacon) {
    out(bold('  Beacon check') + ' (asking the public drand network)')
    try {
      beacon = await checkBeacon(receipt)
    } catch (err) {
      beacon = { state: 'unknown', detail: String((err && err.message) || err) }
    }
    const tag = beacon.state === 'ok' ? green('[OK]  ')
      : beacon.state === 'fail' ? red('[FAIL]') : '[????]'
    out('    ' + tag + '  ' + beacon.detail)
    if (beacon.state === 'unknown') {
      out('              the rest of the receipt still verifies; only the seed origin is unconfirmed')
    }
    out()
  }

  const beaconFailed = !!(beacon && beacon.state === 'fail')
  const beaconUnknown = !!(beacon && beacon.state === 'unknown')
  const ok = result.ok && !beaconFailed

  out('============================================================')
  if (!ok) {
    out(boldRed('VERDICT: FAILED') + ' - this receipt does not check out.')
    out(beaconFailed
      ? 'The client seed is not what the pinned drand round actually published.'
      : 'Do not trust the announced result. The failing check above says why.')
  } else if (beaconUnknown) {
    out(bold('VERDICT: VERIFIED, seed origin unconfirmed') + ' - the commitment opens,')
    out('                   the Draw ID matches and the replay reproduces these winners,')
    out('                   but drand could not be reached to confirm the seed.')
  } else {
    out(boldGreen('VERDICT: VERIFIED') + ' - the commitment opens, the Draw ID matches, and')
    out('                   replaying the game reproduces exactly these winners.')
    if (beacon) {
      out('                   The seed is the drand round pinned before it existed.')
    } else if (receipt.entropy && receipt.entropy.source === 'drand') {
      // Silence here would read as assurance the run never actually gave.
      out('')
      out('  NOTE: this receipt claims its seed came from drand round ' + receipt.entropy.round + ',')
      out('        but --no-beacon skipped that check. Re-run without it to confirm the')
      out('        seed really is what the beacon published.')
    }
  }
  out()

  return ok
}

/* ------------------------------------------------------------------ *
 * Input                                                               *
 * ------------------------------------------------------------------ */

function readFileOrDie (file) {
  const abs = path.resolve(file)
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (err) {
    if (err && err.code === 'ENOENT') fail('no such file: ' + abs)
    if (err && err.code === 'EACCES') fail('permission denied reading: ' + abs)
    fail('could not open ' + abs + ' (' + ((err && err.message) || err) + ')')
  }
  if (stat.isDirectory()) fail(abs + ' is a directory, not a receipt file')
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch (err) {
    fail('could not read ' + abs + ' (' + ((err && err.message) || err) + ')')
  }
}

function readStdinOrDie () {
  if (process.stdin.isTTY) {
    fail('no receipt given. Pass a file path, or pipe the JSON in on stdin.')
  }
  try {
    return fs.readFileSync(0, 'utf8')
  } catch (err) {
    fail('could not read stdin (' + ((err && err.message) || err) + ')')
  }
}

function parseOrDie (text, source) {
  if (!text || !text.trim()) fail('nothing to verify - ' + source + ' was empty.')
  try {
    return JSON.parse(text)
  } catch (err) {
    fail(source + ' is not valid JSON: ' + ((err && err.message) || err))
  }
}

/* ------------------------------------------------------------------ *
 * Entry point                                                         *
 * ------------------------------------------------------------------ */

async function main (argv) {
  const args = argv.slice(2)

  if (args.some(a => a === '-h' || a === '--help')) {
    out(USAGE)
    return 0
  }

  if (args.some(a => a === '--selftest')) {
    out(bold('FairDraw self-test'))
    out('Running the full suite from test.js ...')
    let results
    try {
      results = require('./test.js')
    } catch (err) {
      console.error('')
      console.error('Error: the test suite could not run: ' + ((err && err.message) || err))
      return 1
    }
    out('')
    out(results.failed === 0
      ? boldGreen('SELFTEST PASSED') + ' - ' + results.passed + ' tests, 0 failures.'
      : boldRed('SELFTEST FAILED') + ' - ' + results.failed + ' of ' +
        (results.passed + results.failed) + ' tests failed.')
    return results.failed === 0 ? 0 : 1
  }

  const files = args.filter(a => a[0] !== '-')
  const flags = args.filter(a => a[0] === '-')
  const noBeacon = flags.includes('--no-beacon')
  const rest = flags.filter(f => f !== '--no-beacon')
  if (rest.length) fail('unknown option: ' + rest[0])
  if (files.length > 1) fail('one receipt at a time, please (got ' + files.length + ' paths)')

  const source = files.length ? path.resolve(files[0]) : 'stdin'
  const text = files.length ? readFileOrDie(files[0]) : readStdinOrDie()
  const receipt = parseOrDie(text, files.length ? source : 'stdin')

  const problems = validate(receipt)
  if (problems.length) {
    console.error('')
    console.error('Error: this does not look like a complete FairDraw receipt.')
    for (const p of problems) console.error('  - ' + p)
    console.error('')
    console.error('Run `node verify.js --help` to see the expected shape.')
    return 1
  }

  let ok
  try {
    ok = await report(receipt, source, noBeacon)
  } catch (err) {
    console.error('')
    console.error('Error: the receipt could not be verified: ' + ((err && err.message) || err))
    return 1
  }

  return ok ? 0 : 1
}

main(process.argv).then((code) => { process.exitCode = code })
