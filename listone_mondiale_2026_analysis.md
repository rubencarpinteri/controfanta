# Listone Mondiale 2026 — Fantasy-Economy Analysis & Recalibration

**Reference benchmark:** Official Fantacalcio Serie A listone 2025/26 (500-credit economy)
**Subject under investigation:** FantaMaster Mundial 2026 listone (100-credit economy)
**Date:** 2026-06-04

---

## 0. TL;DR — Verdict

**Usable, but improved by recalibration.** The original Mondiale listone is structurally sound in its **bottom and middle** — the median, the role ordering, and the floor already match the Serie A reference almost perfectly. It has **one real flaw: the top tier is compressed**. The ceiling is hard-capped at 20 (only 20% of a 100-credit budget), so a manager can roster **three max-price aces (Mbappé + Haaland + Kane) for 82 credits and still have change**. That breaks the trademark scarcity of a fantasy market.

The fix is **not** a rewrite. **82.6% of prices are left untouched.** Only the upper tail (prices ≥ 8, i.e. the top ~17% of players) is stretched upward so that the elite becomes genuinely scarce — one superstar now costs 44% of your budget, mirroring Serie A's elite share. Every extra star now forces a visible sacrifice.

---

## 1. Data parsing & integrity

### Serie A (reference)
- Source: `Quotazioni_Fantacalcio_Stagione_2025_26 - Tutti.csv`
- Columns: `R` (macro-role P/D/C/A), `RM` (micro-role), `Nome`, `Squadra`, `FVM` (Fantavalore di Mercato — the price signal used here).
- **532 valid players**, 20 teams. No malformed rows. Price column = FVM.

### Mondiale (subject)
- Source: `listone_fantamaster_mundial_2026.pdf` — 49-page PDF, **one nation per page**, table `Ruolo | Giocatore | Quotazione`.
- Parsed cleanly into **1,248 players across 48 nations**, **exactly 26 players per nation**, zero malformed/broken rows, zero missing prices, **no duplicates**, no stray role labels. Roles map P→Por, D→Dif, C→Cen, A→Att.
- Role pool sizes: **P 145, D 416, C 422, A 265** — more than enough depth to fill any 25-man squad (3 GK / 8 D / 8 C / 6 A) drawn from the **global** pool.

> No data was invented. Every original price is preserved in the output CSV under `original_price`.

---

## 2. Serie A reference economy (500 credits, 25 players)

| Metric | Overall | P | D | C | A |
|---|---|---|---|---|---|
| Min | 1 | 1 | 1 | 1 | 1 |
| Median | 11 | 1 | 11 | 12 | 12 |
| Mean | 22.7 | 11.5 | 16.2 | 25.5 | 36.9 |
| p90 | 52 | 32 | 27 | 59 | 94 |
| p95 | 89 | 74 | 51 | 96 | 175 |
| p99 | 214 | 98 | 199 | 200 | 314 |
| Max | 350 | 105 | 320 | 245 | 350 |

**Budget-relative shape (the part that actually transfers):**
- Top player = **70% of budget** (350/500). A single superstar nearly *is* your flexible budget.
- p99 player = **43%** of budget; p95 = **17.8%**; p90 = **10.4%**.
- Median = **2.2%** of budget; mean = **4.5%**.
- Role ordering by mean: **A > C > D > P** (forwards most expensive, keepers cheapest).
- **Squad-building pressure:** with 25 slots and a mean of 22.7, a squad of average players would cost ~568 — *more than the budget*. You are structurally forced to pair a few premiums with cheap filler. Realistically a strong Serie A team carries **1 superstar + 2–3 semi-premiums + a mid-tier core + 1-credit bench fillers**.

The lesson exported to the Mondiale is **not** the absolute numbers — it is this *shape*: a steep, scarce top, a thin discount on the median, a populated middle, and a deep 1-credit floor.

---

## 3. Mondiale economy — ORIGINAL prices (100 credits, 25 players)

| Metric | Overall | P | D | C | A |
|---|---|---|---|---|---|
| Min | 1 | 1 | 1 | 1 | 1 |
| Median | 3 | 1 | 2 | 3 | 3 |
| Mean | 4.1 | 2.8 | 3.5 | 4.5 | 5.3 |
| p90 | 10 | 7.6 | 7.5 | 10 | 12.6 |
| p95 | 12 | 10 | 10 | 13 | 16 |
| p99 | 17 | 12 | 13 | 15 | 20 |
| Max | 20 | 12 | 15 | 18 | 20 |

**Budget-relative shape:**
- Top player = **20% of budget** (20/100) — versus **70%** in Serie A. The ceiling is crushed.
- p95 = **12%** (vs 17.8%), p90 = **10%** (≈ Serie A's 10.4% ✔), median = **3%** (≈ Serie A's 2.2% ✔), mean = **4.1%** (≈ 4.5% ✔).
- Role ordering A > C > D > P — **identical to Serie A ✔**.

**Diagnosis:** the floor, the median, the mean and the role balance are *already well-calibrated*. The **only** broken region is the **top tail**: it flattens out at 20 and bunches the entire elite into a 15–20 band. The price gap between a world superstar and a solid starter is far too small.

### 3.1 The breakage, proven by simulation (original prices, 100-credit cap)

Cheapest legal 25-man squad = **25 credits** (floor of 1-credit players), leaving **75 discretionary credits**. Because the ceiling is only 20, that 75 buys a *stack* of aces:

| Test | Max players you can roster | Squad cost |
|---|---|---|
| Players priced **≥ 20** (the very top) | **3** | 82 |
| Players priced **≥ 18** | **4** | 93 |
| Players priced **≥ 15** | **5** | 95 |
| Players priced **≥ 12** (top ~5%) | **6** | 91 |

A concrete legal team under the original prices: **Mbappé (20) + Haaland (20) + Kane (20)** up front, fill the rest with 1-credit players → **82 credits, 18 to spare.** Three of the five best players in the world, and you haven't even spent your budget. This is precisely the "6–7 ultra-tops too easily" failure mode to avoid.

---

## 4. Cross-economy comparison

| Indicator (as % of budget) | Serie A (500) | Mondiale ORIGINAL (100) | Mondiale REFINED (100) |
|---|---|---|---|
| Top player | **70%** | 20% ❌ | **44%** ✔ |
| p99 player | 43% | 17% ❌ | **34%** ✔ |
| p95 player | 17.8% | 12% | **18%** ✔ |
| p90 player | 10.4% | 10% ✔ | **12%** ✔ |
| Median player | 2.2% | 3% ✔ | 3% ✔ |
| Mean player | 4.5% | 4.1% ✔ | 5.0% ✔ |
| Max aces stackable (≥top tier) | ~1 | **3** ❌ | **1** ✔ |

The comparison makes the single defect unambiguous: **every percentile up to p90 already agrees with the reference; only the p95→max segment is too flat.** A blind ÷5 of Serie A numbers would have wrongly rebuilt the whole curve. Instead the data says: *leave the bottom 90% alone, stretch the top 10%.*

---

## 5. Calibration logic

**Principle:** preserve what works, repair only the tail. Map original → refined with a **piecewise convex tail-stretch**, anchored so the Mondiale's budget-relative top matches Serie A's elite scarcity (top ≈ 44% of budget, between Serie A's p99 of 43% and its outlier headline of 70% — deliberately *not* the brutal 70%, see §7 on the engine).

Mapping (original price → refined price):

| orig | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| **refined** | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9 | 10 | 12 | 15 | 18 | 21 | 24 | 28 | 31 | 34 | 37 | 40 | 44 |

- **Prices 1–7 (the floor and lower-mid, ≈ 83% of all players): identity, untouched.** They already match the Serie A budget-share.
- **Prices 8–10:** a gentle lift (the upper-mid begins to separate).
- **Prices 11–20:** convex expansion. The elite fans out from a 1-credit-wide band into a real ladder, so an ace is unmistakably more expensive than a good starter.
- All outputs are **integers, minimum 1**, every player preserved.

**Resulting change footprint:**
- **1,031 / 1,248 players unchanged (82.6%).**
- 217 players raised; raises are concentrated in the elite (e.g. +24 for the five 20→44 aces, +19 for the 18→37 tier).
- No price was ever lowered (the middle was already correct; lowering it would have created the opposite failure of forcing 1-credit scraps).

### Role treatment
No role-specific multiplier was needed: the original role ordering (A > C > D > P) already matched Serie A. Because the tail-stretch acts on high prices, it *automatically* inflates the forward and attacking-mid elite the most (max A 20→44, C 18→37, D 15→28, P 12→18) — reproducing the Serie A role-scarcity hierarchy without hand-tuning.

### Refined distribution

| Metric | Overall | P | D | C | A |
|---|---|---|---|---|---|
| Median | 3 | 1 | 2 | 3 | 3 |
| Mean | 5.0 | 3.1 | 3.9 | 5.4 | 7.3 |
| p90 | 12 | – | – | – | – |
| p95 | 18 | – | – | – | – |
| p99 | 34 | – | – | – | – |
| Max | 44 | 18 | 28 | 37 | 44 |

---

## 6. Squad simulations under REFINED prices (100-credit cap)

Floor of a legal 25-man squad is still **25 credits**, so balanced squads remain comfortably affordable. But the new ceiling means stacking aces now bites:

| Test | Max players rosterable | Squad cost |
|---|---|---|
| Players priced **≥ 44** (the very top) | **1** | 68 |
| Players priced **≥ 34** | **2** | 91 |
| Players priced **≥ 21** | **3** | 85 |
| Players priced **≥ 18** | **4** | 93 |

From 3 stackable aces down to **1**. Exactly the target.

### 6.1 Balanced squad — 96/100 (P3 D36 C31 A26)
- **D:** C. Romero 15, N. Molina 9, Alaba 7, +5×1 · **C:** Tielemans 12, Nico Paz 7, Sabitzer 7, +5×1 · **A:** Trossard 15, Gregoritsch 7, +4×1 · **P:** 3×1
- *Proves:* a competitive spine (15/15/12/9/7-class players across every line) is fully affordable **without any superstar**. This is the intended "default" team — strong starting XI, thin bench.

### 6.2 Star-heavy squad — 68/100 (one ace per line attempted)
- **A:** **Mbappé 44** + 5×1 · **C:** 8×1 · **D:** 8×1 · **P:** 3×1
- *Proves:* a single max-ace (Mbappé, 44 = 44% of budget) leaves only 56 credits for 24 players. Even spent entirely on 1-credit fillers the team costs just 68 — and **a second ace (≥34) would push you to 91+ and gut the rest of the squad.** You can build *around* one star; you cannot build around three.

### 6.3 Value-heavy squad — 97/100 (no aces, deep mid-tier)
- **D:** Molina 9, Alaba 7, De Cuyper 7 · **C:** Hadj Moussa 9, Nico Paz 7, Sabitzer 7, Aouar 6 · **A:** Arnautović 10, Gregoritsch 7, Lukébakio 7 · **P:** Çakır 7
- *Proves:* spreading the budget across 6–10-credit players fields a squad with **no 1-credit weaknesses in the starting lines** and zero superstars. A legitimate, distinct strategy — the mid-tier is populated enough to support it.

### 6.4 Max ultra-top attempt — 98/100 (P3 D8 C8 A79)
- **A:** **Mbappé 44 + Raphinha 31** + 4×1 · **C:** 8×1 · **D:** 8×1 · **P:** 3×1
- *Proves the ceiling:* the absolute most stars you can force in is **two** (44+31 = 75 credits on two players), and the price is brutal — **23 of your 25 players are 1-credit scraps.** Under the *original* prices this same strategy bought *three* 20-aces with budget left over. The recalibration converts "stack the world's best" from a free lunch into a genuine all-in gamble.

> **Practical answer to "does 100 credits feel powerful but not broken?"** Yes. 100 credits buys you a real team with one marquee name *or* a deep balanced side — but not a galáctico XI. Every extra star is paid for in visible squad depth.

---

## 7. Interaction with the CONTROFANTA engine (popularity penalty + MVP reward)

This calibration is deliberately tuned **with the engine's two signature mechanics in mind**:

- **Ownership / popularity penalty.** Because heavily-owned players are penalised, the chalk superstar (Mbappé, Haaland) is already a *risk-adjusted* pick, not a guaranteed edge. That is exactly why the top was stretched to **44% of budget and not to Serie A's punitive 70%**: the engine itself supplies part of the anti-stacking pressure, so the *price* only needs to make a second ace expensive, not impossible. Price scarcity and ownership penalty work in tandem — price stops you *buying* three aces; ownership stops the survivors from being free points.
- **MVP reward.** The MVP bonus rewards a well-chosen differential captain, which is only meaningful if there is a **rich, populated mid-tier** to hunt in. The recalibration explicitly **left the 6–18 band intact and even widened it** (the 8→9, 10→12, 11→15, 12→18 lifts) so that low-ownership 7–15-credit players remain the strategic battleground where MVP calls are won. Had the middle been compressed, the MVP game would collapse into "everyone owns the same cheap punt."

In short: the curve is shaped so that **scarcity lives at the top (price) and value lives in the middle (ownership + MVP)** — the combination that makes the CONTROFANTA weekly-draft model distinctive.

---

## 8. Final verdict

**USABLE BUT IMPROVED BY RECALIBRATION.**

- The original listone was **not structurally flawed** — its floor, median, mean and role balance were already aligned with the trusted Serie A economy.
- It had **one correctable defect**: a compressed top tier that let managers stack three ultra-tops on a 100-credit budget.
- The recalibration **preserves 82.6% of prices unchanged** and fixes only the tail, bringing top-player budget-share from 20% to 44% (matching Serie A's p99 of 43%), and cutting stackable aces from 3 to 1 — without forcing anyone into all-scrap squads (balanced and value squads remain fully viable at ≤100).

**Deliverables:**
- Refined listone: `listone_mondiale_2026_refined.csv` (1,248 rows; columns: role, role_label, player, nation, original_price, refined_price, change).
- This report: `listone_mondiale_2026_analysis.md`.
