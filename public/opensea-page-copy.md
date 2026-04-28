# THE 1969 — OpenSea Collection Page Blueprint

Drop these into OpenSea Studio's "Customize your collection" sections.
Order suggested top → bottom. Every section below has its **exact copy**
and **exact image file** ready to upload.

> All images live in `public/`. They are SVG, but OpenSea's section
> uploaders accept SVG directly. If a particular field rejects SVG, run
> the SVG through `convert-sneak-peeks.html` (or cloudconvert.com) to
> get a PNG — keep dimensions identical.

---

## §1 — Media and text → "Text over background media"

**Background image:** `public/opensea-banner.svg` (1500×500, dark
editorial frame with vault grid + lime corner brackets — already used
for the collection banner; reusing here ties the page hero to the
collection identity)

**Heading (overlay):**
```
A monochrome assembly.
```

**Body (overlay):**
```
1,969 portraits. Hand-engineered, fully on-chain metadata, no roadmap
theater. Each piece was claimed, composed, and submitted by a verified
holder over the months leading to mint. This is not a PFP factory —
it is a record of who showed up.
```

**Optional CTA button:** `Begin →` linking to `https://the1969.io/drop`

---

## §2 — Media and text → "Text block"

No image needed for this one. Pure typography section.

**Heading:**
```
Built by the holders, not for them.
```

**Body (markdown, paragraphs separated by blank line):**
```
A claim window opens every five hours. Twenty trait slots release into
a public pool. Holders compose — eight slots, eight choices — and
submit a bust. When the work is signed, the wallet is written into the
allowlist. No pre-mints. No team mints behind closed doors. No drops
to wallets that didn't earn them.

Each portrait is a small piece of evidence. Together they become an
archive of a process — finite, dated, and signed by every hand that
shaped it.
```

---

## §3 — Carousel → "Timeline" (4 cards)

Use the **Timeline** carousel variant. Cards run in chronological order.
Each card uses the matching SVG below as its image.

### Card 1 — The First Assembly
- **Image:** `public/card-assembly-1.svg`
- **Date label:** `Pre-mint · ongoing`
- **Title:** `The First Assembly`
- **Body:**
  ```
  Holders apply through the pre-whitelist. Admin reviews each request.
  Approval grants a guaranteed seat at the mint. The list is finite.
  The seats are not for sale.
  ```

### Card 2 — The Second Assembly
- **Image:** `public/card-assembly-2.svg`
- **Date label:** `April 2026`
- **Title:** `The Second Assembly`
- **Body:**
  ```
  The drop engine runs every five hours. 20 trait slots per session,
  spread across the window so bots cannot sweep at :00:00. Holders
  compose their bust, submit, and earn entry to the allowlist.
  ```

### Card 3 — The Third Assembly
- **Image:** `public/card-assembly-3.svg`
- **Date label:** `May 1, 2026`
- **Title:** `The Third Assembly`
- **Body:**
  ```
  Four mint stages run in sequence — Prophet (team) · Tier 1 (GTD,
  0.002 ETH) · Tier 2 (FCFS, 0.002 ETH) · Public (0.005 ETH).
  1,969 total editions. No restocks. No second window.
  ```

### Card 4 — The Fourth Assembly
- **Image:** `public/card-assembly-4.svg`
- **Date label:** `Post-mint`
- **Title:** `The Fourth Assembly`
- **Body:**
  ```
  The vault opens for every holder. The BUSTS economy migrates
  on-chain. The reveal lifts the seal on every portrait at once.
  The doctrine is recorded. The work begins.
  ```

---

## §4 — Carousel → "Free-form" (5 cards)

Use the **Free-form** carousel variant. These describe what a holder
gets after mint — not a roadmap, an inventory.

### Card 1 — The Vault
- **Image:** `public/card-vault.svg`
- **Title:** `The Vault`
- **Body:**
  ```
  Every holder is given a procedural architectural keep, generated
  from their X identity. Deposit BUSTS to earn yield. Bind your
  portrait for a flat bonus. Withdraw anytime. Defend it.
  ```

### Card 2 — $BUSTS
- **Image:** `public/card-busts.svg`
- **Title:** `$BUSTS`
- **Body:**
  ```
  The ecosystem currency. Off-chain through mint as a balance and
  ledger. On-chain post-mint as an ERC-20. Earned through drops,
  build rewards, vault yield, Discord activity, and seasonal games.
  ```

### Card 3 — Eight Oaths
- **Image:** `public/card-oaths.svg`
- **Title:** `Eight Oaths`
- **Body:**
  ```
  Eight upgrade tracks for the vault — walls, watchtower, vanguard,
  wards, sentries, beacon, forge, oath. Three tiers each. Each tier
  is permanent and non-refundable. Each deepens what the vault can
  survive.
  ```

### Card 4 — The Doctrine
- **Image:** `public/card-doctrine.svg`
- **Title:** `The Doctrine`
- **Body:**
  ```
  Decisions about the collection are recorded by the assembly, not
  announced from the team. Proposals are signed. Outcomes are
  archived. A community process kept honest by being public.
  ```

### Card 5 — The Reveal
- **Image:** `public/card-reveal.svg`
- **Title:** `The Reveal`
- **Body:**
  ```
  Sealed at mint. Every token shows the same placeholder until the
  assembly is complete. When the seal lifts, the entire collection
  reveals at once. No trait-sniping windows. No staggered release.
  One shared moment.
  ```

---

## §5 — Media and text → "Text with media side by side"

**Image (the media side):** `public/litepaper-live-banner.svg`
(960×540 editorial banner with TOC card)

**Heading:**
```
A technical document.
```

**Body:**
```
Eleven sections. ~14 minutes. Architecture, drop mechanics, anti-bot
defense, the BUSTS economy, the vault, the doctrine. Read what we
built. Read why each decision was made — including the ones that hurt
to make.
```

**CTA button label:** `Read the litepaper →`
**CTA URL:** `https://the1969.io/litepaper`

---

## §6 — FAQ (8 questions)

Add as a single FAQ section. Each Q/A pair below is one entry.

### Q1
**Question:** `What is THE 1969?`
**Answer:**
```
A monochrome portrait collective on Ethereum. 1,969 hand-engineered
busts, each composed from a curated set of traits over months by a
verified holder.
```

### Q2
**Question:** `How were the portraits made?`
**Answer:**
```
Holders earn trait slots through a public drop engine. Every five
hours, 20 traits release. Holders compose eight slots — background,
outfit, skin, eyes, facial hair, hair, headwear, face mark — and
submit a finished bust. Approval grants a mint seat.
```

### Q3
**Question:** `Is there team allocation?`
**Answer:**
```
Yes. A modest reserve for the team in the THE PROPHET stage. The rest
are distributed across allowlist tiers and public mint. No private
rounds. No friends-and-family. The team allocation is public from
day one.
```

### Q4
**Question:** `What are the mint stages?`
**Answer:**
```
THE PROPHET (team, free) · Tier 1 GTD (allowlist, 0.002 ETH) · Tier 2
FCFS (drop-eligible, 0.002 ETH) · Public (0.005 ETH). Each runs in
sequence on May 1, 2026.
```

### Q5
**Question:** `Do I need a wallet to participate?`
**Answer:**
```
Eventually. You can build a portrait with X auth alone, but the
allowlist seat is bound to a wallet you connect on the build page.
No KYC. No personal data beyond your X handle.
```

### Q6
**Question:** `What is $BUSTS?`
**Answer:**
```
The ecosystem currency. Off-chain through mint as a balance and
ledger. On-chain post-mint as an ERC-20. Earned via drops, build
rewards, vault yield, Discord activity, and seasonal games. Spent on
vault upgrades and game entries.
```

### Q7
**Question:** `When is reveal?`
**Answer:**
```
After mint completes. Tokens are sealed at mint with a placeholder and
revealed in a single moment once the assembly is full. This protects
against trait-sniping and turns the reveal into a shared event.
```

### Q8
**Question:** `Is the metadata on-chain?`
**Answer:**
```
Metadata and images are pinned to IPFS at mint. The contract is a
standard OpenSea Drop ERC-721. Post-mint, the vault and BUSTS
migrate to dedicated on-chain contracts.
```

---

## §7 — Media and text → "Text block" (Closer · optional)

No image. Sits at the bottom of the page as a final beat.

**Heading:**
```
The Vault must not burn again.
```

**Body (italic):**
```
Built for taste, not for farmers. The work is recorded. The art is
made by those who arrived. Witnesses, not customers.

the1969.io
```

---

## Image inventory — files used across this page

| Section | File | Purpose |
|---|---|---|
| §1 hero background | `public/opensea-banner.svg` | 1500×500 editorial banner |
| §3 timeline cards | `public/card-assembly-1.svg` | First Assembly · application |
| §3 | `public/card-assembly-2.svg` | Second Assembly · drop |
| §3 | `public/card-assembly-3.svg` | Third Assembly · mint stages |
| §3 | `public/card-assembly-4.svg` | Fourth Assembly · vault opens |
| §4 free-form cards | `public/card-vault.svg` | The Vault |
| §4 | `public/card-busts.svg` | $BUSTS |
| §4 | `public/card-oaths.svg` | Eight Oaths |
| §4 | `public/card-doctrine.svg` | The Doctrine |
| §4 | `public/card-reveal.svg` | The Reveal |
| §5 side-by-side | `public/litepaper-live-banner.svg` | Litepaper banner |

11 total images, all already in your `public/` folder.

---

## Order of operations (15-25 min)

1. **Add a section → Media and text → "Text over background media"** → §1
2. **Add a section → Media and text → "Text block"** → §2
3. **Add a section → Carousel → "Timeline"** → §3 (4 cards)
4. **Add a section → Carousel → "Free-form"** → §4 (5 cards)
5. **Add a section → Media and text → "Text with media side by side"** → §5
6. **Add a section → FAQ** → §6 (8 entries)
7. **Add a section → Media and text → "Text block"** → §7 (optional closer)
8. **Publish Changes** at the bottom right

---

## Brand guardrails (so the voice stays consistent if you edit)

- **Tone:** editorial, confident, terse. No hype words ("amazing",
  "incredible", "to the moon"). No emojis except `⌬`/`§`/`·`.
- **Voice:** the project speaks as a *record* or *document*, not as a
  product pitch. Use "the assembly", "the work", "the witnesses".
- **Recurring phrases:** "no roadmap theater", "witnessed, not
  announced", "the Vault must not burn again", "1,969", "five-hour
  cycle".
- **Typography references in copy:** italic for emphasis (`*like
  this*`), mono caps for codes/IDs (`§01`, `THE PROPHET`).
- **No promises about price, floor, or returns.** Ever.
