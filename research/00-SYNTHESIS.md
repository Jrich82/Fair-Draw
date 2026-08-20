# FairDraw — what to build, and what not to

Synthesis of the four research passes in this folder. Written 2026-08-16.

- [01-promo-taxonomy.md](01-promo-taxonomy.md) — promotion types and required mechanics
- [02-legal-compliance.md](02-legal-compliance.md) — sweepstakes/raffle law (general info, **not legal advice**)
- [03-crypto-scale.md](03-crypto-scale.md) — weighted selection, scale, Merkle, beacons
- [04-prior-art.md](04-prior-art.md) — competitors and verification UX

---

## The finding that matters

**Theatre and proof live in separate products, and nobody has both.**

| | Watchable draw | Real cryptographic proof |
|---|---|---|
| Wheel of Names, Comment Picker, chat bots | yes | none |
| Gleam, Woobox, SweepWidget, ViralSweep, KingSumo | some | none — Gleam's own fairness FAQ suggests *screenshots* |
| RANDOM.ORG Signed API, Chainlink/Solana VRF | none | yes |
| **FairDraw** | **yes** | **yes** |

Two edges nobody else claims:

1. **Nobody commits to the roster.** The real giveaway scandals are not rigged RNG — they are "hand-pick 25 names, *then* run an honest generator." FairDraw's `drawId` already pins the roster, mode and winner count before the draw. This is the strongest existing feature and it is currently undersold.
2. **Nobody's proof outlives the campaign.** RANDOM.ORG's Multi-Round Giveaway Service ($1/draw) issues a lookup code that **expires after a month**. A FairDraw receipt is a self-contained file that verifies forever, offline.

---

## Hard constraints

**Paid entries must never outweigh free ones.** Prize + chance + consideration = a lottery, illegal for a for-profit in most US states. A "buy more tickets for better odds" toggle is building the illegal shape. Free bonus entries (share/refer for +1) are legal and common, so integer weighting is still needed — just never priced.

The clean architectural expression:

> **The selection function must not be able to see whether an entry was paid or free.** One pool, one weight per entry, no `entryType` reachable from draw code.

The UK Gambling Commission words the same rule as: the system must not recognise the two routes as different. The existing chi-square uniformity tests become the compliance artifact.

**Stay under $5,000 total prize value** and NY, FL and RI registration all fall away. Maine exempts raffles under $2,500.

**Keep FairDraw separate from CyberDice** unless a lawyer says otherwise. CA AB 831 (effective 2026-01-01) and Maine LD 2007 (effective mid-July 2026) both extend liability to *platform providers* supporting online sweepstakes games. Those target dual-currency casino simulations — a standalone giveaway picker is well clear, a draw mechanic inside a Solana casino is not obviously so.

---

## Build order

### Phase 1 — cheap, high value, no new cryptography

1. **Labelled-fields verifier.** Copy the Stake/BC.Game pattern users already recognise: discrete inputs (server seed / client seed / nonce / mode) + `[Verify]`, with a standalone SHA-256 box. Today's Verify tab wants a pasted JSON blob, which is the deviation from convention. Keep JSON as the secondary path.
2. **Publish the full permutation.** `runRumble`/`runRpg` already compute `standings` and the receipt discards it. Unlocks tiered prizes, alternates and brackets at once, and removes the incentive to redraw. Confirmed safe: the K-winner result is a stable prefix of the full N-permutation. Two caveats — `winnerCount` is in the `drawId`, so decide whether the wheel always runs the full ranking; and `runWheel`'s per-spin `pool.slice()` snapshots are O(N²) memory (crashed a 4 GB heap at 100k) and must be reconstructed by the renderer instead of stored.
3. **Numeric range as a first-class roster kind.** Hash `range:1-5000`, not the expansion. Zero PII, a human-readable commitment, O(K) memory — and it delivers "more tickets = more chances" with *no weighting code*, because holding tickets 1–50 is 50 entries, not a weight.
4. **Nonce in the `drawId`, plus sequential serial numbers.** Nonce grinding is currently free — replay nonces privately, publish the flattering one, and every check still passes. Serial numbers are RANDOM.ORG's answer: suppressed draws show up as gaps.
5. **CSV import with a duplicate-review screen before locking.**

### Phase 2 — weighting and scale

6. **Integer weights**, cumulative sums + rejection-sampled uniform, `weightMode` (`ticket`/`person`/`none`) committed. Integer only — float weights are fatal because FP addition is non-associative, so a verifier summing in another order gets a different total and a different winner.
7. **Raise the entrant cap.** The wheel's honest ceiling is ~360 entries (1°/slice); past that slices go sub-pixel and it stops being evidence. Above that, switch the visual to a numeric odometer, whose honesty is N-independent.
8. **Entry and result export.**

### Phase 3 — trust hardening

9. **drand quicknet round as the client seed** (optional layer — full BLS12-381 verification would break `engine.js`'s zero-dependency property). This is the real fix for nonce grinding: entropy that did not exist at commit time.
10. **Merkle root for large rosters** (RFC 6962: `0x00` leaf / `0x01` internal prefixes, odd node promoted not duplicated — duplication is CVE-2012-2459). Only worth it above ~1000 entrants with privacy needs. Not needed for numeric ranges, and it proves inclusion, never completeness.
11. **Permanent shareable result page.**

---

## Deliberately not building

| Rejected | Why |
|---|---|
| Paid ticket weighting | Builds the illegal shape (consideration) |
| Bundling into CyberDice | AB 831 / LD 2007 platform-provider liability |
| A-Res weighted reservoir sampling | Needs `pow`/`log`; ECMA-262 permits approximated results, so one ulp swaps two entrants |
| Alias method | Table construction becomes part of the result — a verifier must replicate the build order |
| Ticket expansion (except ranges) | Expansion order becomes part of the result |
| Merkle trees for numeric ranges | The commitment is already a short readable string |
| BLS verification inside `engine.js` | Breaks the zero-dependency, any-runtime property |

---

## Known open issues

- `runWheel` event snapshots are O(N²) memory — blocks full-permutation output at scale.
- `rpg` is O(N²) per round; needs a roster cap.
- The nonce-grinding gap is real and unfixed. Any mitigation short of external entropy is procedural only, and the verifier should say plainly what it cannot check.
- Unverified claim from the legal pass: that the 1099 prize threshold moved $600 → $2,000. Confirm before relying on it.
