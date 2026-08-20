# FairDraw protocol specification

> **Two formats exist.** This document describes `fairdraw-1`. Receipts
> carrying `"version": "fairdraw-2"` add ranked alternates, ticket entries,
> compact range rosters and a declared draw budget — see **Format 2** at the
> end of this file. Dispatch on the receipt's `version` field.

Byte-level specification of the FairDraw commit-reveal scheme and its three
draw games, written for someone reimplementing the verifier in another
language. Everything here was read out of `engine.js` and confirmed by running
it; the test vectors in the last section are computed, not illustrative.

An implementation conforming to this document reproduces `engine.js` exactly —
same winners, same standings, same flavour text, same byte consumption count —
for every input.

`engine.js` is the normative artefact. Where this document and the code
disagree, the code wins and this document is wrong; please report it.

---

## 1. Notation and encoding

- All hashing is over **UTF-8 bytes of ASCII strings**. Every string this
  protocol hashes is ASCII in practice except contestant names, which may be
  arbitrary Unicode and must be encoded as UTF-8.
- `utf8(s)` means the UTF-8 encoding of `s`. `engine.js` applies JavaScript's
  `String()` coercion first, so a numeric `nonce` of `0` becomes the two bytes
  of `"0"` — not a zero byte.
- Hashes are rendered as **64 lowercase hex characters**, `0-9a-f`.
- `SHA256(x)` is FIPS 180-4 SHA-256 over the byte string `x`, returning 32
  bytes. `sha256Hex(s)` = hex of `SHA256(utf8(s))`.
- `HMAC(k, m)` is RFC 2104 HMAC-SHA-256, block size 64.
- `‖` denotes byte concatenation.
- `<US>` denotes the single byte `0x1F` (Unicode `U+001F`, UNIT SEPARATOR).

### The server seed is a string, not bytes

This is the detail implementations get wrong most often.

The server seed is 64 lowercase hex characters, validated against
`/^[0-9a-f]{64}$/`. It is **never decoded to its 32 raw bytes**. It is used:

- as the input to the commitment, as a 64-character string; and
- as the HMAC key, as those same **64 ASCII bytes** — not the 32 bytes it
  encodes.

Because the key is exactly 64 bytes it equals the HMAC block size, so it is
neither hashed down (the `len > 64` branch is not taken) nor zero-padded. In
most HMAC libraries you get this for free by passing the seed as a string with
UTF-8/ASCII encoding.

A direct consequence: the commitment is reproducible with nothing but a shell.

```bash
printf %s "<serverSeed>" | sha256sum
```

If your implementation hex-decodes the seed anywhere, it will produce a
different commit and a completely different byte stream.

---

## 2. The commitment and the Draw ID

### Commit

```
commit = sha256Hex(serverSeed)
```

Published before the client seed is chosen. Opening it later is what binds the
operator.

### Draw ID

The Draw ID fingerprints everything that was fixed at commitment time. In
`engine.js`:

```js
function drawId (commit, mode, winnerCount, contestants) {
  return sha256Hex([commit, mode, winnerCount, contestants.join('')].join('|'))
}
```

Written out, the preimage is:

```
commit ‖ "|" ‖ mode ‖ "|" ‖ decimal(winnerCount) ‖ "|" ‖ c[0] ‖ <US> ‖ c[1] ‖ <US> ‖ ... ‖ c[N-1]
drawId = sha256Hex(that)
```

Exactly two separator characters are in play, and they are different:

| Separator | Byte | Where |
| --- | --- | --- |
| `\|` (VERTICAL LINE) | `0x7C` | Between the four top-level fields. |
| `<US>` (UNIT SEPARATOR) | `0x1F` | Between contestant names, and nowhere else. |

The `0x1F` appears as a **literal control byte inside the string literal** in
`engine.js`, not as an escape sequence. Many editors, terminals and file
viewers render it as nothing at all, so the source line looks like
`contestants.join('')` — an empty separator. It is not empty. Confirm it in
your own checkout with a hex dump before you write any code:

```bash
sed -n '361p' engine.js | od -c
```

You should see `j o i n ( ' 037 ' )`. If you implement it as an empty join,
rosters like `["AB","C"]` and `["A","BC"]` would collide, and none of the test
vectors in section 10 will reproduce.

Other encoding notes:

- `winnerCount` is joined by JavaScript's `Array.prototype.join`, which
  stringifies the number with standard decimal formatting: `1` → `"1"`.
  Pass an integer.
- The name list is joined but **not** terminated — there is no trailing `<US>`.
- A single contestant produces no `<US>` at all.
- Contestant order is significant.
- Note what is *absent*: the client seed and the nonce are **not** covered by
  the Draw ID. It pins the commit, the game, the winner count and the roster,
  and nothing else.

---

## 3. The byte stream

All randomness comes from one conceptually infinite byte stream:

```
block_i = HMAC( key = utf8(serverSeed),
                msg = utf8(clientSeed ‖ ":" ‖ decimal(nonce) ‖ ":" ‖ decimal(i)) )

stream  = block_0 ‖ block_1 ‖ block_2 ‖ ...
```

Each block is 32 bytes. Blocks are produced on demand, in order, starting at
`i = 0`, and consumed left to right. There is no rekeying, no counter beyond
`i`, and no state carried between blocks — `block_i` depends only on the seeds,
the nonce and `i`, so any position in the stream is directly addressable.

The message separator is ASCII colon `":"` (`0x3A`), plain, in both positions.

### Parameter handling

| Parameter | Handling in `engine.js` | Requirement for reimplementation |
| --- | --- | --- |
| `serverSeed` | `utf8(serverSeed)` used as the HMAC key. | Must match `^[0-9a-f]{64}$`; `run` throws otherwise. |
| `clientSeed` | `String(clientSeed)`. | Arbitrary string, including empty. Encode as UTF-8. |
| `nonce` | `Number(nonce) \| 0` — JavaScript `ToInt32`. | A **signed 32-bit integer**. It is stringified with a leading `-` when negative, and values outside the int32 range wrap. Reject or replicate `ToInt32` explicitly; do not use a bignum. |

Reader state, mirroring the `FairRng` constructor: `blockIndex = -1`,
`block = null`, `pos = 32`, `bytesUsed = 0`. Because `pos` starts at 32, the
first byte read triggers generation of block 0.

---

## 4. Primitives

These are the only ways the stream is ever consumed. Order of calls is what
makes two implementations agree, so the mode traces in sections 6 to 8 are as
normative as this section.

### `nextByte() -> u8`

```
if pos >= 32:
    blockIndex += 1
    block = HMAC(key, utf8(clientSeed + ":" + nonce + ":" + blockIndex))
    pos = 0
bytesUsed += 1
return block[pos++]
```

Consumes 1 byte. Blocks are never partially skipped: a request that crosses a
block boundary simply continues into the next block. There is no alignment
requirement, and no padding is discarded.

### `nextUint32() -> u32`

Four `nextByte()` calls, assembled **big-endian**:

```
a = nextByte(); b = nextByte(); c = nextByte(); d = nextByte()
return (a << 24 | b << 16 | c << 8 | d) as unsigned 32-bit
```

Consumes 4 bytes. May straddle a block boundary.

### `nextInt(n) -> integer in [0, n)`

Unbiased by rejection sampling.

```
if n <= 1:
    return 0                      # consumes ZERO bytes
limit = floor(2^32 / n) * n
repeat:
    x = nextUint32()              # consumes 4 bytes EVERY iteration
until x < limit
return x mod n
```

Three rules that implementations trip over:

1. **`n <= 1` short-circuits and reads nothing.** This is not a micro-
   optimisation you may skip — it is observable. It fires in real draws: on the
   final wheel pick when one name is left, on the rumble's second-combatant
   draw when the ring holds exactly two, and on every RPG attack where only one
   opponent remains. Skip the guard and your stream desynchronises from that
   point on. In the rumble vector in section 10 this is the difference between
   56 bytes and 60.
2. **Rejected samples still consume their 4 bytes.** They are discarded values,
   not un-read bytes.
3. **`limit` is computed from `2^32`, not `2^32 - 1`.** When `n` is a power of
   two, `limit = 2^32` exactly, `x >= limit` is never true, and rejection can
   never occur.

Rejection probability for the values of `n` this protocol actually uses:

| `n` | Used for | `limit` | Rejected values |
| --- | --- | --- | --- |
| 2 | rumble coin flip | 4294967296 | 0 (never rejects) |
| 10 | `VERBS` lookup | 4294967290 | 6 |
| 12 | `FINISHERS` lookup | 4294967292 | 4 |
| 13 | RPG base damage | 4294967287 | 9 |
| 100 | RPG miss / crit rolls | 4294967200 | 96 |
| `N`, ring and pool sizes | selections | `floor(2^32/N)*N` | `2^32 mod N` |

Rejection is rare (worst case here is about 1 in 45 million) but a conforming
implementation must handle it, or it will disagree with `engine.js` on
approximately one draw in a few hundred thousand — the worst possible failure
mode, since it will pass every test you write by hand.

### `shuffle(arr) -> arr`

Fisher-Yates, in place, descending:

```
for i = len(arr) - 1 down to 1:      # inclusive, stops at 1, never runs for i = 0
    j = nextInt(i + 1)
    swap arr[i], arr[j]
return arr
```

`len - 1` calls to `nextInt`, with arguments `len, len-1, ..., 2` in that
order. Since every argument is at least 2, none of them hits the zero-byte
path; a shuffle of length `L` consumes exactly `4(L-1)` bytes plus rejections.
Note `j` may equal `i`, producing a no-op swap that still consumed its bytes.

### `pick(arr)`

Defined as `arr[nextInt(arr.length)]`. Exported but **not used by any of the
three modes** — they index the tables explicitly. Listed only so you do not go
looking for it in the traces.

---

## 5. Flavour tables

The flavour text is drawn from the same stream as the outcome. This is
deliberate: it makes the commentary part of the verifiable record. It also
means **an implementation that skips the lookups to save effort will diverge**
on the very next decision, and produce wrong winners.

`FINISHERS`, 12 entries, indexed by `nextInt(12)`:

| # | Text |
| --- | --- |
| 0 | `a top-rope splash` |
| 1 | `a spinning powerbomb` |
| 2 | `a steel-chair haymaker` |
| 3 | `a running clothesline` |
| 4 | `a flying dropkick` |
| 5 | `a suplex over the top rope` |
| 6 | `a corner spear` |
| 7 | `a diving elbow drop` |
| 8 | `a pop-up cutter` |
| 9 | `a gorilla press toss` |
| 10 | `a moonsault from the turnbuckle` |
| 11 | `a backbreaker` |

`VERBS`, 10 entries, indexed by `nextInt(10)`:

| # | Text |
| --- | --- |
| 0 | `slashes` |
| 1 | `blasts` |
| 2 | `smashes` |
| 3 | `skewers` |
| 4 | `hexes` |
| 5 | `pummels` |
| 6 | `cleaves` |
| 7 | `zaps` |
| 8 | `clobbers` |
| 9 | `shivs` |

---

## 6. Mode `wheel`

### Entry conditions

`run()` validates and normalises before any mode function is entered:

```
if mode not in {wheel, rumble, rpg}:            throw "unknown mode: <mode>"
if contestants is not an array or len < 2:      throw "need at least 2 contestants"
if serverSeed !~ /^[0-9a-f]{64}$/:              throw "server seed must be 64 lowercase hex chars"
winnerCount = max(1, min(winnerCount or 1, N))
```

The `winnerCount or 1` is JavaScript truthiness: `0`, `undefined`, `NaN` and
`null` all become `1`. The clamp applies to all three modes.

### Algorithm

```
pool    = copy of contestants
winners = []
k       = min(winnerCount, len(pool))

for i = 0 .. k-1:
    idx  = nextInt(len(pool))          # the only stream read
    name = pool[idx]
    emit spin{ place: i+1, pool: snapshot of pool, index: idx, winner: name }
    winners.append(name)
    remove pool[idx]                    # shifts the tail left, preserving order
```

Result: `{ winners, events }`. No `standings` field.

### Consumption order

One `nextInt(len(pool))` per pick, nothing else. Pool sizes descend
`N, N-1, N-2, ...`. No flavour lookups.

Byte cost: `4` per pick, except a pick made when only one name remains, which
costs `0` via the `n <= 1` rule. So drawing all `N` winners from a roster of
`N` costs `4(N-1)` bytes, not `4N`.

---

## 7. Mode `rumble`

### Setup

```
order = shuffle(copy of contestants)              # N-1 nextInt calls
cap   = min(6, max(3, ceil(N / 2)))
ring, eliminated, events = [], [], []
```

`ceil` on an exact integer division returns that integer (`N=8` → `4`). The cap
is clamped into `[3, 6]`, so:

| `N` | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cap` | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 6 | 6 |

With `N = 2` the cap of 3 is never reached during entry, so both entrants come
in and the single elimination happens in the drain loop.

### Main loop

```
for i = 0 .. N-1:
    ring.append(order[i])
    emit enter{ name: order[i], entrant: i+1, ring: snapshot }
    if len(ring) >= cap:
        eliminate()

while len(ring) > 1:
    eliminate()
```

Exactly `N - 1` eliminations occur in total, in every draw.

### `eliminate()` — consumption order

The five stream reads happen in exactly this order. The list mutation happens
after all of them and consumes nothing.

```
1.  a        = nextInt(len(ring))            # first combatant, by POSITION
2.  b        = nextInt(len(ring) - 1)        # second combatant
    if b >= a: b = b + 1                     # skip-over, yields b uniform on [0,len) \ {a}
3.  loserIsA = (nextInt(2) == 0)             # fair coin
4.  loserPos, winnerPos = (a, b) if loserIsA else (b, a)
5.  move     = FINISHERS[nextInt(12)]        # flavour, AFTER the coin

    loser  = ring[loserPos]
    victor = ring[winnerPos]
    remove ring[loserPos]
    eliminated.append(loser)
    emit eliminate{ winner: victor, loser, move, ring: snapshot }
```

Notes:

- Step 2 uses `nextInt(len(ring) - 1)`. When the ring holds exactly two, that
  is `nextInt(1)`, which returns `0` and **consumes no bytes**. The skip-over
  still applies afterwards.
- The coin is `nextInt(2)`, which never rejects, but still costs 4 bytes.
- Step 5 is drawn unconditionally, even though it only affects display text.
  It must be drawn, in this position.
- `eliminate` is never called with `len(ring) < 2`, since `cap >= 3` and the
  drain loop guards on `len(ring) > 1`.

### Standings

```
standings = [ring[0]] ‖ reverse(eliminated)
winners   = standings[0 : winnerCount]
```

`ring[0]` is the sole survivor. The reversal makes the last contestant
eliminated the runner-up, and the first entrant eliminated last place.

### Byte cost

```
shuffle:        4(N-1)
per elimination: 4 (a) + [4 if len(ring) > 2 else 0] (b) + 4 (coin) + 4 (move)
```

plus 4 per rejected sample. For `N = 4`: `12 + 16 + 16 + 12 = 56`.

---

## 8. Mode `rpg`

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `RPG_HP` | `60` | Starting hit points, identical for everyone. |
| `RPG_MISS_PCT` | `8` | A roll of `nextInt(100) < 8` is a miss. |
| `RPG_CRIT_PCT` | `12` | A roll of `nextInt(100) < 12` is a critical hit. |
| base damage | `6 + nextInt(13)` | Uniform on `6..18` inclusive. |
| crit damage | `base * 2` | Uniform on `12..36` even values. |
| `RPG_ROUND_CAP` | `300` | Maximum rounds before the timeout fallback. |

### State

```
hp[i]       = 60 for all i
alive[i]    = true for all i
livingCount = N
round       = 0
kos         = []      # names, in the order they were knocked out
```

Contestants are tracked by **index into the original roster**, not by name.
Names are only attached when emitting events.

### Round loop

```
while livingCount > 1 and round < 300:
    round += 1
    order = shuffle([i for i in 0..N-1 if alive[i]])     # ascending, THEN shuffled
    emit round{ round }

    for attacker in order:
        if not alive[attacker] or livingCount < 2:
            continue                                     # consumes NOTHING

        targets = [i for i in 0..N-1 if alive[i] and i != attacker]   # ascending

        1. target = targets[nextInt(len(targets))]
        2. missed = nextInt(100) < 8
        3. crit   = nextInt(100) < 12
        4. base   = 6 + nextInt(13)
        5. verb   = VERBS[nextInt(10)]

        dmg = 0 if missed else (base * 2 if crit else base)
        hp[target] = max(0, hp[target] - dmg)

        emit attack{ round, attacker, attackerIndex, target, targetIndex,
                     dmg, missed, crit: (not missed and crit), verb,
                     hpAfter: hp[target] }

        if hp[target] == 0:
            alive[target] = false
            livingCount  -= 1
            kos.append(name of target)
            emit ko{ name, index: target, by: name of attacker }
```

The five reads per attack are the crux of this mode:

- They happen **in that exact order, unconditionally**. The crit roll is drawn
  even when the attack missed. The base damage is drawn even when the attack
  missed. The verb is drawn even when the attack missed. An implementation that
  short-circuits after a miss desynchronises immediately.
- `crit` in the emitted event is `not missed and crit`, but the *roll* was
  still made and the byte cost is identical either way.
- `len(targets)` is `livingCount - 1`. When only two fighters remain that is
  `1`, so read 1 becomes `nextInt(1)` and costs **zero bytes** while reads 2–5
  still cost 4 each. A two-fighter attack costs 16 bytes; any other attack
  costs 20.
- The `alive[attacker]` guard means a fighter knocked out earlier in the same
  round is skipped silently, with no stream read and no event.
- `order` is rebuilt and reshuffled every round from the currently living, so
  its length shrinks as fighters drop.

### Resolution

```
if livingCount == 1:
    survivor = contestant at the first index where alive[i] is true

else:                                    # round cap reached
    stillUp = [i for i in 0..N-1 if alive[i]]        # ascending
    best    = stillUp[0]
    for i in stillUp:
        if hp[i] > hp[best]: best = i    # STRICT >, so ties keep the lower index
    survivor = contestant at best
    for i in stillUp where i != best:
        kos.append(name of i)            # ascending index order
    emit timeout{ winner: survivor }
```

The timeout branch is the only part of this protocol that is not identity-
blind: it breaks ties on hit points by lowest roster index. It consumes no
bytes. Reaching it requires 300 consecutive rounds with two or more fighters
still standing, which given a floor of 6 damage per landed hit against 60 HP
would require essentially every attack in some 600 to miss at 8% each — a
probability far below any threshold worth naming. Implement it anyway: it is
reachable in principle, and conformance is conformance.

### Standings

```
standings = [survivor] ‖ [n for n in reverse(kos) if n != survivor]
winners   = standings[0 : winnerCount]
```

The filter compares **by name**, not by index. With a duplicate name on the
roster this misbehaves; see section 11.

Also returned: `finalHp`, a copy of the `hp` array in roster order.

---

## 9. Why rumble and rpg are still exactly 1/N

The wheel is obviously uniform — one `nextInt(N)` and done. The other two look
like simulations with structure, so the fairness argument has to be made
explicitly.

**Claim.** For both `rumble` and `rpg`, for every contestant `x` and every
place `k`, `P(x finishes in place k) = 1/N`.

**Argument.** Consider relabelling the roster by an arbitrary permutation `π`.
Both simulations are *equivariant* under `π`: run the same stream against the
permuted roster and you get the permuted result. This holds because no decision
in either mode ever inspects a contestant's name or identity:

- **rumble.** Combatants are chosen as ring **positions** (`nextInt(len(ring))`
  and the skip-over draw), the coin picks between two positions, and the
  finisher lookup does not depend on anyone. The only place identity enters is
  the initial `order`, which is a uniform random permutation from a Fisher-Yates
  shuffle over the roster.
- **rpg.** All fighters start at identical HP. Acting order is a fresh uniform
  permutation of the living each round. Targets are uniform over living
  non-self. The miss, crit, damage and verb rolls are drawn identically for
  everyone. Every decision is made on indices into a list, never on who is at
  that index.

So the outcome permutation `Σ` (the standings) satisfies `Σ(π(roster)) =
π(Σ(roster))` for any `π`. Composed with a uniformly random `π` — supplied by
the initial shuffle in rumble, and by the per-round shuffle plus symmetric
initial state in rpg — the distribution of `Σ` is **exchangeable**: invariant
under relabelling. Exchangeability forces every marginal to be uniform, hence
`P(x in place k) = 1/N` for all `x` and `k`.

For `winnerCount = w`, the winners are `standings[0:w]`, so each contestant is
in the winners list with probability exactly `w/N`.

**Two honest qualifications.**

1. *Conditional* probabilities are not uniform, and are not claimed to be. A
   rumble entrant who comes in at number 12 faces fewer eliminations than
   entrant number 1 and is more likely to survive **given** that entry slot.
   This does not matter, because the entry slot itself is assigned uniformly at
   random. The marginal is what a contestant experiences, and the marginal is
   `1/N`.
2. The rpg **timeout tie-break favours the lower roster index** and is
   therefore not symmetric. It is the single exception to the argument above,
   and it applies only in the round-cap branch of section 8, whose probability
   is negligible but not zero. The `1/N` claim is exact conditional on the
   round cap not being reached.

Neither mode's standings distribution is uniform over all `N!` orderings —
only the marginals are uniform, which is the property that matters for picking
winners.

---

## 10. Verification algorithm

This mirrors `verifyReceipt` in `engine.js`. Steps 1–3 are the three checks it
reports; the details in 4–6 are what its `run()` call does internally.

1. **Parse the receipt.** Required fields: `commit`, `mode`, `contestants`,
   `winnerCount`, `clientSeed`, `nonce`, `winners`, `serverSeed`. `drawId`,
   `version` and `drawnAt` are read but not required. `version` and `drawnAt`
   are never checked against anything — `drawnAt` in particular is unsigned,
   uncommitted, and carries no evidential weight.

2. **Check the commitment opens.**
   `sha256Hex(receipt.serverSeed) == receipt.commit`.
   `engine.js` applies `String()` coercion here, so a missing `serverSeed`
   hashes the literal text `"undefined"` and fails cleanly rather than
   throwing.

3. **Check the Draw ID.** Recompute
   `drawId(receipt.commit, receipt.mode, receipt.winnerCount, receipt.contestants)`
   per section 2 and compare with `receipt.drawId`.

   `engine.js` uses `idOk = !receipt.drawId || id === receipt.drawId`: a
   receipt with **no `drawId`, an empty string, or `null`** passes this check
   vacuously. Reproduce that rule if you need bit-identical verdicts; flag or
   reject the absent case if you want a verifier a contestant can lean on.
   Recomputing the Draw ID from a receipt is in any case only meaningful once
   you have compared it against the value the operator published in advance.

4. **Validate and normalise inputs**, per section 6: mode in range, at least
   two contestants, server seed matching `^[0-9a-f]{64}$`, and
   `winnerCount = max(1, min(winnerCount or 1, N))`. `engine.js` throws on
   failure, and `verifyReceipt` catches the throw and records the replay check
   as failed with the error message.

   Note the asymmetry: step 3 hashes `receipt.winnerCount` **as written**,
   while step 5 replays with the **clamped** value. A receipt claiming
   `winnerCount: 0` therefore has a Draw ID over `"0"` but replays as if it
   were `1`.

5. **Replay.** Initialise the reader from
   `(serverSeed, clientSeed, nonce)` per section 3 and run the mode algorithm
   from section 6, 7 or 8.

6. **Compare winners.** `engine.js` compares `JSON.stringify(result.winners)`
   with `JSON.stringify(receipt.winners)` — an ordered, exact, element-wise
   string comparison. Order matters; a permuted winners list fails.

7. **Verdict.** `ok = commitOk and idOk and replayOk`.

What none of this covers, and what a reimplementation should not imply that it
covers: whether the commitment was published before the client seed existed,
whether the roster was complete, and whether other nonces were drawn and
discarded. Those are procedural, and no amount of hashing reaches them.

---

## 11. Test vectors

All values below were produced by running `engine.js` under Node v24. Use them
as conformance tests.

### Shared inputs

```
serverSeed  = 9a482a4a080f28a360253fd7136112d7ae8eb5aadc9a126f5f8d175bcd16decf
clientSeed  = "demo"
nonce       = 0
contestants = ["Ada", "Bo", "Cass", "Dex"]
winnerCount = 1
```

The seed is not magic; it is `sha256Hex("fairdraw-protocol-test-vector")`, so
you can regenerate it rather than trusting this file.

### V0 — Commitment

```
commit = d79ce062125c83c08ce6d33411ea2d55c3f936bb13b298e1125bb9f72f411d1c
```

Reproduce with no FairDraw code at all:

```bash
printf %s "9a482a4a080f28a360253fd7136112d7ae8eb5aadc9a126f5f8d175bcd16decf" | sha256sum
```

### V1 — Stream

The first two blocks. Verifiable against any standard HMAC library, which is
the fastest way to confirm you got the string-key rule right:

```
HMAC-SHA256(key = "9a48...decf", msg = "demo:0:0")
  = de17cc300d4ffc8da0fbd3951e31d5da540eed9f948379b4cd8585a75046a6a0

HMAC-SHA256(key = "9a48...decf", msg = "demo:0:1")
  = 73f4ef85c1a29e5a3141655e5031d90b162acc229df422643d80f672327f259c
```

Primitive outputs from a freshly initialised reader:

| First call | Result | Bytes consumed |
| --- | --- | --- |
| `nextByte()` | `222` (`0xde`) | 1 |
| `nextUint32()` | `3726101552` (`0xde17cc30`) | 4 |
| `nextInt(4)` | `0` | 4 |

### V2 — Draw IDs

Preimages, with `<US>` = `0x1F`:

```
wheel :  d79ce0...411d1c|wheel|1|Ada<US>Bo<US>Cass<US>Dex
rumble:  d79ce0...411d1c|rumble|1|Ada<US>Bo<US>Cass<US>Dex
rpg   :  d79ce0...411d1c|rpg|1|Ada<US>Bo<US>Cass<US>Dex
```

| mode | drawId |
| --- | --- |
| `wheel` | `16f5de8bfe0fac029c2cb7e8cb45bcfb4dfb1edf16ec750632e56600882334f5` |
| `rumble` | `8c721231e993737a6088803bbd4781a2407d2758df0c752e46c17d20c1059994` |
| `rpg` | `58d28489c780bf5e56a0bf819004cb764b17ffd97186bcce7c2e9445bfc0d410` |

Reproduce the first one from a shell, which also proves the `0x1F` separator:

```bash
printf 'd79ce062125c83c08ce6d33411ea2d55c3f936bb13b298e1125bb9f72f411d1c|wheel|1|Ada\x1fBo\x1fCass\x1fDex' | sha256sum
```

### V3 — `wheel`

```
winners   = ["Ada"]
standings = (not returned by this mode)
bytesUsed = 4
```

Full `nextInt` trace, as `n -> result [bytes]`:

```
4->0 [4]
```

`pool` is `["Ada","Bo","Cass","Dex"]`, `idx = 0`, so `Ada`.

Multi-winner variant, same seeds with `winnerCount = 3`:

```
drawId    = b7249a6921777f59c7e102ec3681d8ebe6a889cb1c4483f70ff9e264cedc6d87
winners   = ["Ada", "Dex", "Cass"]
indices   = [0, 2, 1]          # pool sizes 4, 3, 2
bytesUsed = 12
```

Note the drawId differs from V2 because `winnerCount` is part of the preimage.

### V4 — `rumble`

```
winners   = ["Bo"]
standings = ["Bo", "Cass", "Ada", "Dex"]
bytesUsed = 56
cap       = 3
```

Full `nextInt` trace, 15 calls:

```
shuffle:   4->0 [4]   3->2 [4]   2->1 [4]        => order = [Dex, Bo, Cass, Ada]
elim 1:    3->0 [4]   2->1 [4]   2->0 [4]   12->11 [4]
elim 2:    3->2 [4]   2->1 [4]   2->0 [4]   12->6  [4]
elim 3:    2->1 [4]   1->0 [0]   2->0 [4]   12->4  [4]
```

Step by step:

| Event | Ring before | Draws | Outcome |
| --- | --- | --- | --- |
| enter #1 | `[]` | — | `Dex` enters → `[Dex]` |
| enter #2 | `[Dex]` | — | `Bo` enters → `[Dex, Bo]` |
| enter #3 | `[Dex, Bo]` | — | `Cass` enters → `[Dex, Bo, Cass]`, hits cap |
| elim 1 | `[Dex, Bo, Cass]` | `a=0`, `b=1→2`, coin`=0`→loser is `a` | `Cass` dumps `Dex` with *a backbreaker* → `[Bo, Cass]` |
| enter #4 | `[Bo, Cass]` | — | `Ada` enters → `[Bo, Cass, Ada]`, hits cap |
| elim 2 | `[Bo, Cass, Ada]` | `a=2`, `b=1` (no bump), coin`=0`→loser is `a` | `Cass` dumps `Ada` with *a corner spear* → `[Bo, Cass]` |
| elim 3 | `[Bo, Cass]` | `a=1`, `b=nextInt(1)=0` **free**, coin`=0`→loser is `a` | `Bo` dumps `Cass` with *a flying dropkick* → `[Bo]` |

`eliminated = [Dex, Ada, Cass]`, reversed and prefixed with the survivor gives
the standings above. The `1->0 [0]` in elim 3 is the zero-byte case; an
implementation that reads 4 bytes there produces `bytesUsed = 60` and a
different finisher, and every draw after it diverges.

### V5 — `rpg`

```
winners   = ["Dex"]
standings = ["Dex", "Cass", "Ada", "Bo"]
finalHp   = [0, 0, 0, 19]        # roster order: Ada, Bo, Cass, Dex
bytesUsed = 540
nextInt calls = 142
rounds    = 9
```

Round 1 in full, showing the exact five-read pattern:

```
shuffle: 4->0 [4]  3->2 [4]  2->1 [4]   => order = [3, 1, 2, 0] = Dex, Bo, Cass, Ada

Dex  attacks: target 3->0 [4] => Ada  | miss 100->79 (no) | crit 100->40 (no) | base 13->5 => 11 | verb 10->6 => cleaves   | Ada  49
Bo   attacks: target 3->2 [4] => Dex  | miss 100->58 (no) | crit 100->74 (no) | base 13->7 => 13 | verb 10->2 => smashes   | Dex  47
Cass attacks: target 3->1 [4] => Bo   | miss 100->74 (no) | crit 100->0  (YES)| base 13->6 => 12 | verb 10->2 => smashes   | Bo   36  (crit, 24 dmg)
Ada  attacks: target 3->0 [4] => Bo   | miss 100->59 (no) | crit 100->85 (no) | base 13->11 => 17| verb 10->5 => pummels   | Bo   19
```

Byte budget per round, as a cross-check on the total:

| Round | Living at start | Shuffle | Attacks | Bytes |
| --- | --- | --- | --- | --- |
| 1 | 4 | 12 | 4 × 20 | 92 |
| 2 | 4 | 12 | 4 × 20 | 92 |
| 3 | 3 | 8 | 3 × 20 | 68 |
| 4 | 3 | 8 | 3 × 20 | 68 |
| 5 | 3 | 8 | 3 × 20 | 68 |
| 6 | 3 | 8 | 20 + 16 (one skipped, one 2-fighter) | 44 |
| 7 | 2 | 4 | 2 × 16 | 36 |
| 8 | 2 | 4 | 2 × 16 | 36 |
| 9 | 2 | 4 | 2 × 16 | 36 |
| | | | **total** | **540** |

Knockout order: `Bo` (round 2, by `Cass`), `Ada` (round 6, by `Cass`), `Cass`
(round 9, by `Dex`). `kos = [Bo, Ada, Cass]`, reversed and prefixed with `Dex`
gives the standings above.

### V6 — Nonce independence

Same seeds and roster, `nonce = 1`:

| mode | winners | bytesUsed |
| --- | --- | --- |
| `wheel` | `["Ada"]` | 4 |
| `rumble` | `["Cass"]` | 56 |
| `rpg` | `["Cass"]` | 520 |

The `wheel` result matching nonce 0 is coincidence, not a bug — with four
contestants it happens a quarter of the time. It is included precisely because
it is the kind of value people assume is a mistake and silently "fix".

### Regenerating all of the above

```bash
node -e "const F=require('./engine.js');const s=F.sha256Hex('fairdraw-protocol-test-vector');const C=['Ada','Bo','Cass','Dex'];console.log('seed',s,'commit',F.sha256Hex(s));for(const m of F.MODES){const r=F.run({mode:m,contestants:C,serverSeed:s,clientSeed:'demo',nonce:0,winnerCount:1});console.log(m,F.drawId(F.sha256Hex(s),m,1,C),JSON.stringify(r.winners),r.bytesUsed)}"
```

---

## 12. Implementation notes and known sharp edges

Things that will not show up in a happy-path test but will bite a
reimplementation or an operator eventually.

- **The `0x1F` separator is invisible in most tooling.** Section 2. This is the
  single most likely cause of a mismatched Draw ID.
- **The server seed is keyed as a string.** Section 1. Second most likely
  cause of total divergence.
- **`nextInt(1)` and `nextInt(0)` consume nothing.** Section 4. Causes silent
  desynchronisation partway through a draw rather than an obvious failure.
- **Flavour lookups are stream reads.** Sections 5, 7 and 8.
- **Duplicate names are not rejected by the engine.** `run()` checks the roster
  length and the seed format, but not uniqueness. `index.html` blocks
  duplicates at lock time, so the browser flow is safe — but a hand-written
  receipt fed straight to a verifier is not. With a duplicate name, the rpg
  standings filter (`n != survivor`, compared by name, section 8) drops the
  wrong entry and the standings come out short. The Draw ID is also
  ambiguous in a milder way. Reject duplicate rosters at your verifier's
  boundary.
- **A receipt with no `drawId` passes the Draw ID check.** Section 10, step 3.
- **`winnerCount` is clamped for the replay but not for the Draw ID.**
  Section 10, step 4.
- **`nonce` is `ToInt32`.** Section 3. `2147483648` becomes `-2147483648` and
  hashes as `"-2147483648"`.
- **The rpg timeout tie-break is index-biased.** Section 8. Negligible
  probability, but it is a real asymmetry, and it must be implemented
  identically for conformance.
- **The nonce is outside the commitment.** Section 2. Nothing in a receipt
  proves which draws were run and discarded; that is a procedural control, not
  a cryptographic one.
- **`bytesUsed` is returned but never verified.** It is a debugging aid. It is
  nonetheless the fastest way to localise a divergence when reimplementing:
  match it first, then match the winners.

---

# Format 2 (`fairdraw-2`)

Everything above describes `fairdraw-1` and remains accurate for receipts
carrying that version. Format 2 adds ranked alternates, ticket entries,
compact range rosters and a declared draw budget. A verifier picks the
preimage by the receipt's `version` field; anything that is not the exact
string `fairdraw-2` uses the format 1 preimage.

## Draw ID preimage

```
fairdraw-1:  SHA-256( commit | mode | winnerCount | rosterKey )
fairdraw-2:  SHA-256( "fairdraw-2" | commit | mode | winnerCount
                      | alternates | groupBy | draws | entropy | rosterKey )
```

Joined with `|` (U+007C). Field meanings:

| Field | Type | Notes |
|---|---|---|
| `alternates` | integer ≥ 0 | ranked backups drawn after the winners |
| `groupBy` | `none` \| `holder` | `holder` collapses repeat wins by one person |
| `draws` | positive integer, or the literal `open` | how many draws this commitment authorises |
| `entropy` | string | where the client seed comes from, see below |
| `rosterKey` | string | see below |

`draws` is the string `open` when the operator declared no budget. `open`
and `1` are deliberately different preimages — an unbounded commitment must
never hash the same as a single-draw one.

## Roster key

```
listed roster:  entries joined with U+001F (unit separator)
numeric range:  "range:" + from + "-" + to        e.g. range:1-10000
ticket roster:  "tickets:" + records joined with U+001F,
                each record being  count + ":" + holder
                                                  e.g. tickets:5:Ada<US>3:Bo
```

A ticket roster commits **one record per person, not per ticket**, so 50,000
tickets commit in about 36 KB rather than 786 KB — a 22x reduction, measured.
The count comes first because it is always digits followed by a colon, which
makes the record unambiguous even when the holder name itself contains a
colon: `tickets:2:a:b` is one entrant named `a:b` holding two tickets.

The expansion is `makeTickets(entries)` — for each record in order, labels
`holder + " #" + i` for i = 1..count.

A range or ticket spec and its expansion produce **different** Draw IDs on
purpose, so one can never be substituted for the other. The expansion is `from`, `from+1`,
… `to` inclusive, each rendered as a base-10 string with no padding.

Storing a range as its bounds is what keeps a 10,000-entry receipt at about
450 bytes instead of 117 KB.

## Ticket entries

An entrant with *n* entries holds *n* tickets, labelled:

```
<holder> + " #" + i        for i = 1 .. n, in roster order
```

Tickets are ordinary unique entries — the draw applies no weighting at all,
so win probability is proportional to tickets held as a consequence of
uniform selection rather than of any weighting code. Holder names may not
contain `" #"`, which is rejected at construction. `holderOf(label)` strips
from the **last** occurrence of `" #"`, so holders may contain `#` elsewhere.

With `groupBy: "holder"`, ranking walks the drawn order and keeps only the
first ticket of each new holder, continuing until `winnerCount + alternates`
distinct holders are found or the pool is exhausted. This is a pure function
of the drawn order, so it is reproducible from the published standings.

## Standings

`run()` returns `standings`, the ranked list of `winnerCount + alternates`
places; `winners` is its first `winnerCount` entries.

Because the wheel's only stream read is `nextInt(pool.length)`, and
`pool.length` depends on how many picks have already happened rather than on
how many were requested, **drawing more places cannot change the earlier
ones**. Ranking R places always reproduces the first R′ of any shorter draw,
for R′ ≤ R. Adding alternates therefore cannot change who won. The brawl
modes rank the whole field as a side effect of playing out and are truncated
to the same depth.

`winnerCount` and `alternates` are both pinned in the Draw ID, so the depth
of the backup list is fixed before the draw even though extending it is
provably harmless.

## Draw budget and the grinding gap

`draws` declares how many draws a single commitment authorises; nonces run
`0 .. draws-1` and `run()` rejects anything outside that. This makes a
suppressed draw *visible* — an operator who privately runs nonces 0, 1, 2
and publishes only the flattering one is now missing receipts from a run
everyone was told to expect.

**It does not make grinding impossible, only conspicuous.** Nothing here
forces publication. The actual fix is entropy the operator could not know at
commit time — a future drand round or block hash as the client seed. A
verifier should state plainly that it cannot check what was never published.

## Receipt fields added in format 2

| Field | Required | Notes |
|---|---|---|
| `alternates` | no, defaults 0 | |
| `standings` | no | if present it is checked; it is a claim about who is next in line |
| `groupBy` | no, defaults `none` | |
| `draws` | no | omitted means an open-ended commitment |
| `roster` | either this or `contestants` | `{"kind":"range","from":1,"to":10000}` or `{"kind":"tickets","entries":[{"holder":"Ada","entries":5}]}` |

`contestants` may be omitted entirely when `roster` carries a range.

## Entropy key

```
hand-picked seed:  "manual"
drand beacon:      "drand:" + chainHash + ":" + round
```

drand quicknet, confirmed live against the chain's own `/info` endpoint:

| | |
|---|---|
| chain hash | `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| genesis (unix seconds) | 1692803367 |
| period (seconds) | 3 |

```
round(t)      = floor((t - genesis) / period) + 1
timeOf(round) = genesis + (round - 1) * period
```

The client seed for a beacon draw is the round's `randomness` field, as the
64-character lowercase hex string drand publishes.

**Why this matters.** The round number is pinned into the Draw ID *before that
round exists*. Nobody — operator included — can know the seed at commit time,
so there is nothing to grind against. This is the only mechanism here that
closes the nonce-grinding gap rather than merely making it visible.

### What a beacon check does and does not prove

A verifier fetches the round from several independent drand mirrors and
compares against the receipt's `clientSeed`. Mirrors must agree.

This is **not** a signature verification. drand rounds carry a BLS12-381
signature over the chain's public key; checking it requires pairing crypto,
which would cost `engine.js` its zero-dependency, any-runtime property. So:

- It **does** defeat an operator who invented a seed, or who swapped in a
  different round after seeing the result.
- It **does not** defeat an adversary who also controls every mirror queried.

A verifier wanting the stronger guarantee should check the signature with
drand's own tooling. A verifier that cannot reach the network must say the
seed origin is unconfirmed rather than implying it passed.
