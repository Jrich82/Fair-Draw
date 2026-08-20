# 03 — Cryptography, Weighting & Scale

Status: COMPLETE. Read-only research; no engine or protocol file was modified.

## Outline
0. Assumptions, and two places `PROTOCOL.md` is now behind `engine.js`
1. Weighted selection with integer weights
2. K winners without replacement
3. Full permutation & the prefix property
4. Scale: 10k / 100k / 1M
5. Large-list commitment (Merkle)
6. Public randomness beacons
7. The nonce-grinding gap
8. Consolidated recommendations
9. Sources

---

## 0. What this document assumes

Read `PROTOCOL.md` first. Everything here is written at that document's level of
precision, because the hard constraint is unchanged: **a third party must
re-derive the exact result in another language.** That single constraint kills
more algorithms in this document than performance does.

Two notes on the current code, recorded because they affect the specs below and
because `PROTOCOL.md` is now behind `engine.js` on both points (protocol §12
should be re-checked; not my file to edit):

- `engine.js` now stores `this.nonce = Number(nonce)` and throws on a
  non-integer. It is **no longer `ToInt32`**, contrary to `PROTOCOL.md` §3 and
  §12. `run()` additionally rejects `nonce < 0` and `nonce > 2^53-1`. This
  matters for §7 below: the nonce is now a full safe integer, so encoding a
  timestamp or a beacon round number in it is viable.
- `run()` now **throws** on an out-of-range `winnerCount` rather than clamping,
  rejects duplicate contestants, and `verifyReceipt` now **fails** a receipt
  with no `drawId` rather than passing it vacuously. `PROTOCOL.md` §10 steps 3–4
  describe the old behaviour.

---

## 1. Weighted selection with integer weights

### 1.1 Why the weights must be integers

Free bonus entries ("share for +1", "refer a friend for +3") are integer by
nature, so this costs nothing — but it must be *enforced*, because floats are a
reproducibility hazard on three separate levels:

1. **Decimal parsing.** `0.1` is not representable in binary64. Every mainstream
   language rounds it to the same double (IEEE 754-2019 requires correctly
   rounded decimal-to-binary conversion), but only if the parser is conformant;
   older `strtod` implementations, some JSON parsers and most spreadsheet
   exports are not. A weight column that round-trips through Excel can arrive as
   `0.30000000000000004`.
2. **Summation order.** Floating-point addition is **not associative**. The
   cumulative array `C[i] = C[i-1] + w[i]` is order-dependent, and a verifier
   that sums the same weights in a different order — or vectorises the loop, or
   contracts a multiply-add into an FMA, or keeps x87 80-bit intermediates —
   gets a *different total*, therefore a different rejection `limit`, therefore
   a different byte consumption and a different winner. This is the fatal one:
   it is silent, it is rare, and it passes every hand-written test.
3. **Comparison at the boundary.** `C[i] > r` where `C[i]` and `r` differ by one
   ULP flips the selected index.

**Rule.** Weights are decimal integer strings matching `^[1-9][0-9]*$`, parsed
to exact integers, `w[i] >= 1`, and `sum(w) <= 2^32` (see §1.5). Reject anything
else at the verifier boundary — no rounding, no coercion, no `parseFloat`. A
weight of `2.5` is an input error, not a value to round. Integer addition is
associative and exact in every language, so `totalWeight` is a
cross-implementation invariant. Publish it.

### 1.2 Option A — cumulative sum + rejection-sampled uniform (RECOMMENDED)

```
# contestants c[0..N-1] in committed order, integer weights w[0..N-1]
# precondition: every w[i] >= 1, total = sum(w) <= 2^32

pickWeighted(rng, alive, w):
    total = sum(w[i] for i where alive[i])     # exact integer arithmetic
    r     = rng.nextInt(total)                 # 4 bytes per attempt, rejection-sampled
    acc   = 0
    for i = 0 .. N-1:                          # committed roster order
        if not alive[i]: continue
        acc += w[i]
        if acc > r: return i
    unreachable                                # acc ends at total > r
```

Byte cost: exactly `4` bytes per attempt, so `4 * (1 + rejections)` per pick.
Rejection probability is `(2^32 mod total) / 2^32 < total / 2^32`.

**Why this one.** The specification is the *mathematics*, not the data
structure: "the smallest index `i`, in committed roster order, whose inclusive
prefix sum over live weights strictly exceeds `r`." A JS implementation may scan
linearly, a Rust implementation may binary-search a prefix array, a Go
implementation may use a Fenwick tree — all three return the same `i` for the
same `r`, because they compute the same function. Nothing about the internal
representation leaks into the result. That is exactly the property the alias
method lacks.

Note the boundary convention: `acc > r` (strict) with `r` drawn from
`[0, total)`. Using `acc >= r` shifts every boundary by one and silently changes
the winner whenever `r` lands on a boundary.

### 1.3 Option B — alias method (Walker/Vose): REJECT

O(1) per sample after O(N) construction, genuinely attractive at 1M entries.
Reject it anyway, for four reasons:

1. **The table is part of the result.** Vose's construction partitions items
   into "small" and "large" worklists and pairs them off. The table it produces
   depends on the *worklist discipline* — stack vs queue, iteration order, and
   how the exact tie `w[i]*N == total` is classified. Two correct
   implementations produce different-but-equally-valid tables, and therefore
   different winners from the same random stream. Making it reproducible means
   normatively specifying the construction loop — a far larger spec surface than
   §1.2's one sentence.
2. **It is natively floating-point.** The textbook formulation stores `p[i]*N`
   as doubles. An integer reformulation exists (scale by `total`; draw
   `nextInt(N)` then compare against a scaled threshold with `nextInt(total)`),
   but point (1) survives it.
3. **Sampling is with replacement.** Removing a winner invalidates the table,
   and rebuilding is O(N) per draw — so the O(1) advantage evaporates for
   K-without-replacement, the exact case FairDraw needs.
4. **Two reads per sample.** A bin index plus a coin, each with its own
   rejection behaviour — one more thing to pin exactly.

### 1.4 Option C — ticket expansion: REJECT (with one large exception)

Materialise `total` slots, one per weight unit, then draw uniformly with the
existing `nextInt(total)`. Superficially the simplest thing.

- **Memory.** 500k tickets is already hostile in a browser tab; 4.29e9 is
  impossible. And the roster is *hashed* into the Draw ID, so expansion also
  inflates the commitment preimage from N names to `total` entries.
- **Expansion order becomes part of the result.** Blocked (`AAABBC`) and
  interleaved (`ABABAC`) expansions are both "obviously correct" and give
  different winners from the same stream. Another normative loop to specify, for
  no benefit — §1.2 computes the identical distribution with no array at all.

**The exception:** a **numeric-range roster** ("1 to 5000") *is* ticket
expansion, done for free. Each number is one entry, a buyer holding 20 stubs is
weighted 20x with no weight mechanic in the engine, nothing is materialised
(draw `nextInt(hi-lo+1)+lo` against a seen-set), and the commitment is a
human-readable string with zero PII. Where a promo can be expressed as a
numbered range, **that is strictly better than the weight mechanic** and should
be the path the UI steers people toward. See also §5.3.

### 1.5 What happens when totalWeight exceeds 2^32 — it HANGS

Not a wrong-answer bug. A liveness bug, which is worse.

```
nextInt(n):
    if n <= 1: return 0
    limit = floor(4294967296 / n) * n
    do { x = nextUint32() } while (x >= limit)
    return x % n
```

For `n > 2^32`: `floor(2^32 / n) == 0`, so `limit == 0`, so `x >= limit` is
**always true** and the loop **never terminates**. It consumes 4 bytes per
iteration forever, spinning HMAC blocks until the tab dies. A careless weight
column (a wallet-balance snapshot pasted in raw wei, say) is therefore a
denial-of-service against every verifier in every language, including
hand-rolled reimplementations.

| `n` | `limit` | Behaviour |
| --- | --- | --- |
| `2^32 - 1` | `4294967295` | Rejects exactly one value (`0xFFFFFFFF`). Fine. |
| `2^32` | `4294967296` | `x >= limit` never true; never rejects; `x % n == x`. Fine. |
| `2^32 + 1` and above | `0` | **Infinite loop.** |

**Primary recommendation: validate, do not extend.** Add to `run()`'s input
checks, alongside the existing seed and roster validation:

```
if total > 4294967296: throw "total weight must not exceed 2^32"
```

4.29 billion free bonus entries is not a real promotion. A hard cap is one line,
verifiable by inspection, and impossible to get subtly wrong in a
reimplementation. A cap is a better spec than a wider primitive.

### 1.6 The 64-bit-safe variant, if it is ever needed

Specified for completeness. If adopted, weighted mode must use it
**unconditionally** — never "32-bit path when the total fits, 64-bit path
otherwise". That branch is itself a divergence hazard: two implementations
disagreeing about the threshold consume different byte counts from the same
roster and diverge from that point on.

```
nextUint64():                    # consumes exactly 8 bytes, big-endian
    b0..b7 = nextByte() x 8      # in that order
    return (b0<<56)|(b1<<48)|(b2<<40)|(b3<<32)|(b4<<24)|(b5<<16)|(b6<<8)|b7
                                 # as an unsigned 64-bit integer

nextIntWide(n):                  # n a non-negative integer of arbitrary width
    if n <= 1: return 0          # consumes ZERO bytes — same rule as nextInt
    limit = floor(2^64 / n) * n
    repeat:
        x = nextUint64()         # consumes 8 bytes EVERY iteration
    until x < limit
    return x mod n
```

Exact byte consumption: `8 * (1 + rejections)`. Rejection probability is
`(2^64 mod n) / 2^64 < n / 2^64`; below `2^-11` for any `n <= 2^53`, and below
`2^-24` for realistic totals (`n < 2^40`).

Reimplementer notes:
- In JavaScript this **requires `BigInt`**. `Number` is exact only to `2^53`, so
  a `nextUint64()` assembled from doubles loses the low bits and `x mod n` is
  wrong. `BigInt` division truncates toward zero, which equals `floor` for
  non-negative operands — that is what `floor` means above.
- `n = 2^64` gives `limit = 2^64` and never rejects; `n > 2^64` reintroduces the
  §1.5 hang, so cap there too.
- The `n <= 1` zero-byte short-circuit must be preserved, for the reason
  `PROTOCOL.md` §4 gives: it fires on the last pick of a full-permutation draw.

### 1.7 What must go into the commitment

Weighting changes the byte stream — `nextInt(total)` rejects against a different
limit than `nextInt(N)` — so **a weighted and an unweighted draw over the same
roster can produce different winners from identical seeds**. The Draw ID must
therefore cover the weights, or two receipts sharing a Draw ID replay
differently. Extend the preimage, in this order:

```
commit | mode | winnerCount | c[0]<US>...<US>c[N-1] | weightMode | w[0]<US>...<US>w[N-1] | decimal(total)
```

`weightMode` is one of the literal strings `none`, `ticket`, `person` (§2.4).
Weights are decimal, unsigned, no leading zeros, no thousands separators. When
`weightMode == none` the weight list is the empty string and `total` is
`decimal(N)`. `total` is appended **redundantly** so that one mistyped weight
fails loudly at the boundary instead of silently shifting every subsequent
boundary. Keep `<US>` (`0x1F`) as the intra-list separator and `|` as the field
separator per `PROTOCOL.md` §2 — do not invent a third separator.

---

## 2. K winners without replacement

### 2.1 Option A — repeated weighted draw with removal (RECOMMENDED)

```
drawK(rng, c, w, K, weightMode):
    alive   = [true] * N
    live_w  = copy of w
    winners = []
    for place = 1 .. K:
        i = pickWeighted(rng, alive, live_w)      # §1.2 — exactly one nextInt
        winners.append(c[i])
        if weightMode == "person":
            alive[i] = false                      # remove the entrant entirely
        else:                                     # "ticket"
            live_w[i] -= 1
            if live_w[i] == 0: alive[i] = false
    return winners
```

- **Stream cost: exactly `4K` bytes** plus 4 per rejection. Independent of N.
  That is the property that makes it scale (§4).
- **Work: O(K log N)** with a Fenwick tree over live weights, O(K·N) with a
  linear scan. Either is fine to 1M; both give the same answer, because §1.2
  specifies a function, not a structure.
- Under `weightMode = none` (all weights 1) this degenerates *exactly* to the
  existing `runWheel`: `pickWeighted` with unit weights over `n` live entries is
  `nextInt(n)` followed by "take the n-th live index", which is `runWheel`'s
  `pool[idx]` after splicing. Same reads, same order, same byte count. So the
  weighted path is a strict generalisation and existing receipts still verify.

### 2.2 Option B — A-Res / A-ExpJ weighted reservoir sampling: NOT SAFE

Efraimidis and Spirakis (2006) assign each item a key `k_i = u_i^(1/w_i)` with
`u_i` uniform on (0,1) and keep the K largest; A-ExpJ is the same distribution
computed with exponential jumps so that only O(K log(N/K)) random values are
drawn. The distribution is provably identical to successive weighted sampling
without replacement — i.e. identical to §2.1 — so the *only* reason to prefer it
is speed.

**It is not safe for byte-identical cross-language reproduction. Do not use it.**
Stated plainly, because this is the kind of algorithm that looks elegant enough
to talk someone into it:

1. `u^(1/w)`, `exp`, `log` and `pow` are **not correctly rounded** in any
   mainstream libm. IEEE 754-2019 *recommends* correctly-rounded transcendental
   functions but does not require them, and essentially no implementation
   complies. glibc, musl, MSVC's CRT, Apple's libm, Go's pure-Go math package
   and every JS engine differ in the last ulp on some inputs. ECMA-262 makes
   this explicit for JavaScript: the results of `Math.pow`, `Math.exp` and
   `Math.log` are **implementation-approximated**, and an engine is free to
   change them between versions. V8 has in fact changed `Math.pow` results
   across releases.
2. **A one-ulp difference is a different winner.** The algorithm's output is a
   *ranking of keys*. Two keys that are adjacent doubles swap order under a
   one-ulp difference, and the two entrants swap places in the standings. This
   is not a rounding artefact in a displayed number; it is a different person
   getting the prize. It would happen rarely — which means it would happen in
   production, to a real winner, months after every test passed.
3. **No exact reformulation exists.** Comparing `u_i^(1/w_i)` against
   `u_j^(1/w_j)` is equivalent to comparing `w_j·ln(u_i)` against `w_i·ln(u_j)`,
   which removes the exponentiation but keeps the logarithm. There is no
   rational or integer form of that comparison. A-ExpJ is worse: it needs
   `exp(...)` and a running float accumulator whose value depends on summation
   order.
4. **It consumes more stream, not less.** A-Res needs one uniform per *item*, so
   ≥4N bytes; §2.1 needs 4K. A-ExpJ reduces that to O(K log(N/K)) draws but
   spends them through float arithmetic, which is what disqualifies it.

**The integer-only alternative is §2.1**, and since the two produce the same
distribution, choosing it costs nothing but CPU time that the O(K) byte budget
already dwarfs.

### 2.3 Deterministic float caveat, for the record

Not all floating point is unsafe. IEEE 754 `+`, `-`, `*`, `/` and `sqrt` are
correctly rounded and therefore bit-reproducible across conforming platforms for
a fixed operation order. What is unsafe is (a) transcendentals, (b) any
reassociation the compiler is free to perform, (c) FMA contraction, and (d) x87
extended precision. Rather than write a policy that carves out (a)–(d)
correctly, the FairDraw rule should be the blunt one: **no floating point
anywhere in the decision path.** It is enforceable by grep.

### 2.4 The semantics that must be committed, not defaulted

`weightMode` distinguishes two defensible and *different* answers:

- **`ticket`** — remove the winning *ticket*, leave the entrant's other weight
  in. Correct for "every ticket has an equal chance"; a large holder can win
  twice.
- **`person`** — remove the entrant's whole weight on a win. Correct for "one
  prize per person/household", which is what most consumer sweepstakes rules
  actually say.
- **`none`** — every entrant weight 1; `ticket` and `person` coincide.

Two honest operators running identical numbers under different semantics produce
different winners, so a receipt that does not state which was used cannot be
replayed. Hence its presence in the Draw ID preimage (§1.7).

---

## 3. Full permutation, and the prefix property

### 3.1 The claim, stated precisely

**Claim.** For mode `wheel`, fix `serverSeed`, `clientSeed`, `nonce` and
`contestants`. Let `W(k)` be the winners list produced with `winnerCount = k`.
Then for all `1 <= j <= k <= N`:

```
W(j) == W(k)[0 : j]
```

In particular `W(k) == W(N)[0 : k]`: **every K-winner result is an exact prefix
of the full N-permutation.**

**Proof sketch, from the code.** `runWheel` reads the stream in exactly one
place: `idx = rng.nextInt(pool.length)` at the top of iteration `i`. The pool
starts as a copy of `contestants` and loses exactly one element per iteration,
so `pool.length` at iteration `i` is `N - i` — a function of `i` and `N` only.
It does not depend on `winnerCount`, which appears solely as the loop bound
`k = min(winnerCount, pool.length)`. Therefore the sequence of `nextInt`
arguments is `N, N-1, N-2, ...` regardless of `k`, the stream reads for the
first `j` iterations are identical for any `k >= j`, and the pool state entering
iteration `j` is identical. Induction on `i` completes it.

The same holds trivially for `rumble` and `rpg`, where the engine already
computes the whole `standings` array and slices it: `winners =
standings.slice(0, winnerCount)`, and `winnerCount` influences nothing upstream.

### 3.2 Verified against the actual engine

Run against `engine.js` (read-only), roster
`["Ada","Bo","Cass","Dex","Eve","Fay","Gus","Hal"]`, `serverSeed =
sha256Hex("fairdraw-protocol-test-vector")`, `clientSeed = "demo"`, `nonce = 0`:

```
winnerCount = 8 : ["Ada","Fay","Eve","Bo","Hal","Dex","Gus","Cass"]   28 bytes
winnerCount = 1 : prefix OK    4 bytes
winnerCount = 2 : prefix OK    8 bytes
winnerCount = 3 : prefix OK   12 bytes
winnerCount = 4 : prefix OK   16 bytes
winnerCount = 5 : prefix OK   20 bytes
winnerCount = 6 : prefix OK   24 bytes
winnerCount = 7 : prefix OK   28 bytes
winnerCount = 8 : prefix OK   28 bytes
```

`rumble` with `winnerCount = 3` likewise equals `standings[0:3]` of the
`winnerCount = 8` run, with identical `bytesUsed` (136) in both.

Note `k = 7` and `k = 8` both cost 28 bytes: the final pick faces a pool of one
and `nextInt(1)` consumes nothing (`PROTOCOL.md` §4, rule 1). So the full
permutation costs `4(N-1)` bytes, never `4N`.

### 3.3 Why this matters, and the one caveat

**It matters because publishing full standings is backward compatible at the
algorithm level.** An operator who announced 3 winners and is later asked "who
was 4th?" can publish the full ordering; the first three names are provably
unchanged, because they were produced by the same reads from the same stream.
There is no way to extend a draw into a ranking that flatters a different
outcome — the extension is forced. That converts alternates/runner-ups (a real
promo requirement when a winner does not claim) from a *new draw needing a new
commitment* into a *disclosure of information the original commitment already
determined*.

**The caveat, and it is the whole caveat:** `winnerCount` is inside the Draw ID
preimage (`PROTOCOL.md` §2), so `drawId(commit, mode, 3, roster)` and
`drawId(commit, mode, 8, roster)` are different hashes. The *winners* are
prefix-stable; the *receipt identifier* is not. In the run above, `k = 3` gives
`d45ec0577aef…` and `k = 8` gives `142b488fd370…`.

**Recommendation.** Decouple the two:

1. Make the algorithm **always run to a full permutation** — for `wheel`, loop
   `i = 0 .. N-2` unconditionally and return `standings` (the last entrant is
   forced, costing 0 bytes), with `winners = standings.slice(0, winnerCount)`.
   `wheel` then matches `rumble` and `rpg`, which already do this, and
   `bytesUsed` becomes a function of `N` alone: `4(N-1)` plus rejections.
2. **Keep `winnerCount` in the Draw ID.** It is a genuine commitment — "how many
   prizes" is exactly the kind of thing an operator must not decide after seeing
   the ordering. Prefix stability is what makes the *later* disclosure honest;
   it is not a reason to stop committing to the prize count.
3. Publish standings by default and label ranks beyond `winnerCount` explicitly
   as **alternates**, in order. Also commit the alternate-promotion rule in
   advance ("if a winner does not respond within 7 days, the next standing is
   promoted"), because otherwise "we went to the alternate" is a discretionary
   channel even though the ordering itself is fixed.

The one behavioural change in (1) is that `bytesUsed` for a partial `wheel` draw
rises from `4K` to `4(N-1)`. Winners do not change. That is a spec revision to
`PROTOCOL.md` §6 and test-vector V3, not a fairness change — but it *is* a
conformance break for any third-party verifier that matches `bytesUsed`, so it
needs a `version` bump in the receipt.

---

## 4. Scale: what actually breaks at 10k / 100k / 1M

All numbers below were measured against the real `engine.js` on this machine
(Node v24, Windows). They are not estimates unless marked as such.

### 4.1 Measured

| Operation | 1k | 10k | 100k |
| --- | --- | --- | --- |
| `drawId` (join + pure-JS SHA-256) | <1 ms | 1 ms | 10 ms |
| `wheel`, K=3 | <1 ms | 71 ms | **7 282 ms** |
| `wheel`, full permutation | 3 ms | 256 ms | **heap OOM (crash)** |
| `rumble`, K=1 | 9 ms | 102 ms | not attempted |
| `rpg`, K=1 | 27 ms @ 500 | 301 ms @ 2 000 | not attempted |

Three distinct failures, in order of severity.

### 4.2 Failure 1 — the duplicate check is O(N²) (dominates everything above 10k)

`run()` validates uniqueness with
`contestants.find((n, i) => contestants.indexOf(n) !== i)`. `indexOf` is a
linear scan inside a linear scan.

| N | current check | `new Set(c).size === c.length` |
| --- | --- | --- |
| 10 000 | 72 ms | 1 ms |
| 50 000 | 1 618 ms | 4 ms |
| 100 000 | **7 297 ms** | 9 ms |

That is the entire 7.3 s of the `wheel` K=3 row above — the draw itself reads 12
bytes. Quadratic growth puts 1M at roughly **12 minutes** (extrapolated), which
in a browser is an unrecoverable frozen tab, not a slow page. A `Set` fixes it
in one line and preserves the "first duplicate" error message if you scan once
and report the first key already present.

### 4.3 Failure 2 — `runWheel` events are O(N·K) memory, O(N²) for a full ranking

Every spin pushes `pool: pool.slice()` — a complete copy of the remaining pool.
For K picks that is `K` arrays of ~N elements; for a full permutation it is
`N(N+1)/2` element references. At N=100 000 the full permutation exhausted a
4 GB V8 heap and hard-crashed the process (`Ineffective mark-compacts near heap
limit`). At N=10 000 it survives at 256 ms but has already allocated ~50M
references.

This is the single change that matters most for the §3.3 recommendation
(always run the full permutation): making `wheel` always rank everyone makes the
snapshot cost quadratic instead of linear.

**Fix:** the snapshot is animation scaffolding, not evidence. Emit
`{ place, index, winner }` and let the renderer reconstruct the pool by
replaying the splices — it is fully determined by the indices. If a snapshot is
wanted for small rosters, gate it (`if (N <= 500)`), and record that gate in the
receipt `version` so a verifier is not surprised by a missing field. The
*evidence* is `index`; `pool` is redundant with it.

Note `rumble` does not have this problem — its snapshots are of the ring, capped
at 6 — which is why `rumble` at 10k runs in 102 ms while `wheel` at 100k dies.

### 4.4 Failure 3 — `rpg` is O(N²) per round

Each attack rebuilds `targets` by filtering all N indices, and there are O(N)
attacks per round, so a round costs O(N²) and a draw costs O(N² · rounds).
Measured: 27 ms at N=500, 301 ms at N=2 000 — a 4x roster for an 11x cost.
Extrapolating the quadratic puts N=10 000 at roughly 8 s and N=100 000 at
roughly 13 minutes. `rpg` also consumes the most stream by far (~134 bytes per
entrant at N=2 000, versus 20 for `rumble` and 4 for `wheel`).

`rpg` and `rumble` are *entertainment* modes. The right answer is a roster cap
(`rpg` above ~2 000, `rumble` above ~20 000, both enforced in the UI with an
explanation) rather than optimisation work — nobody watches a 100 000-fighter
battle royale, and the animation is the entire point of those modes.

### 4.5 RNG bytes consumed, by approach

The stream itself is never the bottleneck. One HMAC-SHA-256 yields 32 bytes;
the pure-JS implementation in `engine.js` runs at roughly 20 MB/s.

| Approach | Bytes consumed | At N=1M, K=10 |
| --- | --- | --- |
| `wheel` / weighted, K winners (shrinking pool) | `4K` (+4 per rejection) | 40 B |
| `wheel` full permutation / Fisher-Yates | `4(N-1)` | 4.0 MB (~125k HMACs, ~0.2 s) |
| Index-rejection, K distinct of N (§4.6) | `4 · sum_{j=0..K-1} N/(N-j)` expected | ~40 B |
| `rumble` | `4(N-1) + 12..16` per elimination ≈ `20N` | 20 MB |
| `rpg` | ~`134N` measured at N=2 000, grows with round count | 134 MB |

So the byte budget is irrelevant for the modes that matter and prohibitive only
for the two modes that should be capped anyway.

### 4.6 Is there an approach where verification is O(K) rather than O(N)?

**Yes — for unweighted draws, and it is exactly the numeric-range mechanic.**

The shrinking-pool algorithm forces O(N) work on a verifier because `nextInt` is
called against the *live pool size* and mapping "the j-th live element" back to
a roster index requires the whole pool (or an O(N)-build Fenwick tree). Replace
it with rejection on the *original* index space:

```
drawDistinct(rng, N, K):                # returns K distinct indices in [0, N)
    seen = empty set
    out  = []
    while len(out) < K:
        i = rng.nextInt(N)              # 4 bytes per attempt, ALWAYS bound N
        if i in seen: continue          # collision: the 4 bytes are spent, the draw is discarded
        seen.add(i); out.append(i)
    return out
```

- **Distributionally identical** to shrinking-pool selection: each accepted draw
  is uniform over the indices not yet taken.
- **Prefix-stable** in the §3 sense: the draws are sequential and `seen` only
  grows, so the first `j` of a K-draw are the first `j` of any larger draw.
- **Verification is O(K) in time and memory.** The verifier never materialises
  the roster. It replays `K` (plus collisions) four-byte reads, holds a
  `seen` set of size K, and checks the K winners against the commitment with
  O(log N) Merkle proofs each (§5). Total: `O(K log N)`, with **no N-sized
  allocation anywhere**. This is what makes a 1M-entrant draw verifiable on a
  phone.
- **Expected byte cost** `4 · sum_{j=0..K-1} N/(N-j)`; for `K << N` that is
  `≈ 4K(1 + K/2N)` — for K=10, N=1M the collision probability is about 1 in
  22 000. It degrades badly only as K approaches N (a full permutation this way
  costs `4N·H_N ≈ 4N ln N`), so it is the wrong algorithm for full standings.

**Rule to adopt:** the selection algorithm is determined by the *roster kind*,
which is already part of the commitment, so no new discretionary flag appears:

| Roster kind | Algorithm | Verifier cost |
| --- | --- | --- |
| `range:lo-hi` (no roster exists) | index-rejection over `hi-lo+1` | **O(K)** |
| `list`, full standings wanted | shrinking pool / Fisher-Yates | O(N) |
| `list`, K << N, Merkle-committed | index-rejection + inclusion proofs | **O(K log N)** |
| `list` + weights | §1.2 prefix sums | O(N) — see below |

**Weighted draws are inherently O(N)** for a verifier, because `total` must be
recomputed from every weight to get the rejection `limit` right. The escape
hatch is a **Merkle sum tree**: each internal node stores
`H(0x01 ‖ left ‖ right)` *and* `leftSum + rightSum`, so a weighted pick becomes
an O(log N) root-to-leaf descent comparing `r` against subtree sums, with an
O(log N) proof. It is a real construction and it works, but the without-
replacement update makes the proofs interdependent, and it is a much larger spec
than §1.2. **Do not build it until a customer actually has a weighted 1M-entrant
draw.** Free-bonus-entry campaigns are typically in the thousands, where the
O(N) verifier costs milliseconds.

---

## 5. Large-list commitment: a concrete Merkle tree

### 5.1 The problem it solves

Today the roster is committed by hashing `c[0] <US> c[1] <US> ... <US> c[N-1]`
into the Draw ID. That is correct and, at N=100 000, cheap (10 ms measured,
§4.1). What it is not is *checkable in pieces*: to confirm that the roster
behind a Draw ID contains you, you must obtain and hash all N names. At 1M
entrants that is a multi-megabyte download, and it forces the operator to
publish every entrant's handle or email for the commitment to mean anything.

A Merkle tree replaces "download everything" with "download 20 hashes".

### 5.2 Specification

Use **RFC 6962 (Certificate Transparency) tree hashing verbatim.** Do not invent
a variant. It is normative, widely implemented, has published test vectors, and
its two sharp edges — domain separation and odd nodes — are already resolved
correctly.

**Leaf encoding.** For entrant `i` (0-based, in committed roster order) with
UTF-8 name bytes `nm` and integer weight `w` (`1` when unweighted):

```
d_i = u32be(i) ‖ u32be(len(nm)) ‖ nm ‖ u32be(w)
```

Every variable-length field is length-prefixed, so no two distinct
`(i, name, weight)` triples produce the same `d_i`. Including `i` binds each
name to its roster position, which matters because position is what the draw
indexes (§4.6) — an inclusion proof then proves "I am entrant #417", not merely
"my name appears somewhere". `u32be` is a 4-byte unsigned big-endian integer,
matching the engine's existing big-endian convention (`PROTOCOL.md` §4).

**Tree hash (RFC 6962 §2.1), with `D[n] = {d_0 … d_{n-1}}`:**

```
MTH({})     = SHA256("")                                 # hash of the empty string
MTH({d_0})  = SHA256(0x00 ‖ d_0)                         # LEAF domain
MTH(D[n])   = SHA256(0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n]))   # INTERNAL domain
              where k is the largest power of two strictly less than n
```

`root = MTH(D[N])`, rendered as 64 lowercase hex characters like every other
hash in this protocol.

**Odd-node handling.** The recursive split above *is* the odd-node rule: the
left subtree always holds a power-of-two number of leaves, and a lone right-hand
leaf is carried up unchanged rather than paired with a copy of itself. **Never
duplicate the last node to pad a level** — that is the Bitcoin construction, and
it is the source of CVE-2012-2459: because the final hash is duplicated,
transaction list `[A, B, C, C]` yields the same Merkle root as `[A, B, C]`, so
two distinct lists are indistinguishable by root. In FairDraw's terms, an
operator using duplicate-padding could publish one roster and later claim a
*different* roster — the same list with the last entrant duplicated — matched
the identical commitment.

**Domain separation, and the attack it prevents.** Without the `0x00` / `0x01`
prefixes, every internal node is `SHA256(left ‖ right)` — the hash of a 64-byte
string. But a leaf is also just "the hash of some bytes". So an attacker can
take any internal node and present its two children *as though they were a
single leaf's data*, yielding a **second preimage for the tree**: a different,
shallower entrant list that hashes to the identical root. With the prefixes, the
leaf domain and the internal domain are disjoint — no internal-node hash can
ever be produced by the leaf rule — so finding a second preimage for the tree
reduces to finding one for SHA-256. RFC 6962 §2.1 introduces exactly these
prefixes for exactly this reason.

**Inclusion proof.** The standard sibling path, ordered leaf-to-root, each step
tagged with the side the sibling sits on:

```
verifyInclusion(d_i, path[], root):
    h = SHA256(0x00 ‖ d_i)
    for (sibling, side) in path:                   # leaf -> root
        h = SHA256(0x01 ‖ sibling ‖ h) if side == LEFT
            else SHA256(0x01 ‖ h ‖ sibling)
    return h == root
```

Path length is `ceil(log2(N))`: **20 hashes = 640 bytes at N = 1 000 000.**
That is the entrant-facing benefit — an entrant on a phone, holding only the
published root and 640 bytes, can prove to themselves that they were in the
roster the operator committed to before the draw, without downloading a million
names and without the operator having to publish them.

### 5.3 When it is NOT needed — and the UI should say so

The Merkle root is a *scalability* tool. It is not a trust upgrade, and
presenting it as one would be dishonest.

- **Numeric-range rosters ("1 to 5000"): never use it.** There is no roster to
  commit. The commitment is the literal string `range:1-5000` plus K and the
  unsold-number policy — something a person can read aloud and check against
  their own ticket stub. Hashing a 5 000-element expansion into a tree replaces
  a human-readable commitment with an opaque one and gains nothing.
- **Small rosters (say N ≤ 1 000, roughly 20 KB of names): don't use it.**
  Publishing the full list is *strictly better evidence* than a root. Everyone
  can read it, count it, notice entrants who do not exist, and confirm their own
  presence with their eyes. A root hides all of that behind a proof ceremony
  nobody will perform.
- **The honest limit, at every size: a Merkle root proves inclusion, never
  completeness.** An operator can pad the tree with 10 000 phantom entrants and
  every real entrant's proof still verifies. Roster stuffing and roster omission
  are both invisible to the tree. Publish the **leaf count `N` alongside the
  root** at minimum, and keep full-list publication as the default — the Merkle
  variant is for cases where publishing 1M handles is a privacy or bandwidth
  problem, not a general upgrade.

**Recommended rule.** `N <= 1000`: publish the list. `N > 1000`: publish
`merkleRoot` + `N` + a per-entrant proof lookup, and also offer the full list
where privacy allows. Put the literal roster kind (`list` / `range` / `merkle`)
into the Draw ID preimage, and for kind `merkle` substitute
`merkleRoot ‖ "|" ‖ decimal(N)` for the joined roster — so the two encodings can
never be confused for one another.

---

## 6. Public randomness beacons

### 6.1 What a beacon fixes, and what it doesn't

The client seed exists so the operator cannot pick the outcome alone. But if the
operator also supplies the client seed — or accepts one from a friendly
"audience member" — that protection is theatre. A public beacon replaces the
client seed with a value that (a) nobody can predict before a known instant, (b)
nobody can choose, and (c) everybody can look up afterwards from an independent
source. It does **not** fix the nonce-grinding gap on its own; see §7.

### 6.2 drand / League of Entropy — RECOMMENDED

drand is a threshold BLS beacon operated by the League of Entropy, a set of
independent organisations; no single member can produce or predict a beacon.
The relevant network is **quicknet**, verified live while writing this:

```
chain hash   52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971
period       3 seconds
genesis_time 1692803367   (Unix seconds)
schemeID     bls-unchained-g1-rfc9380
public_key   83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c
             8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb
             5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a
             (96 bytes, compressed G2)
```

**Endpoints** (three independent relays; also mirrored by Cloudflare and
Storswift — fetch from at least two and require identical bytes):

```
https://api.drand.sh/<chainhash>/info
https://api.drand.sh/<chainhash>/public/latest
https://api.drand.sh/<chainhash>/public/<round>
https://api2.drand.sh/...      https://api3.drand.sh/...
```

v2 paths exist alongside these:
`/v2/beacons/{beaconID}/info`, `/v2/beacons/{beaconID}/rounds/{round}`,
`/v2/beacons/{beaconID}/rounds/latest`, with `beaconID = quicknet`.

**Response shape**, confirmed by a live fetch of round 1 000 000:

```json
{"round":1000000,
 "randomness":"b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3",
 "signature":"83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72"}
```

`signature` is 48 bytes (compressed G1). `randomness` is simply
`SHA256(signature)` — a verifier must recompute it rather than trust the field.
quicknet is **unchained**, so there is no `previous_signature`: round `R` depends
on nothing but `R`, which is precisely what makes a future round nameable.

**Naming a FUTURE round.** Rounds are on a fixed clock, so the round covering
any future instant is arithmetic, not a lookup:

```
round(t) = floor((t - 1692803367) / 3) + 1          # t = Unix seconds
t(round) = 1692803367 + (round - 1) * 3             # inverse
```

Commitment procedure:

```
1. Choose the announced draw time T (Unix seconds), at least ~1 hour out.
2. R = floor((T - 1692803367) / 3) + 1
3. Publish, BEFORE t(R):
     commit    = sha256Hex(serverSeed)
     entropy   = "drand:quicknet:52db9b...e971:" + decimal(R)
     drawId    = H(commit | mode | winnerCount | roster... | entropy | nonce)
4. At or after t(R): fetch round R from >=2 relays, recompute
   SHA256(signature) and confirm it equals `randomness`.
5. clientSeed = "drand:52db9b...e971:" + decimal(R) + ":" + randomness_hex
6. Run the draw. Publish serverSeed, the beacon signature, and the receipt.
```

Step 3 is the load-bearing one: the round number must be published while its
value is still unknowable to everyone including the League of Entropy.

**How a verifier checks the signature** (scheme `bls-unchained-g1-rfc9380`):

```
M   = SHA256( u64be(round) )                      # 32 bytes, big-endian round
Q   = hash_to_curve_G1(M)                         # RFC 9380, suite
                                                  # BLS12381G1_XMD:SHA-256_SSWU_RO_
                                                  # DST "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"
ok  = pairing(sig_G1, G2_generator) == pairing(Q, pubkey_G2)
randomness == SHA256(sig)
```

**The honest cost:** that check needs a BLS12-381 pairing, which `engine.js`
cannot supply — it is deliberately dependency-free and hand-rolls only SHA-256.
So keep the layering explicit:

- The **core replay** (commit opens, Draw ID matches, winners reproduce) stays
  dependency-free and is what `verify.js` does today.
- The **beacon check** is a separate, optional step, documented with a
  copy-pasteable snippet (`@noble/curves/bls12-381` in JS, `blst` elsewhere, or
  the `drand` CLI). Publish `round` and `signature` in the receipt so it is
  *possible*; do not pretend the built-in verifier performs it.
- The cheap middle ground everyone will actually use: refetch round `R` from two
  or three independent relays and confirm the bytes match the receipt.

### 6.3 Future Bitcoin block hash

Long-standing folk method: "the winner is decided by the hash of Bitcoin block
850 000". Real properties:

- **Grindable, but expensively.** A miner who finds a block can discard it if
  the hash is unfavourable, forfeiting the block subsidy plus fees. That is a
  six-figure cost per attempt — vastly more than any giveaway prize — so it is
  economically fine for this use case. Note the *asymmetry*: the party with the
  incentive to grind (the operator) is almost never a miner.
- **Latency and variance are the actual problem.** Block intervals are
  exponentially distributed with a 10-minute mean, so "the block at 3pm" can
  arrive at 3:02 or 3:40. And you must wait for confirmations (≈1 hour) against
  reorgs, so a live-streamed draw stalls.
- **Name a height, never a time.** "Block at height H" is unambiguous; "the
  first block after 3pm" depends on whose clock and which chain tip, and is
  reorg-sensitive.
- Verification is genuinely easy (any explorer, or an SPX/SPV header check),
  which is its main advantage over drand for a lay audience.

**Verdict:** acceptable, and culturally legible, but strictly worse than drand
on latency, variance and operational complexity. Solana block hashes are
*worse* still: 400 ms slots make the timing pleasant, but the slot leader can
selectively skip, the `SlotHashes` sysvar retains only a few hundred recent
slots so historical lookup needs an archive RPC, and Solana's own documentation
warns against using blockhashes as randomness.

### 6.4 On-chain VRF

| Option | Chain | Cost / request | Latency | Complexity |
| --- | --- | --- | --- | --- |
| Chainlink VRF v2.5 | EVM (**not Solana** — verify current availability before designing around it) | gas + LINK premium; dollars, not cents | 3+ block confirmations (~1 min) | Deploy a consumer contract, fund a subscription, handle the callback |
| Switchboard (On-Demand) | Solana | ~0.002 SOL, per Switchboard's own fee-reduction announcement | sub-second to a few slots | On-chain program integration, oracle queue accounts |
| ORAO VRF | Solana | 0.001 SOL base fee plus request-account rent | advertised sub-second | Solana program + request account lifecycle |

All three deliver a *cryptographically* verifiable random value, which is
strictly stronger than "trust three relays". All three also require a wallet,
funded gas, an on-chain program, and a chain dependency — for a giveaway tool
whose entire pitch is "one HTML file, no backend", that is a large architectural
tax to buy a property drand already provides for free over HTTP.

**Recommendation: drand quicknet.** No wallet, no chain, no cost, 3-second
granularity, one HTTP GET, an independently operated threshold beacon, and a
future round nameable by arithmetic. Revisit VRF only if FairDraw grows an
on-chain deployment for other reasons.

---

## 7. The nonce-grinding gap

### 7.1 The attack, stated exactly

`PROTOCOL.md` §2 already names the hole, in one line: "the client seed and the
nonce are **not** covered by the Draw ID." Spelled out as an attack:

```
1. Operator generates serverSeed, publishes commit = sha256Hex(serverSeed)
   and drawId = H(commit | mode | winnerCount | roster).
2. Client seed is fixed (by the operator, or by an accomplice, or honestly).
3. Operator runs, privately:
       run(nonce = 0), run(nonce = 1), run(nonce = 2), ...
   inspecting the winners each time.
4. Operator publishes the receipt for whichever nonce they liked.
```

Every check in `verifyReceipt` passes. The commitment opens. The Draw ID matches
— it does not mention the nonce. The replay reproduces the winners. The receipt
is *valid* and the draw is *rigged*.

**And it is free.** Expected attempts to seat a specific favourite in first place
is about `N`; to seat any one of `k` friends, about `N/k`. Each attempt is a few
microseconds for `wheel` (`bytesUsed = 4`). A 100-entrant draw is fully ground in
well under a second. This is not a theoretical weakness that requires a
motivated adversary with a GPU farm — it is a hole a mildly dishonest operator
falls into by accident, by "re-running because the first one looked weird".

The same argument applies verbatim to the **client seed** whenever the operator
chooses it, and to *any* uncommitted input. The nonce is just the cheapest knob.

### 7.2 Standard mitigations, and what each actually buys

| Mitigation | Origin | What it fixes | What it leaves open |
| --- | --- | --- | --- |
| Player-supplied client seed + monotonic public nonce counter | Standard crypto-casino practice (Stake, BC.Game et al.): the player sets the client seed, the nonce increments once per bet and is displayed, seed rotation reveals the old server seed | Operator must commit before learning the client seed; a gapless public nonce ledger makes a skipped bet visible | Assumes a *session* with many bets. A giveaway is one event; there is no natural gapless ledger |
| Nonce inside the Draw ID | prior FairDraw research | A receipt whose nonce differs from the pre-published Draw ID fails | Operator can pre-publish *many* Draw IDs, one per nonce, and announce only the favourable one |
| Committed draw plan (fixed list of Draw IDs, all of which must resolve) | Certificate-Transparency-style "everything you committed must appear" | Closes the multi-commitment hole above; abandoned draws become visible | Purely procedural. Binds only an operator someone is actually watching |
| External timestamping of the Draw ID (OpenTimestamps → Bitcoin, or any public dated post) | — | Proves the Draw ID existed before the entropy did | Nothing, once combined with the row below — but it is evidence, not prevention |
| **Entropy the operator cannot know at commit time** (future drand round, §6) | drand / League of Entropy | **Removes the free parameter entirely** | Requires the round number to be published before the round is produced |
| Live audience-supplied seed on stream | traditional | Same as above, socially | Not automatable; no receipt-level artefact |

### 7.3 Evaluating the prior recommendation (nonce in `drawId` + committed plan)

**Correct, necessary, and not sufficient.** Both halves are worth shipping:

- Putting the nonce in the Draw ID costs one field in a hash preimage and
  converts "the operator may pick a nonce after the fact" into "the operator must
  pick a nonce in advance". That is a real, large improvement.
- The committed draw plan closes the obvious follow-up (pre-publish 500 Draw IDs,
  announce one) and is genuinely the right shape for the recurring-draw case from
  `01-promo-taxonomy.md` §2.11 — one commitment, many scheduled draws.

But both are **procedural**: they bind an operator whose earlier publications
someone kept. A verifier handed only a receipt, weeks later, cannot tell whether
the Draw ID was published before or after the outcome was known. The gap closes
*cryptographically* only when one of the draw's inputs is a value that did not
exist at commit time.

### 7.4 Recommendation

Layered, in priority order.

**(1) Extend the Draw ID preimage to cover every input** — this is the one-line
change that matters most:

```
drawId = sha256Hex(
    commit | mode | winnerCount | rosterKind | rosterCommitment |
    weightMode | weights | total | entropySpec | decimal(nonce)
)
```

with `entropySpec` a literal descriptor string, one of:

```
"drand:quicknet:52db9b…e971:<round>"      # RECOMMENDED
"btc:height:<H>"
"manual:<sha256Hex of the client seed>"   # commits to the client seed without revealing it
```

For a one-shot draw, pin `nonce = 0`. The nonce then exists only to support the
recurring case, where it is the index within a committed plan.

**(2) Default the entropy to a future drand round** (§6.2). This is the actual
fix. With `serverSeed` committed, `clientSeed` determined by a beacon that does
not yet exist, and `nonce` pinned inside the Draw ID, the operator has **zero**
degrees of freedom at draw time. Grinding requires inverting SHA-256 or forging
a threshold BLS signature. Everything else in this section is defence in depth.

**(3) Commit the plan for recurring draws.** Publish, at plan time:

```
planHash = sha256Hex( decimal(M) | drawId_1 | drawId_2 | ... | drawId_M )
```

with `M` the exact number of scheduled draws, and state the rule: **every Draw
ID in the plan must eventually have a published receipt.** A missing one is
prima facie evidence of an abandoned (ground) draw. Include `planHash` and the
draw's index within the plan in every receipt.

**(4) Timestamp the Draw ID externally.** OpenTimestamps is free and anchors to
Bitcoin; a dated public post is weaker but far better than nothing. This is what
lets a verifier weeks later confirm the ordering of events.

**(5) Make the verifier say what it cannot check.** `verifyReceipt` should
report a fourth line beside its three existing checks — something like:

```
Entropy source : drand quicknet round 12,345,678 (produced 2026-08-16 14:03:21Z)
                 Draw ID published: NOT CHECKABLE FROM THIS RECEIPT.
                 Confirm independently that the Draw ID above appeared before
                 that round was produced.
```

and downgrade the verdict to a visible warning when `entropySpec` starts with
`manual:`. The current three checks are excellent at what they do; the failure
mode to avoid is a green tick that a reader mistakes for a guarantee the
protocol does not make. `PROTOCOL.md` §10 already says this in prose ("whether
other nonces were drawn and discarded … is procedural"); it should be in the
verifier's output, not only in the spec.

---

## 8. Consolidated recommendations

Ordered by value per unit of engine work.

1. **Put `nonce` and an `entropySpec` in the Draw ID preimage** (§7.4). One-line
   change, closes the largest hole in the current design.
2. **Default `clientSeed` to a future drand quicknet round**, named in the
   commitment (§6.2). Free, no dependencies at draw time, converts the fix in
   (1) from procedural to cryptographic.
3. **Replace the O(N²) duplicate check with a `Set`** (§4.2). 7.3 s → 9 ms at
   N=100 000; currently the dominant cost of every large draw.
4. **Stop snapshotting the pool in `wheel` events** (§4.3). Currently O(N²)
   memory for a full ranking; it hard-crashed a 4 GB Node heap at N=100 000.
5. **Weighted selection = cumulative sums + `nextInt(total)`** (§1.2), integer
   weights only, `total <= 2^32` validated (§1.5), `weightMode` in the
   commitment (§2.4).
6. **`wheel` always runs the full permutation and returns `standings`** (§3.3);
   `winnerCount` stays in the Draw ID and becomes a slice of the standings.
   Requires a receipt `version` bump because `bytesUsed` changes.
7. **Make numeric ranges a first-class roster kind** (§1.4, §4.6). Best
   privacy, best commitment, O(K) verification, and it obsoletes the weight
   mechanic for the ticket-raffle case.
8. **Merkle roster commitment above N = 1 000** (§5), RFC 6962 verbatim, with
   the leaf count published alongside the root and an explicit statement that
   inclusion is not completeness.
9. **Committed draw plan for recurring draws** (§7.4 step 3).
10. **Never adopt A-Res/A-ExpJ, the alias method, or any floating point in the
    decision path** (§1.3, §2.2, §2.3).

---

## 9. Sources

- IETF RFC 6962, *Certificate Transparency*, §2.1 (Merkle tree definition, the
  `0x00`/`0x01` leaf/internal domain-separation prefixes, and the odd-node
  split rule). <https://www.rfc-editor.org/rfc/rfc6962>
- IETF RFC 9380, *Hashing to Elliptic Curves* (the `BLS12381G1_XMD:SHA-256_SSWU_RO_`
  suite drand quicknet signs under). <https://www.rfc-editor.org/rfc/rfc9380>
- IETF RFC 2104, *HMAC* — the construction `engine.js` implements.
- CVE-2012-2459 — Bitcoin Merkle-root ambiguity caused by duplicating the last
  node when a level has an odd number of entries; the reason not to pad that
  way.
- P. Efraimidis and P. Spirakis, "Weighted random sampling with a reservoir,"
  *Information Processing Letters* 97(5), 2006 — A-Res, and A-ExpJ in the
  extended version. The `u^(1/w)` key is exactly the part that cannot be made
  reproducible.
- ECMA-262, *ECMAScript Language Specification*, `Math.pow` / `Math.exp` /
  `Math.log` — results are **implementation-approximated**; the spec explicitly
  permits engines to differ.
- IEEE 754-2019 — correctly-rounded basic operations (`+ - * / sqrt`);
  transcendental functions are *recommended*, not required, to be correctly
  rounded.
- A. J. Walker (1977) and M. D. Vose (1991) — the alias method and its
  linear-time construction.
- drand documentation and live endpoints:
  <https://docs.drand.love/developer/API-v2/drand-http-api/>,
  <https://docs.drand.love/blog/2023/10/16/quicknet-is-live/>. Chain info and
  round 1 000 000 fetched live from `https://api.drand.sh` while writing this.
- Switchboard, "Verifiable Randomness on Solana" (fee reduction to just under
  0.002 SOL per VRF request).
  <https://medium.com/@switchboardxyz/verifiable-randomness-on-solana-46f72a46d9cf>
- ORAO Network Solana VRF (0.001 SOL base fee, sub-second fulfilment).
  <https://orao.network/solana-vrf>, <https://github.com/orao-network/solana-vrf>
- Adevar Labs, "On-Chain Randomness on Solana: Predictability, Manipulation &
  Safer Alternatives" — why Solana blockhashes are unsuitable as randomness.
  <https://www.adevarlabs.com/blog/on-chain-randomness-on-solana-predictability-manipulation-safer-alternatives-part-1>
- Chainlink, "Provably Fair Randomness: A Technical Guide."
  <https://chain.link/article/provably-fair-randomness>
- Crypto-casino commit-reveal practice (player-set client seed, displayed
  monotonic nonce, seed-rotation reveal) as summarised in
  <https://coinstats.app/crypto-gambling-guide/provably-fair-explained/> and
  <https://www.provably.com/>.
- Measurements in §4 were taken against this repository's `engine.js` under
  Node v24 on the development machine; the crash in §4.3 is reproducible.

*(End of document.)*
