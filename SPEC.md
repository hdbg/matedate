# MateDate — Full Product & Technical Spec

*An AI "dating-conversation-as-chess" analyzer with PvE/PvP ELO play, a viral shareable "game review" card, and a privacy-first screenshot pipeline. Web-first, mobile-first, US/EU.*

---

## 0. One-paragraph summary
MateDate grades flirting like a chess engine. Every message in a dating conversation gets a chess-style classification (Brilliant `!!`, Great, Good, Inaccuracy, Mistake, Blunder `??` — plus the game-ending Checkmate `#`, won by landing the date or lost by getting blocked), an eval swing, an overall accuracy %, and a persistent rizz rating (ELO). Users play three ways — solo against an AI date, ranked against other humans, or by submitting a real conversation screenshot for a "game review" — and every mode outputs the same branded, shareable, anonymized card that drives organic growth. Monetization is freemium → 3-day trial → weekly subscription, with the "best move" reveal as the core paywall lever and one-time credits for non-subscribers. The format is already validated by r/TextingTheory, a community that does this by hand and goes viral doing it.

---

## 1. Product Principles (non-negotiables)
1. **Web-first.** A mobile web app is the product. Native apps are deferred until web proves economics. This avoids the 30% app-store cut and app-store review exposure.
2. **The shareable card is the marketing.** Every output is a branded, TikTok-dimensioned card. Growth is organic (UGC + seeding), not paid ads.
3. **The edge lives in the engine's verdict, never in shaming a person.** "That was a −3.4 Blunder" is funny; rating someone's face is not. Self-improvement framing throughout.
4. **Privacy is structural, not bolted on.** Raw screenshots are ephemeral and never persisted. PII is redacted before anything is stored, rendered, or sent to an LLM.
5. **No deception about who is human.** Any non-human opponent is visibly labeled. No interface ever represents a bot as a real user.

---

## 2. Game Modes & Matchmaking Liquidity

### 2.1 Solo mode — PvE vs. the AI date *(default first-run experience)*
The user flirts directly with an AI persona that responds in character; the engine scores the user's side against the best-move line. Always instant (no matchmaking), safest configuration (no stranger, nothing to redact, no third-party consent), and the best onboarding. Home of **daily puzzles** and **boss personas**. This is the default experience a new user hits; human PvP is the competitive layer on top.

### 2.2 Ranked mode — PvH (player vs. human)
Two players are matched and given the **same AI persona, same scenario, same opening line**. Turn-based, best-of-N exchanges. After each round the engine scores both players' messages and awards the round to whoever moved the persona's hidden interest meter further. Winner takes ELO on a global ladder with tiers.
- **Fairness = shareability:** identical persona/prompt for both makes results arguable, and arguable results get shared.
- **Hidden persona "type"** (into hiking / dark humor / dry wit) that players must *read* — creates a real skill ceiling and rating curve.
- Players only ever flirt with the AI, never each other → **zero** harassment/minor-safety surface.

### 2.3 Practice mode — disclosed AI opponents + solo fallback
Instant, unlimited matches against **AI opponents that are badged as AI** ("🤖 RizzBot-1400"). Does not affect ranked ELO (or affects a separate casual rating). This is the honest liquidity solution.

### 2.4 Matchmaking liquidity — how "always instant" works without lying
The thin-liquidity problem (not enough live humans at launch) is solved three honest ways, never with undisclosed bots:
1. **Solo fallback (open):** no human available → drop into a scored AI-date round framed as "Practice / Solo challenge." Instant, true, free to build (it's mode 2.1).
2. **Ghost / replay duels (labeled):** compete against **recorded past rounds** of real users on the same persona/scenario ("beat StrangerX's earlier line"). Real human competition, time-shifted, needs zero concurrent users. Clearly labeled as a past attempt.
3. **Disclosed AI opponents (badged):** as in 2.3.

**Hard rule:** any non-human opponent is visibly labeled. Ranked-ELO effects apply only to human/ghost matches so the ladder stays legitimate.

> **Why no undisclosed bots:** telling users a bot is a real person is the exact FTC-deception fact pattern from the Ashley Madison "engager bots" case ($1.6M settlement + lasting reputational damage). In a dating-adjacent product with a paywall, it's an FTC "unfair/deceptive practices" and EU DSA/dark-pattern problem, it destroys the legitimacy the ELO system sells, and it reopens the "users can't tell what's real" minor-safety murk we deliberately closed. The three fixes above give 100% of the liquidity benefit with none of the exposure.

### 2.5 Screenshot review — Mode 2 *(the viral top-of-funnel)*
User submits a real conversation screenshot (with a both-parties-agreed attestation) → gets a shareable, anonymized game-review card. Pipeline detailed in §5. This is interactive/synchronous, not a background job (see §5.1 for why).

### 2.6 Time controls & flaking prevention
Ranked matches are clocked, chess-style, so players can't stall or abandon mid-match ("flaking"). Each mode sets a per-move budget:
- **Bullet — 20s/move**
- **Rapid — 40s/move**
- **Classical — 60s/move**

When it becomes a player's turn, their move clock starts. Submitting before the deadline advances play; letting the clock hit zero **forfeits the match automatically** — the opponent wins on time (`end_reason = timeout`), exactly like a flag fall in chess. Players pair only with others who queued for the **same time control** (separate pools), and the chosen control is snapshotted on the match so both sides play identical conditions — preserving the "same persona, same scenario, same clock" fairness that makes results arguable and shareable. Ghost/replay duels inherit the recorded attempt's control. A timeout is a loss and counts for ranked ELO; repeated flaking can later feed the §3 anti-abuse rate-limits.

**The clock only runs during a player's own decision time — never during system or opponent time.** As in chess, at most one player's clock runs at a time, and it counts down only while that player is on the clock deciding their move. The clock **stops the instant the player submits**, and stays stopped through everything outside their control: LLM grading of the submitted move, persona-reply generation, and the opponent's turn. It **resumes (or the opponent's starts) only when it is again that player's turn to act**. So neither engine latency nor the other player's thinking can burn a player's time — a player can only ever flag on their *own* deliberation. The server is authoritative on all clock start/stop/resume transitions (clients never self-report elapsed time); the UI reflects this by showing the clock as paused/idle whenever it isn't the local player's turn.

### 2.7 Gender & preference matching
At onboarding every player sets **their own gender** and the **gender they're looking for** (both single-select — men or women — in the 18+ dating context of §8.3). Personas and puzzles each carry the gender they portray. Matching then follows one rule per mode:
- **Solo / VS-AI (§2.1, §2.3):** the player is served an AI date whose gender is the one they're **looking for**. If no persona of that gender is available yet, solo still starts instantly on any active persona — liquidity beats strictness (§2.4).
- **Puzzles (§2.1):** identical to VS-AI — only puzzles whose sender gender matches the player's preference are served.
- **Ranked PvP (§2.2):** two players are paired only when they **share the same gender *and* are looking for the same gender**; the persona they both play is of that sought gender. This preserves the "same persona, same scenario" fairness (both are dating the same kind of date) and pools the ladder by identity + preference. Ghost/replay duels inherit the recorded attempt's persona, which is already the right gender.

Preference is **server-authoritative** for pairing, like the clock and grading: the matchmaking snapshot pins each player's gender/seeking to their real profile, so a client can't self-select an easier or different pool.

---

## 3. The Scoring Engine

- **The "eval"** is a hidden 0–100 interest/attraction state the persona holds; each message moves it. Rendered as an eval bar + per-turn swing. **The bounds are mating squares:** 100 = the persona is won over (date secured), 0 = the persona is done (block/unmatch) — reaching either bound ends the game immediately (see Checkmate below).
- **Move classification** maps eval delta → label, except **Checkmate**, which is terminal and outranks any delta label. Starting thresholds (tune on data), swing in pawn scale (eval delta ÷ 10):

  | Class | Trigger (swing) | Quality weight |
  |---|---|---|
  | Checkmate `#` (win) | eval reaches **100** — date landed; game ends won | 100 |
  | Brilliant `!!` | ≥ +2.5 and non-obvious | 96 |
  | Great `!` | +1.2 to +2.5 | 85 |
  | Good `✓` | +0.2 to +1.2 | 70 |
  | Inaccuracy `?!` | −0.8 to +0.2 | 50 |
  | Mistake `?` | −2.0 to −0.8 | 30 |
  | Blunder `??` | ≤ −2.0 | 10 |
  | Checkmate `#` (loss) | eval reaches **0** — blocked; game ends lost | 0 |

  Rebalanced from the pre-checkmate ramp: Brilliant moves up (+2.0 → +2.5) because the true crown is now delivering mate, and Blunder widens (−2.5 → −2.0) because the catastrophic case (getting blocked) now has its own class — a Blunder is serious but survivable, exactly like chess.
- **Checkmate** is the one **bidirectional, game-ending** class — the same glyph `#`, opposite signs (the §3.1 apex tier shares the name deliberately):
  - **Checkmate for (win):** the player lands the date — the persona explicitly agrees to go out. The engine verdict flags it (the positive twin of `is_blocked`) and the eval clamps to 100, so the label still derives from the number, never from the model. Ends the game pre-emptively as a **win** (`end_reason = date_landed`, working name) before the exchange cap; counts as quality 100 and should carry the largest positive rating delta — it's the best possible result.
  - **Checkmate against (loss):** the persona blocks/unmatches (the existing `is_blocked` path). Eval clamps to 0; the move is classified Checkmate (loss), not Blunder, and the game ends as today (`end_reason = blocked`) — parting response first, then the finish.
  - **In ranked PvH:** a checkmate ends that player's line instantly — mate-for wins the round outright, mate-against loses it outright, regardless of the opponent's accuracy.
- **Accuracy %** = how close the player's moves were to the engine's best-move line across the conversation.
- **Best move** = the engine's top suggested line at each turn (the paid reveal — see §7.2).
- **ELO:** standard Elo. PvH — both players score vs. the same persona; higher round-accuracy wins the round; rounds decide the match; match result updates Elo (K≈32 early, decaying). Screenshot mode — award a provisional rating from accuracy so solo users get a number to chase/share.
- **Puzzles:** curated single-turn positions with a known best move; grade the guess by eval delta.
- **Anti-abuse:** rate-limit; detect copy-pasted/AI-generated inputs for ranked; cap Elo swings.

**Implementation note:** the engine is fundamentally an LLM orchestration workload (classify, eval, best-move) — I/O-bound, tuned constantly. It lives in Python (see §4), not Rust, because iteration speed on prompt/threshold/heuristic tuning is the product.

### 3.1 Rating tiers — the ladder vocabulary

Ratings render as **chess-piece tiers** climbing to a **Checkmate** apex — pieces read instantly
as a ladder, they're generic chess terms (free to use per §9 IP guidance), and the top rank lands
the brand's mate pun exactly where the prestige is. Each tier splits into divisions **III → II → I**
(ascending); each tier also carries a dating-flavor subtitle used on badges/share cards — the rank
*string* stays clean ("Bishop II"), the flavor lives in the art.

| Tier | ELO band | Divisions | Flavor subtitle |
|---|---|---|---|
| Pawn | 0–599 | III · II · I | "Left on Read" |
| Knight | 600–799 | III · II · I | "The Wingman" |
| Bishop | 800–999 | III · II · I | "Smooth Operator" |
| Rook | 1000–1199 | III · II · I | "Solid Foundations" |
| Queen | 1200–1399 | III · II · I | "Main Character" |
| King | 1400–1599 | III · II · I | "The Catch" |
| **Checkmate** | 1600+ | none — apex | "Found Their Mate" |

- **Band math:** 200-point tiers, ~66-point divisions (III = first ~67, II = middle ~67, I = rest).
  New accounts (1000) start at **Rook III** — the *bottom* of a tier, so early wins promote within
  Rook instead of immediately threatening demotion. At the solo ±25/game cap a division is ~3 good
  games — snappy early progression.
- **Apex is undivided.** Checkmate has no divisions (the Radiant/Challenger pattern — apex tiers
  feel better undivided); display the raw rating number there instead, chess-style.
- **Derived, never stored.** Tier = pure function of the rating, computed on read — same principle
  as move classification (eval delta → label). No enum column, no sync problem, and re-banding
  later is a constant change, not a migration.
- **One scheme, three ladders.** The same bands apply to all three ratings (PvE `elo_rating`,
  ranked PvH `ranked_elo`, practice `casual_rating`); only the **ranked** badge is displayed
  prominently, keeping the competitive ladder the legitimate one (§2.4).
- **Provisional rank:** below ~5 rated games show **"Unrated"** (chess-authentic) instead of a
  tier — nobody's first share card should say Pawn III.
- **Demotion hysteresis:** a small buffer (~10 ELO) below a tier floor before demoting, so one bad
  game doesn't ping-pong a player across a tier boundary.
- **Prestige titles (later):** FIDE-parody titles layered on top at the high end — **Candidate
  Mate (CM)** at Queen, **First-Date Master (FM)** at King, **Grand Mate (GM)** at Checkmate —
  displayed before the name like chess titles ("GM PvpSandora"). Titles are cosmetic and derived
  like tiers; they're the screenshot-bait layer, not the ladder itself.

---

## 4. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | **Next.js (React)** | Distribution is web links shared into TikTok/Reddit/iMessage → needs fast SSR first paint in in-app browsers, real OG/link-preview images, and SEO. Flutter Web (CanvasKit) is bad at all three and ships a heavy engine before first paint. |
| **Share-card rendering** | **`@vercel/og` / Satori** | Renders the game-review card to a real PNG server-side at a stable URL — serves both the downloadable share asset *and* the link-preview image. |
| **DB / Auth / Realtime** | **Supabase** (Postgres + Auth + RLS + Realtime) | Postgres for ratings/accounts/match history; Auth for account + 18+ gate; RLS so users see only their own data; Realtime for async-PvP result push. |
| **Work queue** | **pgmq / Supabase Queues** | Durable pull queue (visibility timeouts, acks, retries) for PvP scoring jobs. Postgres-native — no extra infra. |
| **Analysis service** | **Python / FastAPI** | Houses image preprocessing (if Python-only), Presidio redaction, LLM orchestration, scoring/ELO. Single-language, fast iteration, richest AI + Presidio ecosystem. |
| **Image preprocessing** | **Python (OpenCV + PaddleOCR/EasyOCR)** *or* keep the **existing Rust stage** behind a typed boundary | See §4.1. |
| **Payments** | **Stripe** primary + **backup high-risk MID** + **crypto fallback (NOWPayments)** | Web checkout keeps ~25–30 margin points vs. app stores; multi-processor protects against freezes (§8.4). |

### 4.1 The Python-only vs. keep-Rust decision
The screenshot preprocessing (bubble detection → OCR → send text only) is genuinely CPU-bound image work — the one place Rust is the *right* tool, and it's already implemented and working.
- **Keep Rust** if image volume is already hitting CPU limits: expose it behind a typed contract (this is the real cross-language service boundary where **protobuf earns its keep**), and stay polyglot along the CPU-bound/IO-bound line.
- **Go Python-only** if launch volume is low and single-service simplicity is worth more: OpenCV (bubble detection + avatar cropping) + PaddleOCR/EasyOCR (stronger than raw Tesseract on stylized chat UIs) + Presidio, all in one FastAPI service. Tradeoff: more CPU per request, less throughput, but one codebase to iterate.
- **Do not** migrate the LLM-scoring half into Rust for consistency — that's I/O-bound and belongs in Python regardless.

---

## 5. Pipeline Architecture

The governing rule: **the engine is always the producer of results; it is never a Realtime *consumer*.** Clients subscribe to Realtime for push; the engine pulls work from a durable queue (PvP) or serves it synchronously (screenshot). Do **not** have the Python service subscribe to Realtime for job intake — Realtime is fire-and-forget broadcast (no redelivery, duplicate delivery to multiple workers, no backpressure), which is wrong for work distribution.

### 5.1 Mode 2 (screenshot review) — synchronous, no queue
Interactive (user is waiting; there's a human-in-the-loop confirm step) **and** privacy-driven: a background job would have to fetch the raw image from storage, violating the ephemeral rule. So it's direct request/response:

```
1. POST /analyze-image
   → OCR + bubble detection + avatar crop + Presidio redaction, all IN MEMORY
   → returns redacted per-bubble transcript (tagged You/Match, with positions)
   → raw image never persisted, never forwarded
2. Browser: user edits/confirms transcript
   (OCR-correction + consent checkpoint + redaction safety net — one screen, three jobs)
3. POST /score  (confirmed text only)
   → LLM classification + eval + best-move
   → returns card data
4. Browser requests OG PNG render (Satori) at a stable URL
```
If scoring feels slow, **stream** the response — keep it synchronous so the image stays ephemeral.

### 5.2 Mode 1 (ranked PvP) — durable queue + Realtime push
Genuinely multi-party and time-decoupled (A moves now, B later, both need notifying):

```
1. POST /move → FastAPI writes the move row
2. If the move completes the round (both players in):
   → enqueue a scoring job on pgmq (visibility timeout + ack + retry)
3. Python worker polls pgmq (pgmq.read), scores the round,
   writes the result row, acks/deletes the message
4. Both players' browsers are subscribed via Supabase Realtime to the match
   → the result-row write pushes the update to them automatically
```
- Worker polls **the queue**; clients subscribe to **Realtime**. The Python side never subscribes to Realtime.
- **MVP simplification:** you may score inline in the round-completing request and let the DB write fan out via Realtime; add the pgmq worker only when concurrency/spikes justify it. When you do, reach for pgmq, not Realtime.

### 5.3 Data-retention rule (applies everywhere)
Raw screenshots live only in memory during the request and are dropped. Supabase stores structured data only — ratings, match history, and (optionally) the *cleaned, redacted* transcript. Never route raw uploads into Supabase Storage. Avatar/face regions are cropped at the image stage (Presidio only touches text, never faces).

---

## 6. Privacy & Redaction (Mode 2)

Uploading a third party's messages is a real consent/data issue. Layered defense:
1. **Attestation checkbox** (both parties agreed) — good-faith, not sufficient alone.
2. **Presidio** — `analyzer`/`anonymizer` for PERSON, PHONE, EMAIL, LOCATION, handles; redact **before** any LLM sees the text (data minimization). (`presidio-image-redactor` if redacting in-image; but re-rendering from cleaned text is preferred — see §9.)
3. **Face/avatar crop** at the image stage (the only place that can — Presidio is text-only).
4. **User confirmation** of the redacted transcript before scoring/sharing (catches NER misses; second consent moment).
5. **No retention** — process in memory, render, drop the raw within the request.
6. **One-tap report/takedown** path.

**Legal framing:** this is **pseudonymization + data minimization**, *not* "anonymization" (GDPR's bar is irreversibility). Don't market "fully anonymous." NER can't stop *semantic* re-identification ("my coworker at [tiny company]"), so redaction reduces — not eliminates — exposure.

---

## 7. Monetization

### 7.1 Pricing architecture
- **Free tier (growth engine):** limited daily analyses (~3/day, matching category norm); classifications + accuracy + rizz rating visible and shareable; **the "best move" suggestion is blurred/locked**.
- **Trial:** **3-day free** (category standard; ~82–89% of trials start Day 0 → first-session paywall is the highest-leverage surface).
- **Core plan:** **$6.99/week (US) / €8.99/week (EU)** — above RizzGPT's floor ($2.99–$6.99/wk), below RizzAgent ($12.99/wk). Weekly-with-trial is the highest-LTV configuration (~$54.50 12-mo LTV vs. ~$7.40 without trial). Localize EU (~29–39% higher).
- **Decoy + anchor:** $12.99/month decoy + $49.99/year "best value"; **pre-select weekly-with-trial**.

### 7.2 Paywall levers (value and shareable content are cleanly separable)
1. **"Best move" reveal (primary).** Free = classifications + accuracy + rating (all shareable); paid = the actual suggested Brilliant line. Free part drives growth, paid part is the improvement people want.
2. **Full game review vs. summary** (paid = every move annotated + eval graph).
3. **Ranked PvP / matchmaking access** (paid; also protects the ladder).
4. **Daily puzzle limit** (~3 free/day; unlimited paid — the daily-habit renew driver).
5. **Unlimited screenshot analyses** (free is capped).
6. **Persona variety / difficulty** (paid unlocks boss personas + specific types).

### 7.3 One-time consumables (monetize the ~90% who won't subscribe)
- **$1.99 single detailed game review** (one full best-move unlock)
- **Battle boost / extra ranked entries**
- **"Claim your rank" one-time ELO unlock**

Consumables matter most on **web** (you control checkout, keep margin) and lift revenue-per-visitor above a subscription-only funnel.

### 7.4 Referral loop = growth + monetization
Gate the full review behind **"invite 3 friends to unlock your best moves."** Converts non-payers into acquisition and doubles as a soft paywall. Keep it **honest** (actually deliver the unlock) — broken referral gates read as deceptive and drive chargebacks/press.

### 7.5 Conversion psychology
- **Quiz-to-paywall onboarding** (3–5 screens collecting goal/style/target before the ask — maximizes sunk-cost investment).
- **Hard paywall after upload + blurred "best move"** — peak willingness to pay.
- **Transparent trial disclosure** ("3-day free trial, then $6.99/week, cancel anytime") — also the #1 defense against the chargebacks that freeze processors (§8.4).

### 7.6 Secondary revenue (later)
Affiliate (grooming/fashion/dating-app boosts) once traffic is steady; cosmetic/status (card themes, saved career stats). Keep secondary — the weekly sub + credits are the engine.

---

## 8. Risk & Compliance

### 8.1 What's already safe (by dropping photos)
No facial scanning → the BIPA/GDPR facial-recognition class-action exposure (Facebook $650M, TikTok/ByteDance $92M) that endangers face-rating apps largely doesn't apply. Apple's "objectification of real people / hot-or-not voting" guideline stops directly applying (still keep any native app framed as self-improvement).

### 8.2 Features deliberately cut (company-killers)
- **Live-stranger webcam battles = Omegle** (ran 14 years, shut down Nov 2023 amid lawsuits incl. a minor-safety case). Live, camera-on, stranger-matched, romance-framed, young audience = worst-case grooming/CSAM configuration; banned by Apple ("Chatroulette-style / random or anonymous chat"); dropped by every processor. **Not built.**
- **Secret call/date transcription = wiretapping** in all-party-consent states (much of the US, most of the EU); on-device processing doesn't cure the other party's lack of consent. Only defensible variant: coaching *your own side only* with explicit user-held consent (RizzAgent "earbud" pattern) — **shelved as legal-review-required, post-launch.**
- **Undisclosed bots posing as humans** (§2.4) — **not built**; replaced by disclosed AI + solo fallback + labeled ghost replays.

### 8.3 Still-live risks
- **Minor safety.** Audience skews young. **18+ gate**, no under-13 data (COPPA triggers on actual knowledge; up to ~$53K/violation), never market to teens.
- **TikTok policy.** Less exposed than face-rating; avoid "manipulate your way into dating" framing — keep it self-improvement/fun.
- **Dating-manipulation reputational angle.** Frame as communication coaching/confidence, not deception; add a light "for entertainment, be yourself" disclaimer.

### 8.4 Payment-processor / chargeback risk
High chargeback rates (Visa/Mastercard ceiling ≈ **1%** of transactions) escalate fast: per-chargeback fees ($15–$100), monitoring-program fines, rolling reserves (5–10% of every sale held), then **account termination** and the **MATCH list** (blacklist checked by other processors, up to 5 years) — near-extinction for a card-dependent business. Free-trial-to-weekly + impulse viral traffic is a chargeback magnet ("friendly fraud" — forgotten trials, unrecognized descriptors). Mitigations:
- Crystal-clear trial disclosure + a **recognizable billing descriptor**.
- **Easy self-serve cancellation + fast refunds** (a $6.99 refund is far cheaper than a chargeback).
- **Pre-charge reminder email** before a trial converts.
- **Backup MID + crypto fallback** so one processor souring can't zero revenue overnight.

---

## 9. The Shareable Card (design + IP)

**Format:** re-rendered branded bubbles (You/Match), per-message classifications, eval bar, accuracy %, rizz rating + ELO delta, gated "best move" reveal, anonymization trust badge. **Aspect ratio 4:5 or 9:16** for TikTok/Reels/Stories. Identical across all modes — one recognizable asset, your Wordle-grid / game-review equivalent.

**Why re-rendered bubbles, not annotated screenshots:** more private (no names/avatars/source-app UI ever in output), fully on-brand (every share markets you, not Tinder), visually consistent across modes, full canvas control. The one cost — OCR errors — is neutralized by the confirm step (§5.1).

**IP guidance (chess.com):**
- **Use freely:** the *concept* (grade moves vs. best line into named tiers) — ideas/systems aren't copyrightable — and generic chess terms ("Brilliant," "Blunder," "Checkmate").
- **Avoid:** copying or closely imitating chess.com's specific badge *artwork* (their exact colors/glyphs/shapes are protected). Draw your own icons and color system (the CDS-style palette already does this).
- **Trademark:** don't use the chess.com name/logo or imply affiliation; the "Brilliant" badge in particular has become brand-associated.
- **Recommended:** own tier vocabulary rather than chess.com's. The ladder (§3.1) uses generic
  chess pieces + an original "Checkmate" apex + original dating-flavor subtitles — chess framing
  with no chess.com-specific vocabulary.
- Have an IP attorney glance at final badges + tier names before launch (chess.com is known to enforce).

---

## 10. Virality & Growth
- **r/TextingTheory = proof + channel.** A community already annotates texts with chess terms and goes viral; seed your automated cards there and in adjacent dating/Gen-Z communities.
- **Savage-verdict hook:** "That 'idk lol' was a −3.4 Blunder — here's the Brilliant line." Funny, shareable, safe (edge is in the ruling, not shaming a person).
- **Branded game-review cards** = atomic unit of distribution.
- **PvP clips + daily puzzles** for streamer/creator content and return-visit habit.
- **Micro-creator seeding (~$50/video)** outperforms paid ads and isn't subject to ad review (only Community Guidelines).
- **No paid TikTok ads with appearance/"win at dating" shaming creative** — frame everything as fun + self-improvement.

---

## 11. Financial Model

**Funnel (organic-led, planning assumptions):**
- View → click: ~1–3% of organic views
- Click → start onboarding/upload: ~40–60%
- Upload/first analysis → paywall: ~80%
- Paywall → trial: ~10–12%
- Trial → paid: ~26–35%
- **Blended visitor → paying: ~2–4%**

**Unit economics ($6.99/wk + $1.99 credits):**
- Weekly subs are short-term; model **LTV ~$45–55/subscriber**.
- Fees: web/Stripe ~3–5% (vs. 30% app store) — the reason to stay web-first.
- Blended revenue per paying user (subs + credits): ~$25–40.

**Paths to MRR (organic-led):**
- **$10K/mo:** ~300–500 subs → ~15K–30K engaged monthly visitors at ~3%
- **$50K/mo:** ~1,500–2,500 subs → ~75K–150K visitors
- **$100K/mo:** ~3,000–5,000 subs → ~300K–500K visitors (sustained viral cadence + compounding referral loop)

---

## 12. Build & Launch Roadmap

**Stage 1 — Web MVP (wks 0–6):** Next.js web app + Supabase (Postgres/Auth/RLS/Realtime); FastAPI analysis service (Presidio + LLM scoring/ELO); image preprocessing (keep Rust behind a typed boundary *or* Python OpenCV+PaddleOCR). Game modes: **solo PvE (default)** + screenshot review; ephemeral redaction pipeline + confirm screen; Satori card rendering. Stripe + crypto fallback + backup MID. 18+ gate, no under-13 data, disclaimers.

**Stage 2 — Monetization:** free tier (blurred best move, ~3/day) → 3-day trial → $6.99/wk (decoy monthly + annual "best value"); $1.99 credits; "invite 3 to unlock" referral gate; quiz-to-paywall onboarding.

**Stage 3 — Ranked PvP + liquidity:** async PvH with pgmq worker + Realtime push; ghost/replay duels; disclosed AI practice opponents; ELO ladder + daily puzzles.

**Stage 4 — Viral growth:** seed 20–50 micro-creators (~$50/post); TikTok-dimensioned cards + "rizz rating climb" content; seed r/TextingTheory-style communities; court streamers.

**Stage 5 — Scale & defend:** affiliate revenue once traffic is steady; native apps only after web proves out (self-improvement framing); privacy lawyer before scaling US traffic; platform takedown/appeal playbook; extract Rust services only where a profiler says CPU-bound, adding protobuf at that real boundary.

---

## 13. Trigger-Based Benchmarks
- Visitor→paid **≥3%** and weekly retention beats ~4 weeks → scale spend / add Spark Ads on best organic clips.
- Chargebacks **>~1%** or a processor flags you → activate backup MID/crypto, tighten trial disclosure immediately.
- Organic TikTok CTR **<1%** → the hook/card is the problem; iterate creative before spending.
- Press/platform scrutiny spikes → push brand voice further toward "communication coach," strengthen age assurance.

---

## 14. Caveats
- Competitor revenue figures (RIZZ ~$190K/mo, download counts) are largely **self-reported**; treat as directional.
- Conversion/LTV benchmarks are **cross-category** (Adapty/RevenueCat); no rizz-specific public conversion study exists — funnel numbers are informed estimates.
- The regulatory environment (COPPA updates, biometric laws, FTC age-assurance, EU DSA/dark-pattern rules) is **moving fast**; figures are current as of mid-2026 and should be re-checked.
- Still a **sensitive category** (dating, young users, third-party private messages). The redaction pipeline, disclosed-opponent rule, and cut features reduce but don't eliminate risk — get a privacy/consumer-law review before scaling US/EU traffic.
- This spec reflects product/architecture decisions, not legal advice on any specific design (IP badges, trial terms, bot disclosure). Have counsel review before launch.

