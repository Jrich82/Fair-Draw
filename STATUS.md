# FairDraw — status

Last updated 2026-11-01.

A provably-fair winner picker. Static page, zero dependencies, works offline
from `file://`. Commit–reveal: publish `SHA-256(serverSeed)` plus a Draw ID
pinning the roster before the draw; reveal the seed after; anyone replays it.

## Run it

```bash
node test.js
```

```bash
node verify.js beacon-receipt.json
```

Open `index.html` directly, or serve the folder. **109/109 tests pass** (`npm test` runs tests, selftest and both sample receipts).

## Files

| File | What it is |
|---|---|
| `engine.js` | single source of truth — SHA-256, HMAC, the byte stream, all three games. Pure, synchronous, no dependencies, no network |
| `index.html` | the app: setup, three animated draws, verifier |
| `verify.js` | independent CLI verifier (`node verify.js receipt.json`) |
| `test.js` | 109 tests including chi-square uniformity and NIST vectors |
| `PROTOCOL.md` | byte-level spec for reimplementing the verifier elsewhere |
| `README.md` | operator guide |
| `research/` | four research passes + `00-SYNTHESIS.md` (the build plan) |

## Done

**Core.** Commit–reveal with a Draw ID pinning roster, mode, winner count,
alternates, the one-prize-per-person rule, the draw budget and the entropy
source. Three animated draws (wheel, royal rumble, RPG hit points) plus a
ticket odometer for large fields.

**Entry modes.** Names; numeric ranges (committed as `range:1-10000`, not the
expansion); tickets (`Ada, 5`), committed one record per person. CSV import
with a review line.

**Ranking.** Winners plus ranked alternates. Adding alternates provably cannot
change who won — the K-winner result is a stable prefix of any deeper draw.

**Beacon entropy.** The client seed can be a future drand round, pinned into
the Draw ID ~90s before that round exists. Verified live end to end against
four independent mirrors; a forged seed fails with exit 1.

**Exports.** Receipt (.json), results (.csv), roster (.csv).

## Not done

- **Merkle roots** for very large *named* rosters. Compact ticket and range
  specs absorbed most of the pressure (50,000 tickets = 36 KB), so this only
  matters for a large roster of distinct names with privacy needs.
- **Permanent shareable result page** — mostly a hosting decision.
- Integer weights were deliberately **dropped**: tickets deliver proportional
  odds with no weighting code, no float hazard, and a cleaner legal position.

## Known limits, stated honestly

- A beacon check compares against what drand *serves*. It is not a BLS
  signature verification — that needs pairing crypto and would cost the engine
  its zero-dependency property. It defeats an invented seed or a swapped
  round; it does not defeat someone controlling every mirror queried.
- Without the beacon, the draw budget makes a suppressed draw *conspicuous*,
  not impossible. Nothing forces publication.
- The commitment proves the number was not steered. It does not prove the
  roster was complete or that entrants are distinct real people.

## Legal, before shipping anything with paid entry

Extra entries must be **earned, never sold**. Prize + chance + consideration is
a lottery, illegal for a for-profit in most US states. Under $5,000 total prize
value avoids NY/FL/RI registration; Maine exempts raffles under $2,500.
Keeping FairDraw separate from CyberDice matters — CA AB 831 and Maine LD 2007
extend liability to platform providers for casino-style sweepstakes.
See `research/02-legal-compliance.md`. General information, not legal advice.

## Development note

`engine.js` is loaded as `engine.js?v=2`. Browsers cache subresources
aggressively; a stale copy once made a test pass against code no longer on
disk. The dev server sends no-cache headers for this reason.


## 2026-11-01 — fix-first polish

- drand beacon is now the default seed source; typed seeds show a "announce publicly first" warning and are locked after the first run (change requires *Start over*).
- Manual verifier form now builds params via `engine.paramsFromFields` (same path as receipts): roster type, one-prize-per-person and seed source/drand round are inputs, so honest ticket/one-prize and drand draws verify.
- Copy button falls back to a visible, pre-selected text box with "Copy failed — select and copy manually".
- GitHub Pages ready (`.nojekyll`, relative paths, README "Verify online"); MIT LICENSE; `package.json` test script.
