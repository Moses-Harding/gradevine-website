# Landing Page — Audit Implementation Plan

Scope: `src/pages/index.astro` and `src/layouts/Layout.astro`.
Ordered by priority. Each item lists the location, the problem, and the exact change.
Items P1–P2 are credibility/correctness and should ship together. P3+ are improvements.

---

## P1 — "As reported in" misrepresents coverage (credibility risk)

**File:** `src/pages/index.astro`, lines ~134–143 (`.as-reported` block)

**Problem:** The label "As reported in" sits under the product with Education Week, WSJ, Inside Higher Ed, Axios, and Fox News logos. Those outlets covered the *handwriting-comeback trend*, not GradeVine. As written it reads as "GradeVine was featured in these outlets," which is false and checkable.

**Change:** Relabel so it clearly refers to the trend, not the product. Replace the label text:

```
<span class="as-reported-label">As reported in</span>
```
with:
```
<span class="as-reported-label">The shift to handwritten work, covered in</span>
```

Keep the logo list as-is. No other structural change.

(Voice note: keep it plain and factual — no cleverness. Confirm final wording with Moses if unsure.)

---

## P2 — Stat citation label/link mismatch

**File:** `src/pages/index.astro`, line ~128

**Problem:** The third stat ("80% increase in blue-book sales at UC Berkeley") is labeled `Wall Street Journal, May 2025` but the `href` points to `insidehighered.com`. Label and destination disagree.

**Change:** Make the visible attribution match the actual linked source. The link is Inside Higher Ed:

```
<a href="https://www.insidehighered.com/news/deep-dives/2025/06/17/amid-ai-plagiarism-more-professors-turn-handwritten-work" class="stat-source" target="_blank" rel="noopener">Inside Higher Ed, June 2025</a>
```

If the intent was specifically to cite the WSJ blue-book story, swap the `href` to the WSJ article instead and keep the WSJ label — but do not leave label and link pointing at different outlets. Verify the date matches whichever source is used.

---

## P3 — Strengthen hero subtitle

**File:** `src/pages/index.astro`, line 25

**Problem:** `Grade written responses on the go.` is generic and under-sells right after a strong headline. The concrete, persuasive line lives one section down in the speed claim.

**Change:** Replace the subtitle with the specific, benefit-led version (pulls the "minute per student" specificity up). Suggested:

```
<h2 class="hero-subtitle">Grade handwritten work in about a minute per student — from the phone or iPad you already carry.</h2>
```

Then de-duplicate: the `.speed-claim` section (lines 34–38) now largely repeats this. Either shorten the speed-claim copy or remove the section. Recommend keeping the hero line and cutting the standalone speed-claim section to avoid saying the same sentence twice. Get Moses's call on cut vs. shorten before deleting.

---

## P4 — Trim redundant value sections

**File:** `src/pages/index.astro`, lines 155–161 (`.value-section.alt`, feedback)

**Problem:** This section repeats How-it-works step 4 (lines 81–91) and repeats itself internally ("without writing every word" / "without writing every comment from scratch").

**Change:** Tighten the body to a single non-repetitive sentence, e.g.:

```
<p class="value-body">Save the comments you write most often and tap to apply them on the next student — detailed feedback on every paper without starting from scratch each time.</p>
```

Leave the analytics value section (lines 147–153) as-is; it adds new information.

---

## P5 — Add a hero product visual

**File:** `src/pages/index.astro`, `.hero` section (lines 22–31)

**Problem:** No product imagery above the fold; first visual is the How-it-works videos far down the page.

**Change:** Add a single product shot or short muted loop inside `.hero-content` below `.hero-cta`. Reuse an existing asset (e.g. an App Store screenshot PNG or one of `/public/videos/*.mp4` with a poster). Add matching CSS for sizing/centering and a `max-width` so it doesn't dominate on desktop. Respect `prefers-reduced-motion` (see P6) if a video is used.

---

## P6 — Video accessibility + performance

**File:** `src/pages/index.astro`, all `<video>` tags (lines 51, 63, 75, 87, 99) and `<style>`

**Problems:** Five `autoplay muted loop` MP4s with no `poster`, no lazy loading, and no reduced-motion fallback. Heavy on mobile data; ignores motion sensitivity.

**Changes:**
1. Add `preload="none"` and a `poster="..."` (export a still frame per video into `/public/videos/`) to each `<video>`.
2. Add `loading="lazy"`-equivalent behavior: keep videos out of autoplay until near viewport, or at minimum rely on `preload="none"`.
3. Add a reduced-motion rule to the `<style>` block:

```css
@media (prefers-reduced-motion: reduce) {
  .how-step-visual video,
  .hero video {
    /* show poster, don't autoplay */
  }
}
```
Since CSS can't stop autoplay, also gate autoplay in the `<script>`: if `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, remove the `autoplay` attribute / call `.pause()` on load and show the poster.

---

## P7 — Low-contrast small text (WCAG AA)

**File:** `src/layouts/Layout.astro` (`--color-gray-500: #9e9e9e`) used in `src/pages/index.astro`

**Problem:** `--color-gray-500` (#9e9e9e) on white is ~2.8:1, below the 4.5:1 AA threshold. Used for `.hero-microcopy`, `.credits-note`, `.calc-switch-label`, `.upgrade-divider span`, etc.

**Change:** For these small-text uses, switch from `var(--color-gray-500)` to `var(--color-gray-600)` (#757575, ~4.6:1) or darker. Audit each `.credits-note`, `.hero-microcopy`, and calculator label rule in the `<style>` block and bump the color. Do not change the token itself (it matches the iOS palette); change the usages.

---

## P8 — Social share image (Open Graph)

**File:** `src/layouts/Layout.astro`, lines 32 and 25

**Problem:** `og:image` is `apple-touch-icon.png` (a square icon) while `twitter:card` is `summary_large_image`. Shares render a tiny icon in a large card slot.

**Change:**
1. Create a proper 1200×630 share image, save to `/public/og-image.png` (can reuse App Store screenshot art / brand gradient + logo + headline).
2. Update line 32: `<meta property="og:image" content="https://gradevine.app/og-image.png" />`
3. Add explicit dimensions and a Twitter image:
```html
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:image" content="https://gradevine.app/og-image.png" />
```

---

## P9 — SEO additions

**File:** `src/layouts/Layout.astro`, `<head>`

**Changes:**
1. Add a canonical tag: `<link rel="canonical" href="https://gradevine.app/" />` (make per-page if the layout is reused on /support, /privacy, /terms — pass a `canonical` prop).
2. Add `SoftwareApplication` JSON-LD structured data in the `<head>` with name, OS (iOS), category (Education), offers (free tier + paid), and the App Store URL. This is an app landing page and is eligible for rich results.

---

## Verification checklist (after changes)

- [ ] `npm run build` succeeds with no errors.
- [ ] No banned terms reintroduced: grep `-niE "snap|the stack|class set|the pile|AI grading|AI evaluation|AI-powered"` in `src/pages/index.astro` returns nothing.
- [ ] "Smart evaluation" spelling/casing unchanged (it's the locked user-facing name).
- [ ] Every `stat-source` label matches its `href` outlet.
- [ ] Credit calculator still works (toggle + steppers + Smart-evaluation switch) — JS in lines 1433+ untouched or updated intentionally.
- [ ] Run a contrast check on `.hero-microcopy` and `.credits-note` (≥4.5:1).
- [ ] Validate OG tags with a share-preview debugger.
- [ ] Confirm `prefers-reduced-motion` actually prevents autoplay (test with OS setting on).

## Decisions to confirm with Moses before shipping
- P1 exact relabel wording.
- P3 whether to cut or shorten the speed-claim section.
- Source of truth for the P2 stat (Inside Higher Ed vs WSJ).
