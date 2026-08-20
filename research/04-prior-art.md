# 04 — Prior Art & Competitive Landscape

**Status: COMPLETE.** Date: 2026-08-16.

## Contents
1. Giveaway / raffle platforms (Gleam, Woobox, SweepWidget, RafflePress, ViralSweep, KingSumo)
2. Random pickers (random.org Signed API + Third-Party Draw Service, wheelofnames.com, Comment Picker)
3. Provably-fair gambling (Stake, BC.Game, Roobet) — seed pair / nonce / verify page UX
4. Crypto-native raffles (Chainlink VRF, Solana VRF: Switchboard / ORAO, NFT raffle platforms)
5. Streamer / creator tools + real complaints, incl. RANDOM.ORG Multi-Round Giveaways
6. Comparison table with "verifiable?" column
7. Direct answers: standard verification UX / the gap / top complaints / table stakes

**One-line finding:** entertaining draws and real cryptographic proof exist in entirely
separate products; the only thing near the middle is RANDOM.ORG's Multi-Round Giveaway
Service, whose proof is a paid lookup that expires after one month.

Given (not re-researched): Rafflecopter shut down 1 Oct 2025; Wheel of Names caps at 1000 slices; paid-entry weighting is legally off the table.

---

## 1. Giveaway / raffle platforms

The headline finding: **none of the mainstream giveaway platforms offer cryptographic
verifiability.** The strongest claim any of them makes is "we call random.org" or "the
result is auditable in your dashboard" — i.e. the *operator* can audit it, not the
audience. The audience gets a name and a promise.

### Gleam.io
- **Winner drawing:** Gleam's docs state plainly that it "uses Random.org to draw
  winners, they offer true randomness."
  (<https://gleam.io/docs/competitions/post-campaign/random-winners>). Winners are
  numbered 1..N when multiple are drawn and tied to the specific action they completed.
  Gleam does *not* publish a random.org signed record or serial number to entrants — the
  API call happens server-side and the entrant sees only the announced name.
- **Verifiability:** Gleam's own fairness FAQ
  (<https://gleam.io/faq/legal-and-compliance/how-to-generate-confidence-in-winner-picking-process>)
  recommends *procedural* trust-building, not proof: "use a third-party tool like quick
  draw that randomizes selection", "make the draw public or share proof of the process",
  "clearly state your selection method in the giveaway terms", "keep entry records". No
  cryptographic proof, no third-party-checkable artifact. This is the industry's
  self-declared state of the art and it is entirely trust-us.
- **What the audience sees:** a competition page with a status colour (undrawn / drawn
  but unannounced / publicly announced) and eventually a winner name. Gleam does not even
  contact winners automatically — the organiser does.
- **Pricing:** Competitions has a free tier; Business Growth apps from ~$19/mo
  (<https://gleam.io/pricing/competitions>, <https://gleam.io/pricing>).
- **Anti-fraud:** duplicate-IP, disposable-email and bot-pattern filtering before results.
  Note this is *entry control*, a different axis from randomness integrity — and it is the
  axis FairDraw explicitly does not address (README "What this proves — and what it does
  not").

### Woobox
- **Winner drawing:** free "Pick a Winner" / comment-picker tools
  (<https://woobox.com/pickawinner>, <https://woobox.com/facebook-comment-picker>).
  Woobox's own guidance article is literally titled "How to Pick a Giveaway Winner (Random
  and Verifiable)" (<https://woobox.com/articles/how-to-pick-a-giveaway-winner>) — but
  "verifiable" there means: every draw is **logged with a timestamp and the eligible-entry
  count**, and the operator is told to keep "the seed, certificate, or screenshot from the
  random method". A screenshot is the evidentiary standard being recommended in 2026.
- **Verifiability:** none cryptographic. The audit trail is operator-held and
  operator-editable. Help docs: <https://help.woobox.com/articles/how-can-i-pick-a-winner/>
- Interesting: Woobox's blog post "Winner Picker, How do they do that?"
  (<https://blog.woobox.com/2015/04/winner-picker-how-do-they-do-that/>) is a decade-old
  explainer, indicating the category has not moved on the trust question since 2015.

### KingSumo
- **Winner drawing:** operator clicks "Ready to Award" and the system randomly picks
  (<https://help.kingsumo.com/article/234-how-is-the-winner-of-a-giveaway-selected>,
  <https://wordpress.kingsumo.com/ufaqs/kingsumo-draw-winner/>). Weighted by bonus entries
  (referrals, daily entry, watch-a-video, click-a-link).
- **Verifiability:** none. No published seed, no record, no external randomness source
  disclosed.
- **Known weakness (widely repeated):** share-tracking is gameable — a user can click the
  share button and be credited without actually sharing
  (<https://rafflepress.com/kingsumo-review/>). Because entries are *weighted*, a gameable
  entry mechanic directly distorts win probability, which is a fairness failure even if the
  RNG is perfect.

### SweepWidget / ViralSweep / RafflePress
- **Pricing (2026):** SweepWidget free tier, Pro $29/mo, Business $59/mo, Premium $119/mo.
  ViralSweep Starter $49/mo, Business $199/mo ($166 annual), Premium $399/mo ($333 annual)
  (<https://www.itqlick.com/viralsweep/pricing>). RafflePress is a WordPress plugin from
  ~$39.50/yr (~$3.30/mo)
  (<https://slashdot.org/software/comparison/RafflePress-vs-SweepWidget-vs-ViralSweep/>).
- **Verifiability:** all three draw winners server-side from their own entry database and
  surface a winner in the operator dashboard. None publish a pre-committed seed, a signed
  record, or anything a contestant can independently recompute.
- Comparison roundups confirming the field and the post-Rafflecopter scramble:
  <https://www.rafflr.io/best-rafflecopter-alternatives-2026.html>,
  <https://copywritersnow.com/rafflecopter-alternatives/>,
  <https://sourceforge.net/software/compare/Rafflecopter-vs-SweepWidget-vs-ViralSweep/>

### Category conclusion (§1)
The giveaway-platform category competes on **entry mechanics and virality** (how many
social actions you can bolt on, how many entries you can harvest), not on **draw
integrity**. Draw integrity is treated as a checkbox satisfied by the phrase "random.org"
or "randomly selected". The audience-facing artifact is, in every case, a name plus at
best a screenshot.

---

## 2. Random pickers

### 2.1 RANDOM.ORG — the most credible prior art, in two distinct products

RANDOM.ORG is the only non-gambling product in this landscape that ships **real
third-party-checkable cryptographic evidence**. It does it two different ways, and the
distinction matters a lot for FairDraw.

#### (a) The Signed API — a signature, not a commitment

Docs: <https://api.random.org/json-rpc/4/signed>, <https://api.random.org/signatures>

Every `generateSigned*` call returns a `result` containing two things you keep forever:

| Field | Contents |
| --- | --- |
| `random` | The signed object. Contains: `method` (echoes e.g. `generateSignedIntegers`), `hashedApiKey` (base64 SHA-512 of the caller's API key — identifies *who* drew without exposing the key), `data` (the actual values), `license`, `userData` (caller-supplied, max 1000 chars), `ticketData`, `completionTime` (ISO 8601 UTC), `serialNumber` (per-API-key sequential counter), plus the request parameters (`n`, `min`, `max`, `replacement`, `base`, `pregeneratedRandomization`) |
| `signature` | Base64 signature over the `random` object, made with RANDOM.ORG's **private** key |

Response also carries `cost`, `bitsUsed`, `bitsLeft`, `requestsLeft`, `advisoryDelay`.

**How a third party verifies.** Three steps, no account needed:
1. JSON-encode the complete `random` object exactly as received.
2. SHA-512 digest it.
3. Verify `signature` against that digest with RANDOM.ORG's public key, published at
   <https://api.random.org/server.crt>.

There are three verification surfaces, and this is the part worth studying:
- **`verifySignature` JSON-RPC method** — machine verification.
- **A paste-in web form**: <https://api.random.org/signatures/form> — you paste the
  `random` JSON in one box and the `signature` in another, press verify, get a
  yes/no. Sample values for every method type are provided so a first-time visitor can
  see it work before they have their own record.
- **A "Manual Verification" walkthrough** for people who want to do the SHA-512 and the
  RSA check themselves with standard tools.

That trio — *machine API + paste-in form + do-it-yourself-with-standard-tools* — is
exactly the shape of FairDraw's existing `verify.js` + Verify tab + the "10-second
paranoid check" one-liner in the README. FairDraw has independently landed on the
credible pattern.

**Pre-commitment via `userData`.** RANDOM.ORG explicitly documents the commit problem and
solves it with the `userData` field: *"when you request random values, it can be useful to
make a commitment to how you will use the values before you actually see them"* — you put
the intended use in `userData`, RANDOM.ORG includes it inside the signed `random` object,
so the signature proves the commitment existed before the values and cannot be changed
after. `serialNumber` additionally makes suppressed draws detectable: the counter is
sequential per API key, so a gap in a published series is visible. **This is RANDOM.ORG's
answer to precisely FairDraw's unsolved nonce problem** (README: "Nothing in a receipt
proves it was the first draw you ran, or the only one").

**Tickets.** `createTickets` returns `ticketId` values; passing one to a signed call
records that the ticket was used, and each ticket is single-use
(<https://api.random.org/json-rpc/4/signed>). This gives an audit chain of *which* draw
consumed *which* pre-issued ticket.

**Structural weakness vs FairDraw:** a RANDOM.ORG signature proves *RANDOM.ORG produced
these values at this time*. It does **not** let you recompute the result yourself — you
must trust RANDOM.ORG's key and RANDOM.ORG's honesty. FairDraw's commit-reveal is
*trustless replay*: anyone re-derives the winner from the seeds. Different, arguably
stronger, guarantee — but it requires no third party, which is also the selling point.

#### (b) The Third-Party Draw Service — the permanent public record

<https://www.random.org/draws/>, <https://www.random.org/draws/description/>,
<https://www.random.org/guides/draws/>, API:
<https://api.random.org/json-rpc/4/draws>

Workflow: account setup → upload entrant identifiers (one per line; **repeat an identifier
to give that entrant multiple chances**) or paste into a web form → the service validates
(flags blank lines, warns on duplicates) and gives a final review screen → draw runs on
atmospheric noise → a **permanent record** is published on random.org.

The permanent record contains: owner/company name, exact UTC time, identifiers of all
entrants, and the winning entrants. Once completed **it cannot be modified or deleted and
persists at least five years.**

Three record visibilities — this is a genuinely good design worth copying:
- **Private** — only the owner's login sees it. For "I expect to be audited but don't want
  the world reading my entrant list."
- **Entrant-accessible** — full details visible only to the owner, but an entrant who
  knows their own identifier can query the record and learn (i) that the drawing happened,
  (ii) whether they were entered, (iii) whether they won. Solves the privacy/verifiability
  conflict without exposing everyone's email to everyone.
- **Public** — anyone can view everything.

Subscribers can also get a written statement confirming RANDOM.ORG ran the draw, and may
use the RANDOM.ORG name in promotional material. **That is the actual product being sold:
borrowed credibility.** Note that the record is created *after* the draw — the service is
a notary, not a commitment scheme. There is no published-before artifact.

**Who uses it:** Gleam calls RANDOM.ORG server-side (§1) but does not expose signed
records or draw-service permanent records to entrants — so the credibility stops at
Gleam's marketing copy and never reaches the audience.

### 2.2 Wheel of Names (wheelofnames.com)

FAQ: <https://wheelofnames.com/faq>

- **Randomness:** uses `crypto.getRandomValues()` (the OS CSPRNG) rather than
  `Math.random()`. FAQ asserts the spinner "cannot be rigged or secretly manipulated."
- **The one verification affordance they ship:** a built-in **simulator that runs 10,000
  spins in seconds** so you can see the distribution is flat. This is *statistical*
  self-reassurance, not per-draw proof — it tells you the code is unbiased on the machine
  you are sitting at; it tells a viewer at home nothing about the spin that just happened.
- **Order of operations, openly admitted:** the winner is selected the instant you press
  spin, *before* the animation math runs; the animation is then computed to land on the
  already-chosen winner. Near-misses and wobble are pure theatre. **This is exactly
  FairDraw's architecture** ("The three games ... are pure theatre layered on the same
  randomness") and it is already normalised for users — no education needed.
- **Weighted mode** exists as an explicit, user-visible entry-list setting.
- **Limits:** displays up to 1000 names; beyond that names are sampled from the text box
  for display while all entries retain equal chance (given).
- **Pricing:** entirely free, ad-supported, "all our premium features are 100% free."
  This sets the price anchor for the whole picker category at zero.
- **No audit trail whatsoever.** No spin history, no record, no artifact. Once the tab
  closes the draw never happened.
- **The trust gap is demonstrated, not hypothetical:** a public GitHub project exists whose
  entire purpose is a rigged clone — <https://github.com/iklevente/riggedwheelofnames>.
  Because a wheel is just a page you loaded from *someone*, a viewer cannot distinguish
  wheelofnames.com from a visually identical rigged copy. There is also a swarm of
  lookalike SEO domains (wheelofnames.io, wheelofnames.name, spinwheely, etc.) that
  reinforce the point: the brand is imitable and the result is unverifiable.

### 2.3 Comment Picker (commentpicker.com) and the comment-picker cluster

<https://commentpicker.com/>, <https://commentpicker.com/instagram-comment-picker.php>,
<https://commentpicker.com/facebook-instagram.php>

- **Pricing:** free, ad-supported; Premium ~$9.99/mo for ad-free plus higher limits.
- **What it sells as "proof" — and this is the important bit:**
  - an **image certificate** naming the winner(s),
  - an **animated winner-announcement video**,
  - a **screen recording of the selection**,
  - a **public results page** that followers can visit,
  - results **stored for at least 3 months** so followers can check after the fact.
- **Verifiability: none.** Every one of those artifacts is a *rendering produced by the
  same party that chose the winner*. A certificate image and a screen recording are
  forgeable in a text editor and a video editor respectively. But note carefully: this is
  the market telling you what shape of evidence audiences *want* — a shareable artifact
  with a permanent URL, and a bit of animated drama around the reveal. Comment Picker has
  the right packaging around empty content.
- The cluster is crowded with near-identical free clones (giveawaypick.com,
  commentpickerpro.com, comment-pickers.com, commentpicker.co), which again means the
  audience cannot tell one from another and none of them can prove anything.
  Roundup: <https://beyondcomments.io/blog/free-instagram-giveaway-picker>

### Category conclusion (§2)
Two disjoint clusters. RANDOM.ORG has genuine, third-party-checkable evidence and a
paste-in verification form, but **no animation, no theatre, an enterprise/subscription
posture, and a record that is notarised after the fact rather than committed before.**
The consumer pickers (Wheel of Names, Comment Picker) have all the theatre, are free, and
have **zero** verifiability — their "proof" is a certificate image or a 10,000-spin
simulator. Nobody occupies the middle.

---

## 3. Provably-fair gambling — the closest analogue, and the UX to copy

This is the one category where **millions of ordinary, non-technical users already
recognise and use a cryptographic verification flow.** The pattern below is effectively
standardised across Stake, BC.Game, Roobet and dozens of smaller crypto casinos, plus an
ecosystem of *third-party* verifiers built by people who do not trust the casinos' own
tools. FairDraw already implements this scheme; the value here is the **UX vocabulary**.

### 3.1 The four values

Sources: <https://stake.com/provably-fair/implementation>,
<https://stake.com/blog/how-does-the-provably-fair-system-work>,
<https://help.stake.us/en/articles/7891166-provable-fairness>,
<https://roshtein.com/articles/stake-provably-fair-engine>

| Value | Role | FairDraw equivalent |
| --- | --- | --- |
| **Server seed** | 64-char hex, generated by the house *before* the session. Never shown while betting. | `serverSeed` (32 bytes hex) |
| **Hashed server seed** | SHA-256 of it, shown up front. "Proves the seed exists and is already fixed without revealing what it is." | `commit` |
| **Client seed** | Supplied by the player. Platform pre-fills a default, and every guide says **change it before you play so you have a say in the result**. | crowd-supplied `clientSeed` |
| **Nonce** | Integer incrementing per bet, so each bet under one seed pair is a fresh unrelated result without regenerating seeds. | `nonce` (identical semantics) |
| **Cursor** | Extra counter for games needing more than 4 bytes of entropy (Plinko, Mines). | FairDraw's byte-stream position |

Outcome = `HMAC_SHA256(serverSeed, clientSeed:nonce:cursor)` → bytes → float. Roobet is a
notable spoiler: it uses the message format `clientSeed - nonce` (spaces around the dash)
rather than `clientSeed:nonce:cursor`, so a Stake verifier silently produces the wrong
answer for a Roobet bet — hence platform-specific verifier tools
(<https://spindex.net/provably-fair/roobet>). **Lesson for FairDraw: the exact
byte-level message format is load-bearing and must be published**, which is what
`PROTOCOL.md` is for.

### 3.2 The standard "rotate seed pair" flow — the thing to copy verbatim

This is the flow every guide describes in the same four beats:

1. **Commit.** The site shows you the **hashed** server seed (and often the hash of the
   *next* one too, queued up) before any bet.
2. **You set your client seed.** Settings → Fairness. It is an editable text field with
   a default pre-filled. You can change it at any time.
3. **Play.** Nonce increments per bet. Every bet's detail view carries its own
   `Fairness`/`Verify` link showing that bet's seed hash, client seed and nonce.
4. **Rotate the seed pair.** One button. Rotating does three things at once: it
   **reveals the previous server seed unhashed**, retires it, and activates the next
   pre-committed one. You then verify *all* the bets you made under the old pair
   retroactively, in a batch.

The exact navigation path users are told, over and over, in identical words:
**click your username (top right) → Settings → Fairness**, where you see the active
client seed, the active hashed server seed, the nonce count, and the **Rotate / Change
seed pair** button.

### 3.3 What the verification UI actually looks like

The verifier — whether the casino's own or a third-party one — is a plain form:

- **Server seed** (text) — the revealed one.
- **Client seed** (text).
- **Nonce** (number, "bet number").
- **Game selector** (Crash / Dice / Limbo / Plinko / Mines) — because each game consumes
  the byte stream differently.
- **[Verify Bet]** button → recomputes the outcome and shows it beside what you saw
  in-game. Match = fair.
- Usually a bonus **standalone SHA-256 hasher** ("hash any string") so you can
  independently confirm `SHA256(serverSeed) == the hash they published`. This is the same
  role as FairDraw's "10-second paranoid check".
- Prominent claim: **"all calculations execute browser-side, nothing is transmitted."**

Examples: <https://stakesim.com/provably-fair>,
<https://provenlyfair.com/stake-seed-checker/>, <https://spindex.net/provably-fair>,
<https://provably-fair.github.io/bcgame/>,
<https://github.com/rakestake/provably-fair-verifier> (self-described as an "anticheat
against casinos"), <https://www.provably.com/>,
<https://www.provablyfair.org/audits/bc-game>.

### 3.4 What makes it credible (and what to steal)

1. **Two-artifact structure: a commitment shown before, a reveal shown after.** Users
   understand "hash now, seed later" without understanding SHA-256.
2. **The player contributes entropy.** "Change your client seed so you have a say" is the
   single most repeated instruction in the space. It converts a passive audience into a
   participant, which is most of the trust win. FairDraw's crowd-supplied client seed is
   the same move, and is arguably *better* — one crowd seed for the whole room rather than
   per-player.
3. **Independent, client-side, third-party verifiers exist and are popular.** The
   ecosystem of non-casino verifier sites is the strongest signal that this pattern is
   real: users verify with a tool the operator did not write. FairDraw's `verify.js` +
   published `PROTOCOL.md` is what makes third-party verifiers *possible* — that should be
   marketed, not buried.
4. **Retroactive batch verification after rotation** — you check a whole session at once,
   not bet-by-bet. FairDraw's nonce series under one commitment is exactly this shape.
5. **The verify form never asks you to log in.** Anyone with the three strings can check.

### 3.5 Where the gambling model does NOT map cleanly

- Casinos verify **per-player, per-bet**; FairDraw verifies **one public event for a whole
  audience.** The casino never needs a roster commitment — FairDraw's `drawId` over the
  ordered contestant list is an addition the gambling scheme has no equivalent for, and is
  necessary because the *entry set* is the thing an event organiser can cheat on.
- Casinos let the *player* pick the client seed and never worry about grinding, because
  the seed pair is committed at session start. FairDraw's ordering warning (publish the
  commit before collecting the client seed) is the equivalent discipline pushed onto a
  human operator, and is the weakest link in the whole design — no casino asks a human to
  get the ordering right.
- Casinos suppress nothing because every bet is recorded in the player's own history.
  FairDraw's "operator can run nonces privately and publish only the flattering one"
  problem is a direct consequence of not having a server-side bet log.

---

## 4. Crypto-native raffles (VRF)

### 4.1 Chainlink VRF (EVM)

<https://chain.link/article/provably-fair-randomness>

- **Mechanism:** randomness is generated **off-chain** and delivered **on-chain together
  with a cryptographic proof**; the consuming contract will not accept the value unless the
  proof verifies. This blocks tampering by the oracle, the miner/validator, *and the
  developer* — the last of which is the property giveaway operators are being accused of
  violating.
- **How the result is surfaced:** it is not a UI, it is a **transaction**. The dApp shows a
  link to the fulfilment tx on a block explorer; the raffle contract emits the winner in an
  event. "The cryptographic proof is publicly available, and any participant can inspect
  the transaction and validate the winner selection independently."
- **Case studies / raffle platforms:** Aavegotchi
  (<https://chain.link/case-studies/aavegotchi>), NFT Stars
  (<https://medium.com/nft-stars/nft-stars-will-integrate-chainlink-vrf-75e53a87c04>),
  Banshees BLCKMRKT
  (<https://medium.com/@dakota.campbell65/banshees-integrates-chainlink-vrf-to-help-power-their-blckmrkt-raffles-73854e19741a>),
  NFracTion
  (<https://nfractioncom.medium.com/nfraction-integrates-chainlink-vrf-to-help-power-fair-nft-raffles-and-airdrops-cd81962170b4>),
  Trueluck.io (multichain, USDT entry, VRF draw, instant contract payout —
  <https://aijourn.com/trueluck-io-expands-web3-raffle-transparency-with-multichain-on-chain-infrastructure/>).
  Design writeups: <https://www.7blocklabs.com/blog/designing-nft-raffles-and-fair-drops>,
  <https://github.com/Am0rfu5/NFT-raffle>, and an academic treatment of raffle contract
  design on Sui: <https://arxiv.org/pdf/2310.12305>.
- **The killer feature these have that FairDraw does not:** the draw and the **payout** are
  the same atomic action. "No manual claims, no withdrawal forms, no waiting period." Most
  real-world giveaway disputes are not "was the RNG fair" but "did the prize ever arrive."

### 4.2 Solana VRF — Switchboard and ORAO

- **Switchboard** (<https://switchboardxyz.medium.com/verifiable-randomness-on-solana-46f72a46d9cf>):
  a VRF is "a public-key pseudorandom function that provides proofs that its outputs were
  calculated correctly" — verifiable by anyone without leaking the producer's secret key.
  Once the oracle posts the proof on-chain, **anyone may "turn the crank" and verify it.**
- **ORAO VRF v2** (<https://orao.network/solana-vrf>,
  <https://github.com/orao-network/solana-vrf>): EdDSA-based multi-node oracle, randomness
  fulfilled by a **byzantine quorum** of nodes rather than a single signer.
- Background on why naive on-chain randomness (block hashes, slot data) is manipulable:
  <https://www.adevarlabs.com/blog/on-chain-randomness-on-solana-predictability-manipulation-safer-alternatives-part-1>,
  <https://neodyme.io/en/blog/secure-randomness-part-1/>. Notably these argue commit-reveal
  is vulnerable to the **last-revealer / withhold attack** — a party who sees the outcome
  before revealing can simply decline to reveal. FairDraw is partly exposed to this via the
  "operator declines to publish an unflattering receipt" problem; the mitigation in the
  literature is exactly what the README prescribes (announce the schedule and require every
  nonce to be published) or an economic bond, which a free static page cannot have.

### 4.3 Verdict on VRF for FairDraw's use case
Strongest cryptographic guarantee in the landscape and the only one with atomic payout —
but it costs gas, requires a wallet, requires a chain, and is **completely inaccessible to
the target user** (a teacher, a streamer, an office manager, a community mod). It also
surfaces its proof as a block-explorer link, which is not legible to a normal audience.
It is prior art for the *guarantee*, not for the *UX*.

---

## 5. Streamer / creator tools â€” and the real pain points

### 5.1 RANDOM.ORG's Multi-Round Giveaway Service â€” the single closest competitor

<https://giveaways.random.org/>, guide: <https://giveaways.random.org/guide>,
FAQ: <https://giveaways.random.org/faq>, pricing:
<https://giveaways.random.org/pricing>, API:
<https://api.random.org/json-rpc/4/giveaways>

**This product exists because of exactly the threat FairDraw is built around**, and
RANDOM.ORG says so explicitly in a standing fraud warning
(<https://giveaways.random.org/warning>):

> "What you see in a live stream or a video might not be what you think. It might not be
> the real RANDOM.ORG at all."

The attack they describe: a broadcaster points their own machine at a **fake lookalike
site**, pre-configured to pick a chosen winner. "It is possible (and not particularly
difficult for a tech savvy person)". Crucially it only affects the deceiver's own
computer, so a viewer visiting the real site independently sees nothing wrong â€” which is
why on-screen evidence is worthless. RANDOM.ORG therefore tells people **not to use its own
List Randomizer for giveaways.** This is the strongest available third-party statement that
"watch me do it live" is not proof, and it should be quoted in FairDraw's own positioning.

**How the service works:**
1. Broadcaster opens a blank giveaway screen on stream, types a prize description.
2. Chooses a number of rounds â€” either typed, or *rolled with dice on camera* (theatre,
   deliberately).
3. Pastes the entrant list (limit **10,000** participants; some schema data says 3,000).
4. Randomises the list one round at a time; each round shows a re-ranked list with a
   timestamp in the broadcaster's local timezone. "Each participant has exactly the same
   chances in each round." The multi-round structure is pure drama â€” it exists to make the
   reveal last longer, which is a direct admission that **entertainment matters in this
   market.** (The guide even discusses the ~12% chance two consecutive rounds match in a
   4-person example.)
5. The final round emits a **verification code**, described in the guide as "really
   important" â€” the proof it "wasn't rigged". Valid for **one month**.
6. Viewers type that code into RANDOM.ORG's own site, in their own browser. If the
   broadcaster used a fake lookalike, "the real RANDOM.ORG will either tell you the
   verification code does not exist or that it refers to a different giveaway."

**Pricing:** Free plan $0/mo with $1.00 per giveaway; Standard $15/mo incl. 100 giveaways;
Premium $25/mo unlimited; Enterprise $300/mo with API access, 3,000 giveaways incl., $0.10
each thereafter (<https://giveaways.random.org/pricing>).

**Weaknesses FairDraw can attack:**
- The code **expires after one month.** A receipt that stops being checkable is not a
  receipt. FairDraw's receipt is verifiable forever, offline, by anyone.
- Verification is **a lookup, not a recomputation.** The viewer learns "RANDOM.ORG says
  this giveaway happened and this person won." They cannot re-derive the winner, and they
  are trusting RANDOM.ORG's database. FairDraw's replay is trustless.
- **After the fact only.** There is no published-before-the-draw commitment; nothing stops
  the broadcaster running the service five times and reading out the run they liked. Same
  hole as FairDraw's nonce problem, but without even the schedule-announcement mitigation.
- **Paid and account-bound.** $1 a draw, or $15-25/mo.
- **10,000 entrant cap**, and the whole list must be pasted in.
- No animation beyond a re-sorting list. FairDraw's three games are strictly more watchable.

### 5.2 What creators actually use and what they do for "proof"

- **Wheel of Names** has a dedicated streaming page (<https://wheelofnames.com/streaming>)
  and a large clone/SEO ecosystem targeting streamers (pickertoolbox.com/for-streamers,
  spinwheelnames.com/creator/live-stream-giveaway-wheel, randomspinnerwheel.com,
  gospinwheel.com, funrandompickers.com/guides/giveaways). The OBS/Streamlabs capture of a
  spinning wheel is the de facto standard on-stream giveaway.
- **Chat-based raffle bots** (e.g. <https://streamergiveaway.org/>, plus Streamlabs /
  Nightbot / StreamElements giveaway commands) pull entrants from chat. No verifiability
  at all; the bot is a black box running on the streamer's own account.
- **The community's actual "proof" practices**, as recommended in creator guides: read the
  full entry list aloud on stream *before* spinning; keep the wheel visible so viewers can
  see their own name; screenshot the result; post the screenshot in Discord. All social,
  all forgeable, all defeated by the lookalike attack RANDOM.ORG describes.
- One creator report captured in the search corpus: comment sections "used to erupt with
  'rigged' accusations after giveaways", and switching to a visible wheel-spin video
  stopped them. **Theatre demonstrably buys trust even when it proves nothing** â€” which is
  precisely why FairDraw's combination of theatre *plus* real proof is a coherent product
  rather than two features bolted together.

### 5.3 Documented real-world rigging accusations (the demand signal)

- RANDOM.ORG's own fraud warning page, above â€” a randomness vendor publicly warning that
  its flagship free tool is being spoofed on streams: <https://giveaways.random.org/warning>
- Influencer accused of fixing a $10,000 Instagram contest â€”
  <https://www.aol.com/influencer-accused-fixing-instagram-contest-184746945.html>
- The ACE Family car giveaway transparency backlash â€”
  <https://www.sportskeeda.com/pop-culture/news-they-insufferable-the-ace-family-car-giveaway-drama-explained-youtubers-garner-backlash-lack-transparency>
- A widely criticised pattern: hand-picking "25 random names from millions of entries" and
  then running *those* through a generator â€” the generator is honest, the shortlist is not.
  **This is the roster attack, and it is the one FairDraw's `drawId` commitment actually
  defends against** â€” arguably a bigger real-world problem than RNG bias.
- Fake "recent winners" lists used to bait entries â€”
  <https://thegiveawaygazette.com/articles/fake-recent-winners-lists-lure/>

### 5.4 Complaints about the paid platforms

- **Price.** Repeatedly the top complaint. Gleam's cheapest usable plan is cited at
  ~$79/mo annual vs SweepWidget ~$25/mo annual â€” "roughly three times the price"
  (<https://gleam.io/blog/gleam-vs-sweepwidget/>). Even SweepWidget draws "they charge too
  much compared to their alternatives" on Capterra
  (<https://www.capterra.com/p/200014/SweepWidget/reviews/>, 4.7 from 52 reviews).
  ViralSweep tops out at $399/mo (<https://www.itqlick.com/viralsweep/pricing>).
- **Account risk / lock-in.** A reported case of Gleam disabling an account "with no
  warning, no follow-up email, and no refund" (<https://copywritersnow.com/gleam-alternatives/>).
  Your past draws live in someone else's dashboard.
- **Honor-system entries.** Many entry methods cannot be verified at all â€” the entrant just
  claims they did the task. SweepWidget's own marketing concedes this while listing its
  anti-fraud layers (reCAPTCHA, VPN blocking, IP limits, email verification, cross-giveaway
  blacklists) â€” <https://sweepwidget.com/examples/reddit>.
- **Bot / duplicate entries.** Universal concern; every platform sells filtering as a
  premium feature. Note this is orthogonal to draw fairness â€” but audiences conflate them,
  so a fairness product that says nothing about entry integrity will be asked about it.
- **Gameable weighting.** KingSumo share-credit without sharing
  (<https://rafflepress.com/kingsumo-review/>).
- **Rafflecopter's shutdown (1 Oct 2025, given)** left the field churning; the volume of
  "best Rafflecopter alternatives 2026" content is itself evidence of an unsettled market.

---


## 6. Comparison table

"Verifiable?" means: **can a person who was not the operator, using something other than
the operator's word, confirm the announced winner was not chosen?**

| Product | Price | Draw method | What the audience gets | Animation | Verifiable? |
| --- | --- | --- | --- | --- | --- |
| **FairDraw** | Free, static, offline | Commit-reveal, HMAC-SHA256(serverSeed, clientSeed+nonce) | Commitment block published before + JSON receipt after; replay in browser or `node verify.js` | 3 games (wheel, rumble, RPG) | **Yes â€” trustless replay.** Anyone recomputes the winner from the seeds. Weak point: no external timestamp; operator can run hidden nonces |
| Gleam.io | Free tier; ~$19/mo up, cheapest usable cited ~$79/mo annual | Server-side call to RANDOM.ORG | A name. Dashboard audit for the operator only | No | **No.** "We use RANDOM.ORG" is a claim; no signed record is exposed |
| Woobox | Free pickers; paid campaigns | Server-side RNG | A name, a timestamped log, "keep a screenshot" | Minor | **No.** Operator-held, operator-editable |
| SweepWidget | Free; $29 / $59 / $119 mo | Server-side RNG from own DB | A name | No | **No** |
| ViralSweep | $49 / $199 / $399 mo | Server-side RNG from own DB | A name | No | **No** |
| RafflePress (WP) | ~$39.50/yr up | Server-side RNG in your WP install | A name | No | **No** (and the operator owns the server) |
| KingSumo | One-off / AppSumo | Weighted random on bonus entries | A name | No | **No.** Plus gameable share-credit weighting |
| Wheel of Names | Free, ad-supported | `crypto.getRandomValues()`, winner chosen before the animation | A spinning wheel and a name | **Yes, the genre-defining one** | **No.** Only a 10,000-spin distribution simulator; rigged clones demonstrably exist |
| Comment Picker | Free; ~$9.99/mo premium | Server-side RNG over scraped comments | Certificate image, announcement video, screen recording, public results page (3 months) | Yes (cosmetic) | **No.** Every artifact is rendered by the party that picked |
| RANDOM.ORG Signed API | Metered API | True RNG (atmospheric noise) + RSA signature | `random` object + `signature`; `serialNumber`; `userData` pre-commitment | No | **Yes â€” signature.** Third party checks SHA-512 + public key at `server.crt`. But you trust RANDOM.ORG's honesty; you cannot recompute |
| RANDOM.ORG Third-Party Draw Service | Subscription | True RNG | Permanent public/entrant-accessible/private record, immutable, kept 5+ years | No | **Yes â€” notarised record.** Entrant can query by their own identifier. Post-hoc only, no pre-commitment |
| RANDOM.ORG Multi-Round Giveaways | $0/mo + $1 per draw; $15/mo (100); $25/mo unlimited; $300/mo API | True RNG, multi-round re-ranking | A **verification code**, valid **1 month**, checked on random.org | Rounds + on-camera dice = mild theatre | **Partly.** Proves the draw came from real RANDOM.ORG and defeats the lookalike attack; does not prove it was the only draw, expires, and is a lookup not a recomputation |
| Stake / BC.Game / Roobet | Free to check (gambling) | HMAC-SHA256(serverSeed, clientSeed:nonce:cursor) | Hashed server seed up front, seeds revealed on rotation, per-bet verify links, third-party verifiers | Yes â€” full casino game animation | **Yes â€” trustless replay.** The mature reference implementation of exactly FairDraw's scheme |
| Chainlink VRF raffles (Trueluck, NFT Stars, Banshees, NFracTion) | Gas + oracle fee | VRF: off-chain randomness + on-chain proof | A block-explorer transaction, an emitted winner event, automatic prize payout | Varies | **Yes â€” strongest.** Contract rejects an invalid proof. But needs a wallet and a chain, and the proof is illegible to normal audiences |
| Switchboard / ORAO VRF (Solana) | Gas + fee | VRF; ORAO uses an EdDSA byzantine quorum | On-chain proof anyone can "turn the crank" and verify | Varies | **Yes** |

---

## 7. Direct answers

### 7.1 What is the STANDARD verification UX that users already recognise?

There is exactly one, and it comes from crypto gambling. Millions of people have used it.
**Copy it wholesale rather than inventing vocabulary.** Its shape:

1. **A commitment shown before anything happens.** A hash, presented as "this proves the
   seed is already fixed without revealing it." Users accept this without understanding
   SHA-256, because the *sequencing* is intuitive: you showed me a sealed envelope.
2. **The user/audience supplies the other half.** "Change your client seed so you have a
   say in the result" is the single most-repeated instruction in the space, and it is what
   converts a spectator into a participant. FairDraw's crowd-supplied seed is the same
   move.
3. **A nonce that increments per draw** under one seed pair, so a whole session verifies
   against one commitment.
4. **A one-button "rotate seed pair" that reveals the old server seed** and simultaneously
   activates the next pre-committed one. This single control is the reveal step, the
   retire step, and the next commitment, and users know it by name.
5. **A plain verifier form with labelled fields** â€” server seed / client seed / nonce /
   game â€” and a **[Verify]** button that recomputes and shows match-or-not. Never a login.
   Usually accompanied by a **standalone SHA-256 hasher** so you can check the commitment
   opens, and by the reassurance **"all calculations run in your browser, nothing is
   sent."**
6. **Third-party verifiers that the operator did not write.** Their existence is the proof
   that the proof is real. Published byte-level spec makes them possible.

Two smaller patterns worth copying from elsewhere:
- **RANDOM.ORG's three-tier record visibility** â€” private / entrant-accessible / public.
  Entrant-accessible (you can check *your own* entry and the result without the whole world
  reading the roster) elegantly resolves privacy vs verifiability, and FairDraw has no
  answer to "I do not want to publish 400 email addresses."
- **RANDOM.ORG's `userData` field** â€” commitment text carried *inside* the signed object.
  FairDraw's commitment block should carry the announced nonce schedule as a hashed field,
  not just as prose advice in the README.

**Where FairDraw currently deviates, and should not:** the Verify tab asks the user to
paste a **JSON blob**. Every recognised verifier in the world uses **discrete labelled
fields**. Offer both â€” a JSON paste for the receipt, and a fields view (commit / server
seed / client seed / nonce / roster / mode) â€” with the fields view first, because that is
the one people have seen before. Also missing versus the standard: no pre-published hash of
the *next* commitment, and no one-click standalone hasher.

### 7.2 Where is the real gap?

**Entertaining animated draws and genuine cryptographic verifiability exist in entirely
separate products, and nothing in the giveaway market bridges them.**

- Theatre without proof: Wheel of Names, Comment Picker, chat raffle bots, every giveaway
  platform. Free or cheap, hugely popular, provably rigged clones exist.
- Proof without theatre: RANDOM.ORG's Signed API and Draw Service, VRF raffles. Credible,
  paid or technical, and visually inert â€” a signature blob or a block-explorer link.
- The one product that tries to sit in between â€” **RANDOM.ORG Multi-Round Giveaways** â€” is
  the true competitor, and it is *deliberately* aimed at streamers. But its theatre is a
  re-sorting list, its proof is a **lookup that expires after a month**, it costs money, it
  requires an account, and it is post-hoc with no published-before commitment.

So the gap is specific and defensible: **a free, offline, account-free draw that is
watchable enough to put on a stream and verifiable enough that a hostile contestant can
recompute the winner themselves, years later, without contacting anyone.** No product
occupies that square.

Two secondary gaps worth naming:
- **Nobody commits to the roster.** Every verifiability story in the market is about the
  random number. The documented real-world scandals are about the *entry list* â€” the
  "25 hand-picked names from millions, then run the generator" pattern. FairDraw's `drawId`
  over the ordered contestant list is a differentiator nobody else has, and it addresses
  the more common cheat. It is currently buried; it should be headline.
- **Nobody's proof outlives the campaign.** Comment Picker keeps results 3 months,
  RANDOM.ORG's giveaway codes 1 month, the Draw Service 5 years, and platform dashboards
  only while you keep paying. A self-contained receipt file with no expiry and no server is
  a genuinely novel claim in this market.

### 7.3 Top complaints about existing tools

1. **Price, and its steepness relative to value.** Gleam ~3x SweepWidget; ViralSweep to
   $399/mo; even the cheap ones draw "they charge too much." The picker tier is free, which
   sets the anchor: any charge needs a strong story.
2. **"Rigged" accusations that the operator has no way to answer.** The central emotional
   pain. Creators report comment sections erupting after every giveaway; the only remedies
   in circulation are social (spin on camera, screenshot to Discord) and all of them are
   defeated by the lookalike attack RANDOM.ORG itself publicly warns about.
3. **Fake / lookalike tooling and forged evidence.** RANDOM.ORG warns its own List
   Randomizer is unsafe for streams. A rigged Wheel of Names clone is on GitHub.
   Certificates and screen recordings are trivially fabricated.
4. **Bot, duplicate and honor-system entries.** Universally raised; entry verification is
   sold as a premium tier; many entry methods cannot be checked at all.
5. **Gameable weighting** (KingSumo share-credit) â€” distorts odds even with a perfect RNG.
6. **Lock-in and data/export limits.** Entries and results live in the vendor's dashboard;
   at least one reported account disabled with no warning, no email, no refund; and the
   Rafflecopter shutdown proved the whole campaign history can simply evaporate.
7. **Roster manipulation** â€” pre-filtering entries before the "random" step.
8. **Expiring evidence.** Verification codes and result pages that stop working.

### 7.4 Table-stakes feature list to be taken seriously

**Non-negotiable (a serious tool has all of these):**
- Names list **and** numeric range input; paste from clipboard, one per line; CSV import.
- Duplicate detection with a clear choice: reject, dedupe, or allow-as-extra-entries
  (RANDOM.ORG's convention: repeating an identifier grants extra chances). Blank-line
  stripping. A **final review screen** showing the exact parsed roster and its count before
  anything is locked.
- Multiple winners, in ranked order (1..N), plus **runners-up / alternates** â€” every
  serious tool has this because winners fail to claim.
- Draw without replacement; option to exclude previous winners across draws.
- **A recognisable verification flow** as in Â§7.1: commitment first, labelled-field
  verifier, browser-side only, no login, plus a raw one-liner for the paranoid.
- **An exportable, permanent, shareable artifact** â€” the receipt, plus a human-readable
  results page/image an operator can post. Comment Picker and RANDOM.ORG both prove the
  market demands a shareable proof object, not just a file.
- Export of entries and results (CSV/JSON). This is a top-3 complaint about incumbents.
- Works on stream: large legible text, full-screen/OBS-friendly mode, no cookie banner, no
  layout shift, keyboard-driven.
- Free tier that is actually usable for a real draw.
- Scale: at minimum match the field â€” Wheel of Names displays 1000 (given), RANDOM.ORG's
  giveaway service caps at 10,000. Anything under 1000 will be dismissed.
- Published, versioned byte-level spec + a reference verifier, so third parties can build
  their own checker. This is what makes the proof credible rather than decorative.
- An honest "what this does not prove" statement. FairDraw already has the best one in the
  market; it is an asset, not a liability.

**Strongly expected (present in most, absent hurts):**
- Timestamped, immutable public record with a permanent URL.
- Entrant-level privacy option (RANDOM.ORG's entrant-accessible tier).
- Winner notification / claim workflow, and a "redraw if unclaimed" path that is itself
  covered by the commitment (a nonce reserved in advance).
- Social entry import (Instagram/YouTube/TikTok comments, Twitch chat) â€” the actual reason
  most people open a picker at all.
- Weighted entries as an explicit, visible, opt-in setting (Wheel of Names' framing:
  transparency makes weighting acceptable). Note: **paid-entry weighting is off the table
  legally (given)**; unpaid bonus-entry weighting is not.
- Branding/theming for the operator.
- Sound and confetti on reveal. Trivial, and it is what people screenshot.

**Differentiators FairDraw already has and should lead with:**
- Trustless replay, forever, offline, with no account and no vendor.
- Roster commitment (`drawId`) â€” nobody else commits to the entry list.
- Three genuinely watchable draw animations layered on one provably uniform result.
- Publishable file hashes so a viewer can confirm they are running the same code â€” the
  direct, documented answer to the lookalike attack that RANDOM.ORG says it cannot solve
  for its own List Randomizer.

**The two known holes to close before claiming "provably fair" loudly:**
- **Hidden nonces.** Borrow RANDOM.ORG's `serialNumber` idea: put the declared nonce
  schedule *inside* the hashed commitment so a suppressed draw is detectable, rather than
  leaving it as prose advice.
- **No external timestamp.** The commitment block is only evidence if it provably predates
  the client seed. Offer a one-click anchor (OpenTimestamps, a public gist, a chain
  transaction, or simply "announce the future block height inside the block" as the README
  already suggests) so the operator is not relying on a screenshot of a Discord message.

---

**Status: COMPLETE.**

