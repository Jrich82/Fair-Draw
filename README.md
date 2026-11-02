# FairDraw

A single web page that picks winners from a list of names, plays one of three
animated draw games while it does so, and leaves behind a receipt that lets
anybody re-run the draw and confirm you did not rig it.

It is offline and dependency-free. Four files, no build step, no network calls,
no accounts, no analytics:

| File | What it is |
| --- | --- |
| `index.html` | The operator page: setup, draw animation, in-page verifier. |
| `engine.js` | Every random decision. Loaded by the page *and* by the verifier, so the animation and the audit can never disagree. |
| `verify.js` | Command-line verifier. `node verify.js receipt.json`. |
| `test.js` | Test suite. `node verify.js --selftest`. |

The three games — Spinning Wheel, Royal Rumble, RPG Hit Points — are pure
theatre layered on the same randomness. Every contestant has exactly the same
chance in all three. Pick whichever one your audience will enjoy watching.

---

## Fun pack (visual only — the engine still picks)

Everything below is **presentation**. Winners, alternates and their order come
only from `engine.js`; none of it uses `Math.random` for anything that touches a
result, and existing receipts verify unchanged.

- **New game modes:** Horse Race, Battle Royale (round-by-round eliminations),
  Plinko, Slot Machine, Claw Machine and a tournament **Bracket** for big
  giveaways. They are skins over the wheel draw: the commitment and receipt say
  `mode: "wheel"`, the commitment block shows e.g. *Horse Race (wheel draw)*.
- **Suspense:** 3-2-1 drumroll countdown, a *Final Two* showdown and slow-mo
  near misses (the claw drops the runner-up, the third reel stops on the
  runner-up first) before the reveal.
- **Elimination order + commentary + bracket** come from `visual.js`, a separate
  domain-separated HMAC stream (`FairRng(serverSeed, "fairdraw-visual-1|" + clientSeed, nonce)`).
  Ranked places are copied from the engine; only unranked entrants are shuffled.
  `node verify.js --show receipt.json` prints the same show. See PROTOCOL.md
  *Presentation layer*.
- **Sound & confetti:** Web Audio synthesized SFX (no audio files), 🔊 mute
  toggle, canvas confetti, optional 🗣 "Winner winner!" via speechSynthesis.
  Both toggles persist in localStorage.
- **Themes:** Neon (default), Retro Arcade, Casino, Winter Cabin, RuralDegen.
  Picker in the header, saved in localStorage, or force one with `?theme=cabin`
  (`arcade`, `casino`, `cabin`, `ruraldegen`).
- **Twitch `!enter`:** under the Names box, type a channel and Connect. It joins
  Twitch chat read-only and anonymously (`justinfan…` login over
  `wss://irc-ws.chat.twitch.tv`, no tokens stored anywhere). Each chatter who
  types `!enter` is added once (case-insensitive dedupe). Press **Lock roster**,
  then **Lock & commit** (committing also closes chat entry, since the roster is
  bound into the Draw ID).
- **Winner card:** after a draw, *Winner card (.png)* renders a 1200×630 PNG
  with winner, optional prize text, date, Draw ID, "Verified fair" badge and the
  site URL. (Publish the receipt so the badge is checkable.)
- **Share & install (footer):** Copy link, native Share, a QR code of the page
  generated locally (vendored MIT `qrcode-generator` in `vendor/`, no CDN), and
  **Install app** (PWA: `manifest.webmanifest`, icons in `icons/`, `sw.js`
  caches the static files for offline use; drand/Twitch are never cached). On
  iPhone/iPad a hint explains *Share → Add to Home Screen*.
- **OBS link:** copies the URL with `?obs=1` — transparent background, stage and
  winner only. Add it as an OBS Browser Source. After you reveal the server
  seed, the OBS link also carries the receipt (`#receipt=…`), and the OBS page
  verifies it and replays that exact draw. Press **H** (Interact) to show
  controls in OBS mode.

Works from `file://` too, except Twitch, drand, the service worker and install
(browsers only allow those over http/https).

**Free-entry giveaways only** — this note is in the page footer.

## Verify online

Once GitHub Pages is on, the page (host + built-in verifier) is served at:

**https://jrich82.github.io/Fair-Draw/**

It is the same `index.html` from the repo root; all paths are relative, so it
works identically from `file://`, any static server, or Pages. To turn it on:

1. Open the repo on GitHub → **Settings** → **Pages** (left sidebar, under *Code and automation*).
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Set **Branch** to `main` and folder to **`/ (root)`**, then click **Save**.
4. Wait a minute or two; the URL above appears at the top of the Pages screen.

The repo includes an empty `.nojekyll` file so Pages serves the files as-is.

## Quick start

It is a static page. Double-click `index.html` and it works.

Two caveats to opening it straight off disk: the **Copy commitment block**
button needs a secure context and will silently do nothing on `file://`, and
some corporate browser policies block local files outright. If you hit either,
serve the folder instead and open <http://localhost:8080>.

From PowerShell, in the FairDraw folder:

```bash
python -m http.server 8080
```

Or, if you have Node but not Python:

```bash
npx --yes serve -l 8080 .
```

Then check the code is intact before you run anything that matters:

```bash
node verify.js --selftest
```

---

## The run of show

Six steps. **The order is the whole point** — see the warning after step 4.

**1. Enter the roster and pick the game.**
One name per line. Order matters: it gets pinned into the commitment, so you
cannot quietly reorder or edit the list later. Set how many winners you need.

**2. Press "Lock & commit".**
The page generates a secret 32-byte **server seed** and immediately shows you
its SHA-256 hash — the **commit** — plus a **Draw ID** that fingerprints the
commit, the game, the winner count and the exact roster. The roster and game
controls lock. The server seed stays hidden until step 6.

**3. Publish the commitment block, publicly and timestamped.**
Use the copy button and post it somewhere you cannot silently edit later: a
group chat, a public post, an email to all entrants, a git commit. The
timestamp is what makes it a commitment rather than a claim — it needs to be
provable that this existed *before* step 4.

**4. Collect the client seed from the crowd.**
Only now. Someone other than you supplies a short string. See below for how to
choose one.

> **Why this order matters.** The winner is a deterministic function of
> `serverSeed + clientSeed + nonce`. If you learn the client seed *before* you
> commit, you can sit there generating fresh server seeds, testing each one
> against that fixed client seed, and stop when the output names your friend.
> That is called grinding, it takes seconds, and it leaves no trace — every
> receipt you produce that way verifies perfectly.
>
> Publishing the commit first kills it. To grind after publishing you would
> need to find a *different* server seed that hashes to the commit you already
> posted. That is a SHA-256 preimage attack, and it is not something anyone can
> do. So once the block is public, your seed is frozen; and because the crowd's
> seed is chosen afterwards and you cannot predict it, neither side controls
> the result.
>
> A receipt where the commitment was published *after* the client seed proves
> nothing at all. It is still a valid receipt. It just is not evidence.

**5. Press "Run the draw".**
The animation plays, the winner is announced, and the nonce auto-increments.

**6. Press "Reveal server seed", then "Download receipt (.json)".**
Hand the receipt to anyone who wants it. Publish it alongside the commitment
block. Until you reveal the seed, nobody — including a contestant with the
receipt — can check anything, so do not skip this.

---

## Choosing a client seed

You want a value that **you could not have predicted at step 3** and **cannot
influence at step 4**. That is the only property that matters. It does not need
to be secret, long, or random-looking.

Good:

- A future Bitcoin or Ethereum block hash — announce the height in advance
  ("we'll use the hash of block 921455"), then use it when it lands.
- Dice rolled on camera by a contestant, read out left to right.
- A number the crowd shouts, taken from someone who is not you.
- Today's closing price of a named index, if the draw is before the close.
- The concatenated jersey numbers of whoever shows up.

Bad:

- Anything you picked. `2024`, `lucky7`, your dog's name.
- Anything you had already decided at step 3, even if it looks random.
- A "random" string you type at the keyboard on the day.
- A past block hash, or any value that already existed when you committed —
  you could have ground against it.
- Anything a single contestant fully controls, if that contestant might
  collude with you.

A weak client seed does not break the commitment, but it hollows it out. The
strongest arrangement is a public future value announced *inside* the
commitment block, so there is nothing left to argue about.

---

## The receipt

A receipt is a small JSON file. Here is one you can verify yourself right now —
these are real values from this codebase, not placeholders:

```json
{
  "version": "fairdraw-1",
  "drawId": "16f5de8bfe0fac029c2cb7e8cb45bcfb4dfb1edf16ec750632e56600882334f5",
  "commit": "d79ce062125c83c08ce6d33411ea2d55c3f936bb13b298e1125bb9f72f411d1c",
  "mode": "wheel",
  "contestants": ["Ada", "Bo", "Cass", "Dex"],
  "winnerCount": 1,
  "clientSeed": "demo",
  "nonce": 0,
  "winners": ["Ada"],
  "serverSeed": "9a482a4a080f28a360253fd7136112d7ae8eb5aadc9a126f5f8d175bcd16decf",
  "drawnAt": "2026-08-16T12:00:00.000Z"
}
```

| Field | Meaning |
| --- | --- |
| `version` | Format tag. Always `fairdraw-1`. |
| `drawId` | SHA-256 fingerprint of the commit + game + winner count + roster. This is the short string you published at step 3. |
| `commit` | SHA-256 of the server seed. Published at step 3, before the client seed existed. |
| `mode` | `wheel`, `rumble` or `rpg`. |
| `contestants` | The roster, in the exact order it was locked. Order is part of the fingerprint. |
| `winnerCount` | How many winners were drawn. |
| `clientSeed` | The string the crowd supplied at step 4. |
| `nonce` | Which draw this is under this commitment. See below. |
| `winners` | The announced result, in order. |
| `serverSeed` | The secret, revealed at step 6. 64 lowercase hex characters. |
| `drawnAt` | When the operator's browser says the draw happened. **Not covered by any hash — it is a label, not evidence.** |

### Checking it

Either way is a full check, and neither sends anything anywhere:

**In the page.** Open the **Verify** tab, paste the receipt JSON, press
Verify. It works in any browser, on any copy of the page — a contestant can
use their own copy rather than yours.

**From a terminal.**

```bash
node verify.js receipt.json
```

It prints the three checks and exits `0` if they all pass, `1` otherwise. It
also reads from stdin if you pipe a receipt in.

Three things get checked:

1. **The commitment opens.** `SHA-256(serverSeed)` equals the published
   `commit`. This is what proves the seed was fixed in advance.
2. **The Draw ID matches.** Recomputing the fingerprint from the roster, game
   and winner count in the receipt reproduces the published `drawId`. Change
   one name, one character, or the order, and this fails.
3. **The replay reproduces the winners.** Re-running the draw from the seeds
   produces exactly the announced `winners`.

Step 1 and 2 are only meaningful if the verifier compares `commit` and `drawId`
against **the copy you published at step 3**, not just the copy in the receipt.
The receipt is internally consistent by construction; the published block is
the external anchor. Check them by eye.

---

## Entry modes

Three ways to build a roster, chosen with the buttons above the entry box.

**Names** — one per line. Best for small, watchable draws.

**Numbers** — a range like 1 to 10,000. The range itself is the roster, so the
commitment reads `range:1-10000` instead of listing ten thousand rows, and the
receipt stays around 450 bytes instead of 117 KB. Use this whenever entrants
already hold numbered tickets.

**Tickets** — `Ada, 5` gives Ada five entries. The commitment records one line
per person (`Ada x5`), not one per ticket, so 50,000 tickets commit in about
36 KB instead of 786 KB. Tickets are ordinary entries
labelled `Ada #1` … `Ada #5`, so odds track ticket count with no weighting
anywhere in the draw: over 20,000 test draws a holder of 5 of 10 tickets won
50.09% of the time. The **One prize per person** toggle stops one person
taking several prizes, and that rule is pinned into the Draw ID so it cannot
be flipped after the result is known.

> **Extra entries must be earned, never sold.** Prize + chance + *paid* entry
> is a lottery, which is illegal for a for-profit in most US states. Free
> bonus entries for sharing or referring are standard and fine. See
> `research/02-legal-compliance.md` — general information, not legal advice.

**Import CSV** reads an export from Gleam, Rafflecopter and similar. It skips
a header row, keeps quoted fields containing commas intact, uses a numeric
column as entry counts when one is present, and reports exactly what it found
and dropped. Always read that summary before locking — a roster you have not
looked at is a roster you cannot vouch for.

## Alternates

Set **Alternates** to rank backups past the winners. If a winner does not
claim, the next name was already fixed at commit time, so there is nothing to
re-draw and no opportunity to re-draw favourably.

Ranking deeper provably cannot change who won: the wheel's only random read
depends on how many picks have happened, not how many were requested, so
drawing more places always reproduces the earlier ones exactly. There is a
test asserting this across all three games.

## Which visual you get

| Entries | Visual |
|---|---|
| up to ~60 | wheel with every name labelled |
| 60 – 360 | wheel, winning slice labelled |
| over 360 | ticket odometer |

The wheel's ceiling is not performance, it is honesty: past roughly one degree
per slice, entrants render sub-pixel and the wheel stops showing the field it
claims to represent. The odometer rolls to the winning entry's position and
reads the same at 100 entries or 100,000. Its blur of spinning digits is
cosmetic; the value it lands on comes from the committed byte stream.

The brawl modes are built for small casts. Above 24 entrants the tool warns
you how long the animation will actually run.

## What this proves — and what it does not

**It proves:** the winner was not steered after the fact. The server seed was
fixed before the client seed existed, the client seed came from outside, and
the result is a deterministic function of the two that anyone can recompute.
There is no room for the operator to nudge the outcome once the block is
public.

**It does not prove any of the following.** Be upfront about these rather than
letting someone discover them later.

- **That the roster was complete or correct.** Nothing stops an operator from
  leaving someone out, or entering a name twice under two spellings. The
  commitment pins *which list was used*; it says nothing about whether that
  list was the right one. Fix: publish the roster for review before you lock.
- **That the entrants are distinct real people.** Sockpuppets get the same
  1/N as everyone else. That is an entry-control problem, not a randomness
  problem, and this tool does not touch it.
- **That the code a contestant loaded is the code you ran.** A verifier is
  only worth anything if the engine doing the verifying is the honest one. If
  you email someone a zip, they are trusting your zip.
- **That you published the commitment before collecting the client seed.**
  A rigged draw and an honest one produce receipts that look identical. Only an
  external timestamp on the commitment block distinguishes them.
- **That this was the only draw you ran.** See the nonce section below.
- **`drawnAt`.** It is whatever the operator's clock said, unsigned.

### Closing the "is this the same code?" gap

Two mitigations, best used together:

**Host it publicly.** Put the folder on a URL everyone loads from — GitHub
Pages, a static host, anything. Then there is one copy and no zip to trust.

**Publish the file hashes** in your commitment block, so anyone can confirm
their copy is byte-identical to yours. From PowerShell in the FairDraw folder:

```bash
Get-ChildItem -File | Get-FileHash -Algorithm SHA256 | Format-Table Hash, Path -AutoSize
```

A contestant runs the same command on their copy and compares. `engine.js` is
the one that actually matters — it is the only file that decides anything.

---

## Where the client seed comes from

Two options, chosen before you lock.

**The crowd** — anything the entrants pick after seeing the commitment. Works
entirely offline. Its weakness is procedural: you could run several draws
privately and publish only one.

**Public beacon (drand)** — the seed will be a specific future round of the
[drand](https://drand.love) public randomness beacon. The round number is
pinned into the Draw ID roughly 90 seconds before that round exists, so nobody
can know the seed in advance, including you. **This is the only option that
actually closes the grinding gap** rather than making it visible. It needs
internet at draw time.

The page fetches the round from four independent mirrors and requires them to
agree. `node verify.js receipt.json` does the same check and fails the receipt
if the seed is not what the beacon published:

```bash
node verify.js receipt.json
```

Use `--no-beacon` to verify offline; the report then says plainly that the seed
origin was not checked rather than implying it passed.

**The honest limit:** this compares against what the beacon *serves*. It is not
a BLS signature verification, which would need pairing crypto and cost the
engine its zero-dependency property. It defeats an operator who invented a seed
or swapped rounds after the fact. It does not defeat someone who also controls
every mirror you asked.

## Exports

Three files, from the winner banner:

| File | What it is |
|---|---|
| **Receipt (.json)** | the proof — everything needed to re-verify, forever |
| **Results (.csv)** | one row per place: winner or alternate, entry, holder, and the Draw ID |
| **Roster (.csv)** | the roster exactly as committed, so an entrant can find their own row |

The results sheet carries the Draw ID, commit, client seed and nonce on every
row, so a row pasted into a claim tracker or a chat message still points back
at the draw it came from. Files are UTF-8 with a BOM so Excel opens accented
names correctly rather than as mojibake.

## Multiple draws from one commitment

You do not need a new commitment for every draw. The **nonce** is an integer
mixed into the randomness alongside the client seed, so the same server seed
and client seed with a different nonce give a completely unrelated result.

Draw the raffle at nonce 0, the door prize at nonce 1, the wildcard at nonce 2,
all under one published commitment and one client seed. Each draw gets its own
receipt; all of them verify against the same `commit`.

Set **Draws** to the number you intend to run *before* locking. It is pinned
into the Draw ID, the tool refuses nonces beyond it, and every receipt states
which draw it is — so a missing one in a published sequence is visible to
everyone. Announce the schedule in the commitment block too:

> Nonce 0 = grand prize. Nonce 1 = runner-up. Nonce 2 = door prize.
> No other draws will be run under this commitment.

**The honest caveat.** Declaring the budget makes a suppressed draw
conspicuous; it does not make grinding impossible. Nothing forces you to
publish a receipt you dislike, and a verifier cannot check what it was never
given. The genuine fix is a client seed nobody could know at commit time — a
future block hash or drand round. Until that is built, this remains the one
real gap after the commitment, and it is procedural rather than cryptographic.

---

## The 10-second paranoid check

If a contestant wants to confirm one thing and one thing only — that the
revealed seed really is the one you committed to — this is it. Standard tools,
one command, no FairDraw code involved:

```bash
node -e "const c=require('crypto'),r=require('./receipt.json');console.log(c.createHash('sha256').update(r.serverSeed).digest('hex')===r.commit?'COMMIT OPENS':'TAMPERED')"
```

No Node? Pure PowerShell, same check:

```bash
$r = Get-Content receipt.json -Raw | ConvertFrom-Json; if ([BitConverter]::ToString((New-Object Security.Cryptography.SHA256Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($r.serverSeed))).Replace('-','').ToLower() -eq $r.commit) { "COMMIT OPENS" } else { "TAMPERED" }
```

On macOS or Linux, the commit is just a plain hash of the seed string:

```bash
printf %s "9a482a4a080f28a360253fd7136112d7ae8eb5aadc9a126f5f8d175bcd16decf" | sha256sum
```

That prints `d79ce062125c83c08ce6d33411ea2d55c3f936bb13b298e1125bb9f72f411d1c`,
the commit from the sample receipt above.

This checks the commitment only, not the winner. For the full check, use the
Verify tab or `node verify.js`.

---

## Reimplementing the verifier

If you want to audit this in Python, Rust, Go or anything else, the exact
byte-level specification — encodings, separators, RNG consumption order per
game mode, and computed test vectors — is in [PROTOCOL.md](PROTOCOL.md).


## License

MIT — see [LICENSE](LICENSE). The engine, the CLI verifier and the protocol
stay free and auditable so anyone can check a draw.
