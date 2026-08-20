# FairDraw — Promotion Type Taxonomy & Required Engine Mechanics

**Status:** COMPLETE — §0–§7. (§0–§2.11 written in an earlier pass; §2.2 legal re-framing,
§3–§7 completed 2026-08-16.)
**Date:** 2026-08-16
**Scope:** What kinds of promotions people actually run, and what each one demands of a
commit-reveal draw engine that today handles: 2..N unique string entries (or an
auto-generated numeric range), equal weight, without replacement, K winners, one of three
animations, one commitment per roster.

---

## 0. Current engine capability baseline (read from `engine.js`)

| Capability | Today |
| --- | --- |
| Entry list | `contestants: string[]`, min 2, **unique enforced** (duplicates throw), order is load-bearing |
| Weighting | None. Uniform `rng.nextInt(pool.length)` |
| Winners | `winnerCount` 1..N, drawn **without replacement** (`pool.splice`) |
| Commitment | `drawId = SHA256(commit \| mode \| winnerCount \| contestants.join(US))` |
| Randomness | `HMAC-SHA256(serverSeed, "clientSeed:nonce:blockIndex")`, rejection-sampled `nextInt` |
| Multi-draw | `nonce` increments; **nonce is NOT in the drawId** — the known procedural gap |
| Output | Full `standings` (rumble/rpg) but only `winners[0..K]` published |
| Receipt | `version, drawId, commit, mode, contestants, winnerCount, clientSeed, nonce, winners, serverSeed, drawnAt` |

Two facts from the baseline drive almost everything below:

1. **`standings` already exists** for rumble and RPG — a full ordered permutation of the
   roster is computed but discarded past K. Tiered prizes and alternates are nearly free.
2. **The roster is hashed as a literal joined string.** Anything that changes the roster
   representation (weights, ranges, snapshots) must be expressible as a canonical string
   or the Draw ID stops being a fingerprint of the real inputs.

---

## 1. Summary table

Legend for **Engine gap**: 🟢 works today · 🟡 small change · 🔴 new mechanic.

| # | Promo type | Entry list looks like | Weighted? | Winners K | Replacement | Must be pinned in commitment | Audience must SEE | Engine gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Simple giveaway** (1 entry/person) | Flat list of unique handles/names | No | K ≥ 1 | Without | Roster (verbatim+order), mode, K | Roster before lock; commit; client seed origin; winners; receipt | 🟢 |
| 2 | **Weighted raffle** (tickets per person) | `name, weight` pairs; weights 1..50k | **Yes** | K ≥ 1 | Without (person removed after win) | Roster **and every weight**, total weight | Each person's weight + the total, before lock | 🔴 weights + weighted-without-replacement |
| 3 | **Numbered ticket raffle** | *A range*, e.g. `1–5000`. No roster at all | No (1 ticket = 1 entry) | K ≥ 1 | Without (over ticket numbers) | Range bounds, sold/void set if used, K | The range and the winning number(s). **No PII published** | 🟡 range as first-class roster |
| 4 | **Tiered / multi-prize** (1st/2nd/3rd) | Flat or weighted list | Either | K = number of prizes | Without | Roster, K, **and the prize-to-rank map** | Ordered winners, rank→prize mapping fixed in advance | 🟡 `standings` already exists; needs prize labels in drawId |
| 5 | **Alternates / runner-ups** | Same list as the parent draw | Same as parent | K = prizes + A alternates | Without | Roster, K_total, claim window, promotion rule | The full ordered list incl. alternates, published at draw time | 🟡 draw K+A, publish all, label ranks |
| 6 | **Instant-win / predetermined moment** | *Not a roster* — a set of winning **moments** or **ordinals** ("500th entrant") | N/A | = number of winning moments | Without (each moment used once) | The winning moments/ordinals themselves (as a hash), the entry window, prize count | Post-hoc: the revealed moment list + the entry log timestamps | 🔴 draws from a *slot space*, not an entrant list |
| 7 | **Code / key distribution** | Two lists: recipients **and** prizes (keys) | Usually not | K = min(recipients, keys) | Without on both sides | Recipient roster, **hash of each key** (never the key), key→index order | Each recipient's key-hash before draw; their key after | 🔴 second list + per-item commitments |
| 8 | **Crypto holder snapshot** | Wallet addresses ± balances, at a block/slot | Optional (see 8a/8b) | K ≥ 1 | Without | **Block height / slot number**, snapshot rule, snapshot file hash | The snapshot is reproducible from chain by anyone | 🟡 (unweighted) / 🔴 (weighted) |
| 9 | **Bracket / tournament** | Seeded list, usually power-of-2 | Seeds may be weighted | 1 champion + full bracket | Without | Roster **and the seeding**, bracket shape, round count | The bracket filling in, round by round | 🔴 pairwise structure, not pool-removal |
| 10 | **Milestone / referral bonus entries** | `name, base + earned` — a weighted list built by rules | **Yes** | K ≥ 1 | Without | Final weights **after** the earn window closes | The earn ledger (who earned what, why) before lock | 🔴 = type 2 + an auditable ledger |
| 11 | **Recurring scheduled draws** | One pool per period, or one standing pool | Either | K per period | Depends (see §2.11) | The **schedule itself** and nonce→draw mapping | Every receipt in the sequence, no gaps | 🟡 nonce must enter the drawId |

**The single biggest observation:** rows 2, 10 and (half of) 8 collapse into *one* mechanic —
**integer weights** — and rows 4, 5 and 9 collapse into *one other* mechanic — **publish the
full ordered permutation instead of a truncated winners list**. Two mechanics cover six types.

---

## 2. Section per promo type

### 2.1 Simple giveaway — 1 entry per person, K winners

**Entry list.** A flat list of unique identifiers: display names, handles, emails, order
numbers. Deduplication is an *entry-control* problem the engine deliberately does not solve
(README is already explicit about this) — but the engine's hard rejection of duplicate
strings makes the operator confront it at lock time rather than after.

**Weighted?** No. **K:** 1..N. **Replacement:** without — the winner is spliced out of the
pool, so no one wins twice.

**Pinned in the commitment.** Exactly what `drawId` pins today: `commit | mode | winnerCount
| contestants`. Order matters and is hashed, which is correct — it means the operator cannot
claim a different roster later.

**Audience must see.** (a) the roster published *for review* before lock — the commitment
proves *which* list was used, never that it was the *right* list; (b) the commitment block,
timestamped externally; (c) the client seed's provenance; (d) the receipt with the revealed
seed. This is the case FairDraw already serves completely.

**Sharp edge.** Human-typed rosters produce near-duplicates (`@josh`, `Josh`, `josh_`) that
the uniqueness check passes but a human reads as one person. Worth a pre-lock "these N
entries look similar" advisory — a warning, never an auto-merge, because auto-merging would
silently change the hashed roster.

---

### 2.2 Weighted raffle — one person holds 50 tickets, another holds 1

> **LEGAL RE-FRAMING (added after `02-legal-compliance.md` landed — read this before the rest
> of §2.2).** The *mechanic* below is correct and is still the highest-value feature in the
> document, but the **use cases it may be pointed at are constrained**. Prize + chance +
> consideration = an illegal lottery in most US states, so **a paid entry must never carry
> more weight than a free one**. "Buy more tickets for better odds" is off the table as a
> FairDraw feature. What weights are legitimately *for*:
>
> | Weight source | Legal? | Notes |
> | --- | --- | --- |
> | Paid entries / "1 entry per $10 spent" | ❌ not for us | Consideration + chance + prize. Only lawful under a licensed charitable-gaming permit or a state lottery, which is a different product. |
> | **Free bonus entries** (share = +1, refer a friend = +3, daily check-in = +1) | ✅ | The industry norm. No consideration, so no lottery. **This is the design target.** |
> | AMOE-equalised entries (mail-in gets the same count as a purchase) | ✅ | Weights exist but purchase confers no advantage. |
> | Token/NFT holdings at a snapshot | ⚠️ jurisdiction-dependent | Holding is not *purchasing an entry*, but it is close enough to warrant the disclaimer; see §2.8 and `02-legal-compliance.md`. |
> | Numbered tickets bought at a charity raffle | ⚠️ licensed only | See §2.3 — the *range* mechanic is fine; selling into it is what needs a permit. |
>
> **Consequence for the product:** ship the weighted mechanic, but name it after the legal use
> — call it **"bonus entries"**, not "tickets" or "odds boost", and surface the earn-reason in
> the ledger (§2.10) rather than a bare integer. The UI copy is a compliance surface, not
> decoration. Everything below is written in terms of generic weights; substitute
> "free bonus entries" for "tickets bought" throughout.

The archetype: **free bonus entries** (Gleam-style multi-action campaigns where different
actions are worth different entry counts), loyalty tiers, and — under a licence only —
paid raffles and "1 entry per $10 spent".

**Entry list.** Pairs of `identity` and a positive integer `weight`. Real weight spreads are
brutal: a charity raffle can have one buyer at 500 books and a hundred at 1, so weights span
three orders of magnitude.

**Weighted?** Yes — this *is* the type. **K:** ≥ 1. **Replacement:** without, and this is
where it gets subtle. There are two defensible semantics and they give different answers:

- **Ticket-without-replacement (a.k.a. "one person can win twice").** Remove the winning
  *ticket*, leave the person's other 49 in. Correct for "every ticket has an equal chance"
  raffles where a big buyer legitimately can win two prizes.
- **Person-without-replacement.** Remove the person's *entire* weight on a win. Correct for
  "one prize per household" rules, which is what most consumer sweepstakes actually say.

These must be an explicit, committed choice — not a default. Two honest operators running the
same numbers under different semantics produce different winners, and a receipt that does not
say which was used cannot be replayed. **This is the most important single design decision in
the whole taxonomy.**

**Implementation.** Do *not* expand weights into a literal ticket array — 500k entries is
memory-hostile and, worse, the *expansion order* becomes part of the result, so a subtle
difference in how you expand (interleaved vs. blocked) silently changes the winner. Instead:

1. Build a cumulative-weight prefix array `C` over the roster in its committed order.
2. Draw `r = rng.nextInt(totalWeight)` — the existing rejection-sampled `nextInt` is already
   bias-free and already handles the full uint32 range, so weights up to ~4.29e9 are safe.
3. Binary-search `C` for the first index with `C[i] > r`. That's the winner.
4. For the next winner, subtract the removed weight (person semantics) or 1 (ticket
   semantics) and rebuild/patch `C`.

This consumes an identical, well-defined number of bytes from the stream regardless of weight
magnitude, which is what keeps it verifiable in a reimplementation. **Note the byte-stream
consequence:** `nextInt(totalWeight)` rejection-samples against a *different* limit than
`nextInt(pool.length)`, so weighted and unweighted draws consume the stream differently. That
is fine — but it means weighting must be part of `drawId`, or two receipts with the same
Draw ID could replay to different winners.

**Pinned in the commitment.** The roster *and* every weight *and* the total, plus the
replacement semantics. Canonical form suggestion: `nameweight` per entry, so the
existing `join('')` idea extends without inventing a second separator; and append
`totalWeight` explicitly so a transcription error in one weight is caught immediately rather
than shifting every subsequent boundary silently.

**Audience must see.** The **per-entrant weight table**, published before lock. A weighted
draw where only the operator knows the weights is not a fair draw with extra steps — it's an
unfalsifiable claim. The total must be printed prominently: it is the one number an entrant
can check their own odds against (`myWeight / total`).

---

### 2.3 Numbered ticket raffle — the range IS the roster

**This is the highest-leverage type in the whole document and it is nearly free.**

**Entry list.** A range: `1–5000`. There is *no roster*. Nobody publishes 5,000 names,
because the ticket stubs are the identity system — you hold ticket 3,417 or you don't. This
is exactly how physical charity raffles, 50/50 draws, cloakroom-ticket draws and (at
national scale) Premium Bonds work: ERNIE generates random *numbers* and matches them against
eligible bond numbers rather than enumerating holders
([NS&I](https://www.nsandi.com/get-to-know-us/about-premium-bonds)).

**Why it matters for FairDraw specifically.** Every other promo type carries a privacy and
logistics tax: you must publish the roster before lock for the commitment to mean anything,
which means publishing names or handles of everyone who entered. Numbered tickets have
**zero** of that. The commitment is `range 1–5000, draw 3, without replacement` — a string a
person can read aloud. There is no PII, no CSV, no roster review step, no argument about
whether the list was complete. **The one promo type where FairDraw's proof is complete
end-to-end, not just from-the-roster-onward.**

**Weighted?** No — each ticket number is one entry. A buyer with 20 tickets is *automatically*
weighted correctly by holding 20 numbers, with no weight mechanic needed. **Weighted raffles
implemented as number ranges need no weighting code at all.** (This is why physical raffles
have used numbered tickets for a century.)

**K:** ≥ 1. **Replacement:** without — draw distinct numbers.

**The unsold-ticket problem.** The one genuine wrinkle. If 5,000 tickets were printed and
3,200 sold, drawing over 1–5000 can land on an unsold number. Three standard resolutions,
and the commitment must say which:

- **Draw over sold tickets only** — needs a sold-set, which reintroduces a list (but a list
  of *numbers*, still no PII, and still hashable compactly as ranges).
- **Redraw on an unsold number** ("if an unsold number is drawn, draw again"). Common in
  physical draws. Must be committed in advance, and every discarded draw must be published —
  otherwise "we redrew" is an unbounded rerandomisation channel.
- **Unsold tickets stay in and the prize rolls over / house keeps it.** Common in 50/50s.

**Pinned in the commitment.** Range bounds (inclusive/exclusive stated explicitly), K, the
unsold-number policy, and the sold-set hash if drawing over sold-only. Nothing else.

**Audience must see.** The range, the commit, and the winning numbers. That's the entire
proof surface. An entrant checks their own stub. Nobody has to trust a roster.

**Engine change needed (small).** Today the numeric range is generated into `contestants` as
strings, so a 1–100,000 range means a 100k-element array joined into one giant hashed string.
That works but is wasteful and makes the Draw ID input enormous. Better: make range a
first-class roster *kind* so `drawId` hashes `range:1-5000` rather than the expansion, and
the draw is `rng.nextInt(5000)+1` with a seen-set. Same result, O(K) memory instead of O(N),
and a commitment block a human can read. **Sub-mechanic worth calling out: this also unlocks
100k-entrant draws without ever materialising 100k of anything.**

---

### 2.4 Tiered / multi-prize draws — 1st, 2nd, 3rd

**Entry list.** Same as 2.1 or 2.2. What changes is the *output* interpretation.

**K:** exactly the number of prizes. **Replacement:** without, sequentially — draw 1st from
the full pool, 2nd from the remainder, and so on. This is precisely what `runWheel` already
does with `place: i + 1` in its events.

**Pinned in the commitment.** The roster, K, *and the prize-to-rank map*. This last part is
missing today and is not cosmetic: if the prizes are a PS5, a mug and a keychain, and the
rank→prize mapping is decided *after* the winners are known, the operator can hand the PS5 to
whichever name they prefer. Pinning `1st=PS5, 2nd=mug, 3rd=keychain` inside the Draw ID makes
that impossible.

**Different prize *pools*** (e.g. 3 winners of prize A, 10 of prize B) are just a rank-range
map: ranks 1–3 → A, ranks 4–13 → B. Same mechanic, K = 13.

**Audience must see.** The ordered winners list *and* the pre-committed prize map, so rank N
mapping to prize N is checkable rather than announced.

**Engine change (small).** Add an optional `prizes: string[]` (or rank-range map) hashed into
`drawId`, echoed in the receipt. The draw logic is unchanged.

---

### 2.5 Alternates / runner-ups for unclaimed prizes

Standard sweepstakes practice: the drawn name is a *potential* winner, contactable for a
fixed window, and if they don't respond an alternate is used. (See §2.5-sources below for
official-rules language.)

**Entry list.** Identical to the parent draw. **K:** prizes + alternates — you draw *deeper*
into the same permutation.

**Replacement.** Without. The alternate is simply rank K+1.

**The core design point.** There are two ways to get an alternate and only one is credible:

- ❌ **Redraw later** with a fresh commitment once the prize goes unclaimed. This hands the
  operator a rerandomisation channel: an operator who dislikes the winner can stall until the
  claim window lapses and redraw. Even honest use of it is unfalsifiable.
- ✅ **Draw deep once, publish the whole ordered tail.** Draw K + A ranks in the original
  draw, publish ranks 1..K+A at announcement time, and state the promotion rule ("if rank 1
  does not claim within 7 days, rank K+1 is promoted"). Now the alternate was fixed before
  anyone knew whether the winner would claim. Nothing to game.

**Pinned in the commitment.** Roster, K_total (= prizes + alternates), the claim window, and
the promotion rule.

**Audience must see.** The *full* ordered list at announcement — including alternates —
not just the top K. If alternates are announced only when they're needed, they prove nothing.

**Engine change (small, and mostly free).** `runRumble` and `runRpg` already compute a
complete `standings` array and throw away everything past K. `runWheel` can trivially do the
same by continuing to splice until the pool is empty. Then "K winners + A alternates" is a
*display* decision over one committed permutation. **Recommendation: always compute the full
permutation, always put it in the receipt, and let `winnerCount` be a presentation cut.**
This one change makes types 4, 5 and most of 9 fall out for free.

---

### 2.6 Instant-win and predetermined-moment promos

Structurally different from everything else: **there is no entrant list at draw time.** The
draw happens *first*, against a slot space, and entrants collide with it as they arrive.

Two sub-flavours:

**(a) Ordinal-based — "the 500th entrant wins".** The winning slots are *entry ordinals*.
The commitment fixes a set of ordinals (either literally chosen, or drawn from the seed over
a range) before entries open. As each entrant arrives they get ordinal 1, 2, 3…; whoever
lands on a committed ordinal wins immediately.

**(b) Time-based — "a random moment in each hour wins".** The winning slots are *timestamps*.
The commitment fixes a list of winning moments across the promo window; the first entry at or
after each moment wins.

**Entry list.** N/A at commit time. What exists instead is an **entry log** — an append-only
ordered record of arrivals (ordinal, identity, timestamp).

**Weighted?** No, but the *arrival process* is the randomness source in a way the operator
does not control, which is a nice property: even a fully public winning-ordinal list is not
gameable if entrants can't precisely control their ordinal.

**K:** = number of winning slots. **Replacement:** without — each slot fires once.

**Pinned in the commitment (the critical part).** The winning ordinals/moments themselves,
as a **hash**, plus the entry window bounds and the slot count. The values stay hidden until
the promo ends — otherwise everyone waits for entrant 499 and then enters. So this type needs
a *second* commit-reveal layer: commit to the moment list, run the promo, reveal the list at
the end. FairDraw's existing commit-reveal is exactly the right primitive; it just points at
a different object.

**Audience must see, after the fact.** (i) the revealed winning-slot list, (ii) proof it
hashes to the pre-published commit, (iii) the entry log with ordinals and timestamps, so
anyone can check that the announced winners really are the ones who occupied those slots.
Point (iii) is the weak link — the operator controls the log, and a dishonest operator can
insert or reorder entries. Mitigation is periodic public checkpointing of the log's running
hash, which is well beyond a static page.

**Engine change (large-ish, but reuses everything).** New draw target: a slot space rather
than a roster. `drawId` pins `windowStart|windowEnd|slotCount` instead of contestants. The
winning slots are `K` distinct values drawn without replacement from the window using the
existing RNG — which means the *whole moment list is itself a verifiable draw*, not an
operator-supplied file. That is strictly better than how commercial instant-win platforms
do it, and it's a genuinely strong pitch.

---

### 2.7 Code / key distribution

"200 Steam keys to 200 of the 3,000 people who entered." Distinct from every other type
because **the prizes are also a list, and they are secret**.

**Entry list.** Two lists: recipients (public) and prizes/keys (secret, must never be
published). **K:** min(recipients, keys). **Replacement:** without on both sides — one key
each, one key per person.

**Pinned in the commitment.** The recipient roster as usual, plus a **per-key commitment**:
`SHA-256(key_i + salt_i)` for each key, published as an ordered list. Never the keys. The
salt matters — key formats are low-entropy and structured enough that an unsalted hash list
is brute-forceable.

**How the draw works.** It's a *matching*, not a selection: shuffle the recipient list (or
draw K), then assign key index 0 to the first, index 1 to the second, etc. Since the key
commitments were published in order before the draw, the assignment is fully determined by
the shuffle and nobody could have steered a specific key to a specific friend.

**Audience must see.** The ordered key-hash list before the draw; the recipient→key-index
mapping after the draw; and each recipient can verify *their own* key hashes to the committed
value at that index. Non-winners verify the mapping without ever seeing a key. This is a
genuinely elegant property and it is not a big lift.

**Engine change (moderate).** A second committed list of opaque hashes + an index assignment
step. The RNG work is just `shuffle`, which already exists.

---

### 2.8 Crypto-native — holder snapshots

**Entry list.** Wallet addresses derived from on-chain state at a specific block/slot. Two
mutually exclusive policies, and the difference is the whole ballgame:

**(a) One wallet, one entry.** Flat list of qualifying addresses. Unweighted — identical to
2.1. Cheap to implement (🟢 today). But trivially Sybil-attacked: splitting 100 tokens
across 100 wallets multiplies your odds 100×, at the cost of gas. Only defensible when
qualification has an independent cost (an NFT mint, a minimum balance, a verified role).

**(b) Weighted by holdings.** `address, balance` — identical to 2.2's weighted mechanic.
Sybil-proof by construction: splitting a balance across wallets doesn't change your total
weight. This is the *correct default* for token communities and it is the same weighted
mechanic as row 2, which is more evidence that weights are the highest-value single feature.

**K:** ≥ 1. **Replacement:** without (per address, or per person if addresses are clustered).

**Pinned in the commitment (critical, and different from every other type).** The
**block height / slot number** and the **qualification rule** (which token, which contract,
minimum balance, whether staked/LP'd positions count, whether the treasury and team wallets
are excluded). Given those, *the snapshot is reproducible by anyone from public chain data*.
That is a much stronger position than any other promo type: the roster is not a claim, it is
a derivable fact. Publish the snapshot **file hash** too, so there's a checkable artifact,
but the block number is the real anchor.

**Snapshot timing must be committed before the block exists** — a *future* block height,
announced in advance, is the crypto-native analogue of the future-blockhash client seed the
README already recommends. Otherwise the operator picks a past block whose holder set they
already know and can grind the qualification rule ("minimum balance 500" vs "501") until the
list suits them. **Rule-grinding is the crypto-specific attack and nothing in the current
commitment stops it.**

**Audience must see.** Block height, exact query/rule, exclusion list, snapshot hash, entrant
count and total weight — enough that a third party can rebuild the list and get the same hash.

---

### 2.9 Bracket / tournament formats

**Entry list.** A seeded field, usually padded to a power of two with byes. **K:** one
champion, but the *whole bracket* is the output.

**Replacement.** Not applicable in the pool sense — elimination is structural (a loss removes
you), not a splice from a pool.

**Weighted?** Optionally — seeds can carry win probabilities (a 1-seed beats a 16-seed 85% of
the time). Note this makes it **not a fair draw**: entrants no longer have equal chances. That
is fine for entertainment brackets but must be loudly disclosed, because "provably fair" and
"the 1-seed is four times likelier" are compatible only if the weighting is public.

**Pinned in the commitment.** Roster, **the seeding** (a bracket's whole character is its
seeding, and an operator who sets seeds after seeing the field controls a lot), bracket shape,
bye placement, and any per-round upset probabilities.

**Audience must see.** The bracket structure before the draw; then each round resolving.

**Relationship to what exists.** `runRumble` is *already* a bracket-flavoured elimination
engine — it just uses a random-pairs-from-a-ring structure instead of a fixed tree, and it is
carefully symmetric so everyone still has exactly 1/N. A true bracket is a fourth mode: pair
positions 1v2, 3v4, …, resolve, recurse. If seeds are unweighted it stays exactly-fair and
it's an easy fourth animation. If seeds are weighted it becomes a different product.

**Note:** an unweighted single-elimination bracket over a *randomly shuffled* field gives
every entrant exactly 1/N — same fairness guarantee as the wheel, different theatre. That's
the version to build.

---

### 2.10 Milestone / referral bonus entries

"Base entry = 1. Follow = +1. Refer a friend = +3. Hit 10 referrals = +10 bonus."

**Entry list.** `identity, earned_weight` — the output of a *rules engine* run over an
activity log. Mechanically identical to 2.2 once the weights are final.

**Weighted?** Yes. **K:** ≥ 1. **Replacement:** person-without-replacement, normally.

**What is actually different from 2.2.** The weights are *derived*, and the derivation is
where trust breaks. In a plain weighted raffle the entrant knows they bought 50 tickets. In a
referral promo they think they earned 14 entries and the operator's sheet says 11. So the
commitment must cover not just the final weights but ideally the **earn ledger** — the
per-action record that produced them.

**Pinned in the commitment.** Final weights after the earn window *closes* — and the closing
time must be pre-announced, because an operator who closes the window at will can close it
right after a favoured entrant's referral lands.

**Audience must see.** The published earn ledger (or at minimum: each entrant able to see
their own final entry count *before* lock, with a dispute window). A weighted draw with a
dispute window that closes before the commitment is materially more credible than one where
weights appear alongside the winner.

**Engine change.** None beyond weights (2.2). The ledger is upstream of the engine — but the
*commitment* should hash the ledger file so the engine can attest to it.

---

### 2.11 Recurring scheduled draws — one commitment, many draws

"A winner every Friday for 12 weeks." This is the type FairDraw's `nonce` was built for, and
it is also where the README already admits the one remaining cryptographic gap.

**Entry list.** Two very different sub-models, and they need different treatment:

- **(a) Fixed pool, many draws.** One roster committed once; draw 1 winner per period,
  usually removing prior winners. All 12 draws are one permutation of the roster, revealed
  a slice at a time. **This is the clean case** — and it's just §2.5's "draw the full
  permutation once" with a reveal schedule attached.
- **(b) Fresh pool per period.** Each week has its own entrants. Each week needs its own
  roster commitment; the recurring part is only the *schedule*, not the randomness.

**Replacement.** (a) without, across the whole season. (b) per-draw choice; note that in (b)
a standing entrant who re-enters weekly is effectively drawing *with* replacement across the
season, which should be disclosed ("you can win more than once").

**Pinned in the commitment — the important bit.** The **schedule itself**, and the
nonce→draw mapping, published before the client seed exists. The README already prescribes
exactly this as prose ("Nonce 0 = grand prize. Nonce 1 = runner-up… No other draws will be
run under this commitment.") — the taxonomy's contribution is that **this should be
structured data inside `drawId`, not prose in a chat message.**

**The gap, precisely.** `drawId` hashes `commit|mode|winnerCount|contestants` — *not* the
nonce. So an operator can run nonces 0..9 and publish only the flattering one; every
published receipt verifies. For one-off draws this is a minor procedural note. For recurring
draws it is **the** failure mode, because running many draws is the advertised feature.

**Fix, in increasing order of strength:**

1. Put `nonce` in `drawId`. Now a receipt is bound to a specific draw index — but the
   operator can still just not publish nonce 3.
2. Commit to a **draw plan**: `[{nonce:0, label:"Week 1", ...}, ...]`, hash the whole plan
   into the Draw ID. Now the *count and labels* of intended draws are fixed in advance, so a
   missing receipt is a visible hole rather than an invisible one. Cheap, and it's the single
   highest-value integrity improvement available.
3. Per-period client seeds (each Friday's seed = that day's BTC block hash, height announced
   in the plan). This removes the "operator knew all outcomes at commit time" objection
   entirely — with a fixed client seed and a known seed, the operator knows all 12 winners on
   day 1, which is not *unfair* but is a bad look and enables selective disclosure of the
   whole season.

**Audience must see.** The plan up front, then every receipt in sequence. A published
sequence with nonce 5 missing is legible to anyone; an unpublished nonce in an unplanned
sequence is invisible. That asymmetry is the entire value of the plan.

## 3. Visualisation at scale — where the wheel stops working

### 3.1 The three ceilings, and why only one of them matters

A wheel hits **three separate limits at very different entrant counts**, and they are usually
conflated. FairDraw already handles the first one (labels hidden past 60 slices, winner shown
in the hub).

| # | Ceiling | Where it bites | Symptom | FairDraw status |
| --- | --- | --- | --- | --- |
| 1 | **Label legibility** | ~40–60 entries | Names shrink below ~10px or overlap at the rim | ✅ solved (hide past 60, hub display) |
| 2 | **Slice distinguishability** | ~200–400 entries | Slices are 1° or less; adjacent colours blur into a gradient ring; a viewer cannot tell *which* slice the pointer landed on | ❌ unsolved |
| 3 | **Render/DOM cost** | ~2,000 (SVG) / ~100,000 (canvas) | Frame drops, jank, tab hangs | not yet a problem |

**Ceiling 2 is the real one, and it is not a performance problem — it is an evidentiary one.**
A wheel is not decoration in a provably-fair product; it is the audience's *witness* to the
draw. Its whole job is to let a viewer see the pointer land on a specific slice and believe
the result was not swapped afterwards. Once a slice is narrower than the pointer graphic, the
viewer can no longer resolve which slice won — so the animation has stopped being evidence and
become theatre. Concretely, at a 400px radius:

- **N = 60** → 6.0° per slice ≈ 42px of rim arc. Clearly resolvable, labels fit.
- **N = 360** → 1.0° per slice ≈ 7px of rim arc. About the width of the pointer tip. **This is
  the honest ceiling of the wheel-as-proof.**
- **N = 1,000** → 0.36° ≈ 2.5px. Thinner than a border stroke; the wheel renders as a
  solid colour ring.
- **N = 10,000** → 0.036° ≈ 0.25px — sub-pixel. Most slices do not render *at all*; the
  rasteriser drops them, so the wheel is literally not showing the roster.

**The sub-pixel point deserves emphasis:** past a few thousand entries the wheel is not merely
hard to read, it is *actively misleading* — it displays a shape that does not contain most
entrants. A viewer who "watched the wheel" at N = 50,000 watched a picture of roughly 3,000
randomly-surviving slices.

### 3.2 What real tools actually do

**Wheel of Names** (the category leader) caps the wheel at **1,000 displayed names**, stating
plainly that the cap exists "because the names become too small to read if more are
displayed." Above the cap it keeps the full list in the text box and **randomly samples fresh
names onto the wheel as it spins**, so every entrant retains an equal chance while only a
subset is ever drawn on screen ([Wheel of Names FAQ](https://wheelofnames.com/faq)).

This is the single most important precedent in this section, and it is worth being precise
about what it means: **the leading wheel product decouples the wheel from the roster.** The
wheel becomes a *sampling animation* rather than a depiction of the entry list. It is honest
about equal odds, but note it is **not** something FairDraw can copy verbatim — a randomly
resampled wheel is not replayable from a receipt unless the resampling is itself drawn from
the committed byte stream. If FairDraw does this, the sampling must come from the same
`FairRng` and be part of the verifiable transcript, or the animation and the receipt diverge.

Observed patterns across the market at each scale:

| Entrants | What tools show | Examples |
| --- | --- | --- |
| **≤ 60** | True wheel, all labels visible | every wheel tool; FairDraw today |
| **60 – 1,000** | Wheel with labels suppressed; winner revealed in the hub or a modal | Wheel of Names, PickerWheel, FairDraw today |
| **~1k – 10k** | **Abandon the wheel.** Slot-machine / odometer name-roller, a scrolling column that decelerates onto the winner, or a rapid-shuffle "name flicker" that settles | Comment Picker, most Instagram picker tools, RandomPicker |
| **10k – 100k+** | **No animation of the roster at all.** A count ("47,213 valid entries"), then the winner(s) revealed as text, backed by a verification page / certificate | RANDOM.ORG Third-Party Draw Service, RandomPicker, ViralSweep, all enterprise sweepstakes administrators |
| **National scale** | Numbers, never names — the roster is a *range* and is never enumerated | NS&I Premium Bonds / ERNIE ([NS&I](https://www.nsandi.com/get-to-know-us/about-premium-bonds)) |

The pattern is consistent and blunt: **above roughly 10,000 entrants, credibility comes from a
verification artifact, not from an animation.** Serious high-volume draws show a certificate,
a record page and an auditor's name. Nobody spins anything.

### 3.3 Recommended ladder for FairDraw

The engine is mode-agnostic, so this is purely a presentation ladder keyed on N — and it maps
neatly onto §2.3's insight that large draws should be *ranges*, not rosters.

1. **N ≤ 60** — wheel, full labels. (today)
2. **60 < N ≤ 400** — wheel, no labels, winner in hub, **plus a printed slice index**
   ("slice 1,847 of 5,000") so the result is checkable as a number when it is not checkable
   as a picture. Cheap, and it directly patches ceiling 2.
3. **400 < N ≤ 10,000** — drop the wheel by default; offer a **decelerating roller** (a
   vertical strip of names scrolling and easing to a stop on the winner). This is the format
   the market converged on and it is the one visual that stays honest at 4 figures because it
   only ever claims to show a *window* into the list, never the whole list.
4. **N > 10,000** — **no roster animation.** Show entrant count, the range or roster hash, a
   countdown, then the winner(s) and the receipt. If a range (§2.3), animate a **numeric
   odometer rolling to the winning number** — this scales to any N because it depicts the
   *number*, not the roster, and at 100k+ the number genuinely is the roster.

The odometer is the sleeper recommendation: it is the only visual in this list whose honesty
is independent of N, it is trivial to implement, and it is exactly what a numbered-ticket draw
(the type §2.3 identified as FairDraw's strongest) actually needs.

**Rumble and RPG modes have a much lower ceiling than the wheel** and this should be stated in
the UI. `runRpg` is O(rounds × living) with a 300-round cap and `runRumble` emits an event per
entrant plus one per elimination — at N = 10,000 the event log alone is ~20,000 objects, and
narrating it is hours of animation. Practical cap: **~100 for RPG, ~200 for rumble**, purely
because the *story* is the point and a story with 10,000 characters is not a story. Gate them
in the UI rather than letting a user pick a mode that will hang the tab.

## 4. How entrant lists are actually supplied

### 4.1 The six real intake channels

Nobody types a roster. In practice a list arrives as one of six things, and the shape of each
one dictates a different pre-draw normalisation step:

| Channel | Format | Typical size | Row granularity | Dedup burden |
| --- | --- | --- | --- | --- |
| **Giveaway-platform export** (Gleam, SweepWidget, RafflePress) | CSV | 100 – 100k | **one row per action** | Platform already identified the user; you collapse actions → weight |
| **Google Sheet / manual CSV** | CSV, pasted range | 10 – 5k | one row per person (usually) | Operator's problem; near-duplicate names are rife |
| **Social comment scrape** (IG/TikTok/YouTube) | CSV, JSON, XLS | 100 – 500k | **one row per comment** | Heavy — the same user comments 50× |
| **Wallet snapshot** (Solana/EVM) | CSV | 100 – 100k | one row per address | None (addresses are canonical) but Sybil risk |
| **Discord role** | bot-side query or CSV export | 50 – 50k | one row per member | None (snowflake IDs are canonical) |
| **Numbered tickets** | *a range*, no file at all | any | n/a | **none — see §2.3** |

**The single most important structural fact in this section:** three of the six channels
deliver **one row per entry, not one row per person**. A 3,000-row comment export may contain
800 humans. So the *first* thing FairDraw must do with an uploaded file is ask the operator to
choose a collapse policy — and that choice is exactly the §2.2 replacement-semantics choice
resurfacing at intake time. It must be committed, because "3,000 rows" and "800 people" are
different draws with different odds.

### 4.2 What a Gleam export/import actually looks like

Gleam is now the dominant survivor in this category (see §4.3), so its shape is the de facto
standard.

**Import format** — Gleam's Advanced Import accepts a CSV with these recognised columns
([Gleam docs](https://gleam.io/docs/general/advanced/import)):

| Column | Required | Meaning |
| --- | --- | --- |
| `Full Name` | yes | entrant's name |
| `Email Address` | yes | entrant's email — the identity key |
| `Worth` | optional | **how many entries the row is worth**; overrides the action's default entry count |
| `Details` | conditional | action-specific payload (answer text, phone, address) |
| `Import: <anything>` | optional | prefixed custom columns are forced into the user's Details |

Gleam ignores any column it does not recognise.

**Export formats** — all CSV ([Gleam FAQ](https://gleam.io/faq/competitions/data/can-i-export-my-data)):

- **Actions export** — one row per completed action, with the user, *which* action they
  completed, user-generated responses (phone, address, testimonial) and **opt-in consent
  flags**.
- **Winners export** — the winning *entries*, with user details and the winning entry.

Two things to steal from this design. First, **`Worth` is the entire weighting model** — a
single integer column, exactly the `name,weight` pair §2.2 specifies. Second, the actions
export carries **opt-in consent flags**, which is a reminder that the intake file is PII and
that §2.3's no-roster numbered-ticket path avoids a real problem, not a hypothetical one.

### 4.3 Rafflecopter — and the market gap

**Rafflecopter shut down on 1 October 2025 after 15 years**, with data export available only
until 30 September 2025 ([Rafflecopter farewell](https://www.rafflecopter.com/),
[RandomPicker](https://www.randompicker.com/blog/rafflecopter-shutdown/)). Its CSV export
contained **entrant name, email, entry-option info, IP address and timestamp**, with **one row
per entry** — so a 10,000-row file was routinely a few thousand people
([Rafflecopter KB](https://kb.rafflecopter.com/hc/en-us/articles/204521719-How-can-I-check-my-giveaway-s-entries)).

This matters for FairDraw beyond format archaeology: **a very large installed base of bloggers
and small brands was turned loose in late 2025** and scattered across Gleam, RafflePress,
SweepWidget and comment pickers. Those users have historical Rafflecopter CSVs sitting on
disk. "Paste your old Rafflecopter export" is a real, dated, and currently unserved import
path — and the IP-address column in those files is a live privacy liability that an importer
should strip rather than hash into a Draw ID.

### 4.4 Comment scrapes, wallet snapshots, Discord roles

**Comment scrapes.** Tools like Comment Picker and ExportComments pull public post comments
to CSV/JSON/XLS with a standard filter set that is effectively the genre's spec
([Comment Picker](https://commentpicker.com/instagram-comment-picker.php)):

- filter duplicate comments from the same user (**toggleable** — off means engagement is
  weighted by comment count)
- **"tag N friends"** — counts `@username` tokens per comment and drops comments below the
  threshold
- limit entries per user
- **manual bonus entries that "bypass all filters"** — the free-bonus-entry mechanic in the
  wild, and note it is applied *outside* the verifiable pipeline, which is precisely the
  credibility hole FairDraw's committed earn-ledger (§2.10) closes

Typical columns: `username`, `comment text`, `timestamp`, `comment id`, `mentions/tags`,
`likes`. Note **there is no email** — the handle is the only identity, so winner contact is
"DM the handle", and impersonation of an announced winner is a known attack.

**Wallet snapshots.** Solana/EVM snapshot tools export **`wallet address`, `amount held`,
`% of supply`** at a chosen block/slot, and several also emit a **Merkle tree** of the
snapshot ([Smithii](https://tools.smithii.io/snapshot-token/solana),
[docs](https://docs.smithii.io/products/tools/solana/nft-tools/snapshot-nft-holders)). The
Merkle-root option is worth noting: it is a *better* commitment primitive than a file hash
because an individual holder can prove their own inclusion without the operator republishing
the whole list — the privacy-preserving version of §2.8's "publish the snapshot hash".

**Discord roles.** Entry is "has role X", resolved bot-side rather than by file; exports are
member-list CSVs of snowflake IDs and usernames
([Dis-GuildAudit-CSV](https://github.com/awwbots/Dis-GuildAudit-CSV)). Notably, at least one
giveaway bot already **exports the entry list *and the draw seed* as CSV**, explicitly framed
as what you show when "a winner disputes the result"
([VibeBot](https://www.vibebot.gg/features/giveaways)) — independent confirmation that the
market wants exactly the artifact FairDraw produces, it just produces it without a commitment.

**Wallet-plus-social hybrids.** SweepWidget collects ETH/Solana/BTC/BEP-20 addresses as an
*entry method* alongside Discord join ([SweepWidget](https://sweepwidget.com/examples/discord)),
which is how allowlists actually get built. The roster is then `handle + wallet` — two identity
columns, and the draw must state which one is the dedup key.

### 4.5 The canonical column set FairDraw should accept

Synthesising all six channels, the union is small. A permissive importer needs to recognise:

| Canonical field | Aliases seen in the wild | Role |
| --- | --- | --- |
| **identity** | `Full Name`, `Email Address`, `username`, `handle`, `wallet`, `address`, `user id`, `Discord ID` | the dedup key — **operator must pick which column is authoritative** |
| **weight** | `Worth`, `entries`, `entry count`, `amount`, `balance`, `tickets` | integer bonus entries (§2.2) |
| **label** | `First Name` + `Last Name`, display name | what is shown/announced (may differ from the key) |
| **timestamp** | `entered at`, `created_at`, `date` | needed only for §2.6 ordinal/instant-win |
| **reason** | `entry option`, `action`, `entry method` | the earn ledger (§2.10) |
| *ignore/strip* | `IP address`, consent flags, comment text | PII with no draw role — **do not hash into the Draw ID** |

Design recommendation: **the importer's output is a two-column canonical roster
(`identity`, `weight`) plus an optional display label, and that canonical form — not the
uploaded file — is what gets hashed.** Hashing the raw file is tempting but wrong: it binds
the commitment to incidental columns (IP addresses, consent flags, column order, line endings,
BOM) that have nothing to do with the draw and cannot be independently reconstructed by a
verifier. Publish the *canonical* roster and hash that; offer the raw file separately if the
operator wants to.

## 5. What a credible winner announcement / receipt contains

A credible announcement has **three independent halves** (yes, three) and failing any one of
them sinks the other two. FairDraw is currently excellent at the first, silent on the second,
and out of scope on the third — which is fine, but the receipt should *reference* the third
rather than pretend it doesn't exist. Legal specifics are covered in depth in
`02-legal-compliance.md` §5, §6 and §10E; this section only covers what belongs **in the
artifact**.

### 5.1 The cryptographic half — "the result was not chosen"

FairDraw already emits all of this (`sample-receipt.json`):

- `commit` — SHA-256 of the server seed, published **before** the draw
- `serverSeed` — revealed after, so anyone can check it opens the commit
- `clientSeed` — entropy the operator could not choose
- `nonce`, `mode`, `winnerCount`, `contestants`, `winners`, `drawnAt`
- `drawId` — binds roster + mode + K to the commitment
- a **runnable independent verifier** (`verify.js`) — the part most competitors lack entirely

### 5.2 The procedural half — "the result was not *framed*"

This is where nearly all real disputes live, and none of it is cryptographic. A commitment
proves *which list* was drawn from; it cannot prove the list was the *right* list, that the
draw happened when claimed, or that it happened only once. The announcement therefore needs:

1. **Roster provenance and entrant count** — where the list came from (Gleam export, snapshot
   at slot N, tickets 1–5000), how it was normalised, and how many entries there are. "4,812
   valid entries" is the number an entrant checks their intuition against.
2. **An external timestamp on the commit.** The commit must be provably prior. A `drawnAt`
   field is operator-asserted and worth nothing on its own. Anchors, cheapest first: post the
   commit publicly (a tweet/Discord message with a platform timestamp), or use a future
   blockhash as the client seed — which anchors the draw *and* proves the operator could not
   have known the outcome at commit time. **The client seed's provenance is the single most
   load-bearing non-cryptographic claim in the whole receipt** and it currently travels as a
   free-text string (`"btc-block-871402"`). It should be a structured, checkable reference.
3. **The exhaustive draw list.** Declaring in advance how many draws exist under this
   commitment (§2.11's draw plan). Without it, selective publication is invisible.
4. **Rules that were fixed in advance**: prize→rank map (§2.4), alternate promotion rule and
   claim window (§2.5), replacement semantics (§2.2), unsold-ticket policy (§2.3).
5. **Who ran it.** An identified operator. RANDOM.ORG's public record includes "your company
   name as owner of the drawing" ([RANDOM.ORG](https://www.random.org/draws/description/)) —
   an anonymous draw is unaccountable regardless of its maths.

RANDOM.ORG's Third-Party Draw Service is the best benchmark for what a record should contain
and it is instructive that **almost none of it is cryptographic**: owner name, exact UTC time,
identifiers of *all* entrants, the winning entrants, retained and publicly verifiable **for at
least five years**, with per-draw visibility settings (public / private / entrant-accessible)
([RANDOM.ORG](https://www.random.org/draws/description/)). Two takeaways: **durability is a
feature** (a receipt that 404s in a year proves nothing), and **entrant-accessible** is a smart
middle setting — an entrant can look up their own identifier without the world getting the
roster, which pairs naturally with §4.4's Merkle-proof idea.

### 5.3 The regulatory half — the winners list

Distinct from the proof, and legally mandated rather than optional. Briefly (see
`02-legal-compliance.md` §5–§6 for the authoritative treatment):

- Official Rules must state **how and when winners are notified**, the response window
  (commonly 48 hours to 10 days), and how to obtain a **winners list**.
- For prizes over $600 the winner typically signs an **Affidavit of Eligibility and
  Liability/Publicity Release** — and this should be obtained **before** the identity is
  publicly announced ([Klein Moynihan Turco](https://kleinmoynihan.com/sweepstakes-winner-affidavits/),
  [Sweeppea](https://www.sweeppeasweeps.com/official-rules-center/affidavits-of-eligibility-publicity-liability-releases-understanding-sweepstakes-rules-requirements/)).

**This creates a direct, easily-missed conflict with the transparency instinct**: the fairness
proof wants the winner published immediately; the legal process wants them verified before
publication, and they may be disqualified. The resolution is the one §2.5 already argues for —
**publish the full committed ordered permutation at draw time, and the *claim outcome*
separately as it resolves.** The draw is announced instantly and immutably; who ultimately
receives the prize is a later, auditable event against a list nobody can alter. Announcing
"the draw produced this order" is a different speech act from "this person won the PS5", and
conflating them is what forces operators into unverifiable redraws.

### 5.4 Gap analysis vs. FairDraw's current receipt

| Item | In receipt today | Verdict |
| --- | --- | --- |
| Commit / seed / replay | ✅ | Best-in-class, incl. independent verifier |
| Draw ID binding roster+mode+K | ✅ | Good |
| **Nonce inside `drawId`** | ❌ (known gap) | **Fix first** — selective publication |
| **Draw plan / expected draw count** | ❌ | High value, cheap (§2.11) |
| **Entrant count** as a first-class field | ❌ (derivable from array) | Add — meaningless for ranges otherwise |
| **Roster kind + provenance** (list vs range vs snapshot@slot) | ❌ | Required for §2.3 and §2.8 |
| **Client seed provenance** (structured, not free text) | ❌ | Highest-value procedural fix |
| **Prize→rank map** | ❌ | Needed for §2.4 |
| **Full ordered standings** (not truncated to K) | ❌ (computed, discarded) | Nearly free; unlocks §2.4/§2.5/§2.9 |
| **Alternate rule + claim window** | ❌ | Text field is enough |
| Operator identity | ❌ | One string |
| Weights + total + replacement semantics | ❌ | Needed for §2.2/§2.10 |
| Durable hosted record | ❌ (JSON file) | The receipt must outlive the tab |

**One thing FairDraw does that the incumbents do not, and should say loudly:** the receipt is
*replayable by a third party from an independent implementation*. Comment pickers issue
certificate images; Discord bots export a seed; RANDOM.ORG hosts a record you must trust them
to keep honest. A downloadable JSON that a stranger can re-run offline and get the same winners
is a categorically stronger artifact than any of those — and the *pre*-committed hash is what
makes it stronger than RANDOM.ORG, whose record is authoritative only because RANDOM.ORG
says so.

## 6. Highest-leverage mechanics — most promo types per unit of engine work

Ranked by (types unlocked) ÷ (engine work). These are the recommendations.

**1. Publish the full ordered permutation, not a truncated winners list.** `runRumble` and
`runRpg` already compute complete `standings` and discard everything past K; `runWheel` needs
only to keep splicing. `winnerCount` becomes a *presentation* cut, not a draw parameter.
→ Unlocks **tiered/multi-prize (§2.4), alternates/runner-ups (§2.5), most of brackets (§2.9),
and fixed-pool recurring draws (§2.11a)**. Four types. Roughly a day of work. Also removes the
strongest incentive to redraw, which is the biggest integrity win available. **Do this first.**

**2. Make a numeric range a first-class roster kind.** Hash `range:1-5000` instead of the
100,000-element expansion; draw with `nextInt` + a seen-set.
→ Unlocks **numbered-ticket draws (§2.3)** outright, and with them: no roster publication, no
PII, no CSV, a human-readable commitment, legal "more tickets = more chances" *without any
weighting code*, and O(K) memory at 100k+ entrants. It is also the only promo type where
FairDraw's proof is complete end-to-end rather than from-the-roster-onward.

**3. Integer weights + committed replacement semantics.** Cumulative-weight prefix array,
binary search, `nextInt(totalWeight)`. Name it **"bonus entries"**, never "odds boost".
→ Unlocks **free-bonus-entry giveaways (§2.10)**, **token-weighted snapshots (§2.8b)**, and
loyalty tiers. The replacement choice (ticket-wise vs person-wise) must be in the Draw ID.

**4. Put the nonce in the `drawId`, and commit a draw plan.** A structured
`[{nonce, label}, …]` hashed into the commitment.
→ Unlocks **recurring scheduled draws (§2.11)** honestly, and closes the one known
cryptographic gap. A missing receipt becomes a *visible hole*. Cheapest high-integrity fix.

**5. A metadata envelope on the receipt.** Roster kind + provenance, entrant count, structured
client-seed reference, prize→rank map, alternate rule and claim window, operator identity.
→ No new draw logic at all, and it is what makes the receipt *credible* rather than merely
correct (§5.2). Most disputes are procedural, not cryptographic.

Deliberately **not** recommended as early work: instant-win slot spaces (§2.6, needs an entry
log the operator controls — the weakest link is outside the engine), and weighted brackets
(§2.9, stops being a fair draw and muddies the pitch).

---

## 7. Sources

**Wheel / visualisation at scale**
- Wheel of Names FAQ — 1,000-name display cap, rationale, resampling above the cap: https://wheelofnames.com/faq
- NS&I Premium Bonds / ERNIE — national-scale draws over number ranges, not rosters: https://www.nsandi.com/get-to-know-us/about-premium-bonds
- Picker Wheel: https://pickerwheel.com/tools/random-number-generator/

**Third-party draw records / verification**
- RANDOM.ORG Third-Party Draw Service, description (record contents, 5-year retention, public / private / entrant-accessible): https://www.random.org/draws/description/
- RANDOM.ORG draw service: https://www.random.org/draws/ · API: https://api.random.org/json-rpc/4/draws
- RANDOM.ORG Guide to Random Drawings: https://www.random.org/guides/draws/

**Giveaway platform exports**
- Gleam Advanced Import — `Full Name`, `Email Address`, `Worth`, `Details`, `Import:` prefix: https://gleam.io/docs/general/advanced/import
- Gleam — can I export my data (Actions export, Winners export, all CSV): https://gleam.io/faq/competitions/data/can-i-export-my-data
- Rafflecopter farewell — platform closed 1 Oct 2025, exports until 30 Sep 2025: https://www.rafflecopter.com/
- Rafflecopter KB, checking entries / CSV contents (name, email, entry option, IP, timestamp) — *note: retrieved via search index; direct fetch returns HTTP 403 post-shutdown, treat as second-hand*: https://kb.rafflecopter.com/hc/en-us/articles/204521719-How-can-I-check-my-giveaway-s-entries
- RandomPicker on the Rafflecopter shutdown: https://www.randompicker.com/blog/rafflecopter-shutdown/
- Gleam — Rafflecopter alternatives: https://gleam.io/blog/rafflecopter-alternatives/

**Comment scrapes**
- Comment Picker (Instagram) — dedup toggle, tag-N-friends filter, entry limits, bonus entries that bypass filters, certificate/results page: https://commentpicker.com/instagram-comment-picker.php
- ExportComments giveaway picker — CSV/JSON export, filters: https://exportcomments.com/instagram-giveaway-picker
- Woobox Instagram comment picker: https://woobox.com/instagram-comment-picker

**Crypto snapshots**
- Smithii Solana token snapshot — wallet address, amount, % of supply, CSV, Merkle tree: https://tools.smithii.io/snapshot-token/solana
- Smithii NFT holder snapshot docs: https://docs.smithii.io/products/tools/solana/nft-tools/snapshot-nft-holders
- Open-source Solana NFT holder snapshot: https://github.com/joaoh82/solana_nft_snapshot

**Discord / multi-channel entry**
- VibeBot giveaways — role requirements, multiple winners, **entry list and draw seed exportable as CSV for disputes**: https://www.vibebot.gg/features/giveaways
- Sx Bot — required-role filtering: https://docs.sxbot.io/giveaways/create-a-giveaway
- Dis-GuildAudit-CSV — guild member export: https://github.com/awwbots/Dis-GuildAudit-CSV
- SweepWidget Discord + wallet-address entry methods (ETH/SOL/BTC/BEP-20): https://sweepwidget.com/examples/discord

**Winner announcement / sweepstakes procedure** (see `02-legal-compliance.md` for authority)
- Klein Moynihan Turco — sweepstakes winner affidavits: https://kleinmoynihan.com/sweepstakes-winner-affidavits/
- Sweeppea — affidavits of eligibility & publicity/liability releases: https://www.sweeppeasweeps.com/official-rules-center/affidavits-of-eligibility-publicity-liability-releases-understanding-sweepstakes-rules-requirements/
- Realtime Media — 10 key sweepstakes legal requirements: https://www.rtm.com/blog/sweepstakes-legal-requirements
- Fasthoff Law Firm — what official rules need to include: https://fasthofflawfirm.com/blog/sweepstakes-official-rules

**Internal**
- `C:\Users\Jarjl\Projects\FairDraw\engine.js` — capability baseline (§0)
- `C:\Users\Jarjl\Projects\FairDraw\sample-receipt.json` — current receipt shape (§5.4)
- `C:\Users\Jarjl\Projects\FairDraw\research\02-legal-compliance.md` — consideration, AMOE, official rules, record-keeping
