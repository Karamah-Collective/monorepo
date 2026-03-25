# Halal Finder — Sponsorship Plan

**Prepared by:** Karamah Collective  
**Date:** March 2026  
**Version:** 1.0 — Draft  

---

## 1. Overview

Halal Finder is a free, community-driven Progressive Web App (PWA) that helps users locate halal-certified restaurants, shops, mosques, and prayer rooms across Finland. As the platform grows, we are introducing a **transparent, ethical sponsorship program** that allows local businesses to gain visibility while directly supporting the app's mission.

This document outlines the sponsorship model: what sponsors get, how it's implemented, how transparency is maintained, and how both single-location and multi-location (chain) businesses can participate.

---

## 2. Guiding Principles

1. **Transparency first.** Every sponsored element in the app is clearly labelled. Users always know when content is sponsored.
2. **Halal verification is independent.** Sponsorship has no influence on halal status tags, ratings, or user-reported data. A place's halal certification is verified independently regardless of sponsorship.
3. **Boycott overrides sponsorship.** If a place is flagged on the boycott list, all sponsorship UI is suppressed — no exceptions.
4. **Community trust is non-negotiable.** Users can tap an ℹ️ icon on any sponsor badge to read our full sponsorship policy.

---

## 3. Sponsorship Tiers

We offer three tiers, each building on the previous one:

### 3.1 Basic

A lightweight tier for small businesses wanting to show community support.

| Feature | Included |
|---|---|
| "Sponsored ✦" badge in place popup | ✅ |
| "Sponsored" chip on list card | ✅ |
| Promo code / offer | ❌ |
| Search ranking boost | ❌ |
| Enhanced map pin (breathing gold glow) | ✅ |
| Featured carousel slot | ❌ |
| Enhanced link sharing | ❌ |
| Promos pill listing | ❌ |

**Best for:** Independent restaurants that want to support the platform and get a credibility signal.

---

### 3.2 Featured

The mid-tier — visible search boost and the ability to offer promotions to users.

| Feature | Included |
|---|---|
| "Sponsored ✦" badge in place popup | ✅ |
| "Sponsored" chip on list card | ✅ |
| Promo code icon button in popup | ✅ |
| Search ranking boost (small, labelled) | ✅ |
| Enhanced map pin (breathing gold glow) | ✅ |
| Featured carousel slot | ❌ |
| Enhanced link sharing | ❌ |
| Promos pill listing | ✅ |

**Best for:** Restaurants wanting to drive foot traffic with a promo code and gain search visibility.

---

### 3.3 Spotlight

Maximum presence — the flagship tier for chains or high-commitment sponsors.

| Feature | Included |
|---|---|
| "Sponsored ✦" badge in place popup | ✅ |
| "Sponsored" chip on list card | ✅ |
| Promo code icon button in popup | ✅ |
| Search ranking boost (larger, labelled) | ✅ |
| Enhanced map pin (stronger gold glow + 20% larger) | ✅ |
| Featured carousel slot (top of places list) | ✅ |
| Enhanced link sharing (OG metadata includes "Sponsored Partner") | ✅ |
| Promos pill listing | ✅ |

**Best for:** Restaurant chains, flagship locations, or businesses wanting maximum exposure across the app.

---

## 4. Feature Details

### 4.1 Sponsor Badge (Popup)

When a user taps a sponsored place on the map, the popup displays a gold **"Sponsored ✦"** badge pill next to the place type (e.g., "Restaurant"). The badge text is the same for all tiers — users do not see which tier a sponsor has purchased. This keeps the experience clean and avoids creating a visible hierarchy.

Each badge includes a small ℹ️ icon. Tapping it shows a tooltip:

> *"This place financially supports Halal Finder. Sponsorship does not affect halal verification."*

### 4.2 Sponsor Indicator (List Card)

In the places list (bottom sheet), all sponsored places show a gold **"Sponsored"** chip next to the place name. The chip is identical for all tiers.

### 4.3 Promo Code Button (Featured & Spotlight)

An **icon-only button** (tag icon) appears in the popup action bar alongside Directions, Share, and Edit. It uses a subtle gold tint so it's noticeable without being intrusive.

Tapping it:
1. Generates a **unique promo code** tied to the user's IP hash (e.g., `HANAMI10-X7K`)
2. Copies it to the clipboard
3. Shows a **persistent toast** (does not auto-close) with the code, the offer description, and a dismiss ✕ button

The persistent toast ensures users have time to note the code before dismissing it.

- Behaviour: copy to clipboard only — no external redirects, no tracking
- Anti-abuse: codes include a short unique suffix derived from the user's IP hash, making each code unique while keeping it short enough to say at a counter

### 4.3.1 Promos Pill & Panel (Featured & Spotlight)

A **"Promos" pill button** appears in the bottom-right control area next to the existing Prayer Times pill. It's styled with a gold tint to subtly stand out.

Tapping it opens a **promo panel** listing all restaurants with active promo codes. Each entry shows:
- Restaurant icon and name
- Offer description
- A tappable code button that copies the unique code

This gives users a single place to discover all active restaurant promotions without having to tap each place individually.

### 4.4 Enhanced Map Pin (All tiers)

All sponsored pins have a **soft, breathing gold glow** that pulses gently on a 2–2.5 second cycle. This is subtle enough not to distract but eye-catching enough to notice.

- **Basic / Featured:** Pin is ~10% larger, with a semi-transparent gold border and a gentle pulse animation
- **Spotlight:** Pin is ~20% larger, with a stronger gold border and a more prominent pulse

The pin retains its original type colour (green for mosque, orange for restaurant, etc.). The gold glow is an ambient accent, not a replacement — so type identity is always clear.

### 4.5 Search Ranking Boost (Featured & Spotlight)

When a user searches locally, sponsored places receive a small score bonus:

- Featured: +0.15 bonus
- Spotlight: +0.25 bonus

**Transparency rules:**
- Boosted results always show a "Sponsored ·" prefix in the search dropdown
- A maximum of 2 sponsored results can appear in the top 4 — organic results are never fully displaced

### 4.6 Sponsored Restaurants Carousel (Spotlight only)

At the top of the places list, a horizontal-scroll carousel appears titled **"Sponsored Restaurants"**. Each card shows the restaurant icon, name, and a "View on map" button that scrolls to the location.

- Only visible when at least one spotlight-tier restaurant sponsor exists
- Maximum 6 cards
- Restaurants only — other place types are not shown in the carousel

### 4.7 Enhanced Sharing (Spotlight only)

When a user shares a spotlight place via a link, the Open Graph metadata appends "— Sponsored Partner" to the description. This is visible in social media previews (WhatsApp, Telegram, etc.) and maintains transparency even outside the app.

---

## 5. Multi-Place & Chain Support

Businesses with multiple locations are fully supported:

| Scenario | How it works |
|---|---|
| **Single location** | Set `sponsor_tier` on one row in the sheet |
| **Chain — same tier everywhere** | Set `sponsor_tier` + `sponsor_group` on all rows |
| **Chain — flagship + branches** | Set Spotlight on the flagship, Basic/Featured on branches, same `sponsor_group` on all |
| **Separate businesses, same owner** | Each place gets its own independent `sponsor_tier` (no group) |

When a `sponsor_group` is set, the popup shows "Part of [Group Name]" below the place title, giving chain recognition.

Promo codes can be:
- **Shared across the chain** (same code on all rows)
- **Per-location** (different code per row)

---

## 6. Data Management

Sponsorship is managed directly from the existing Google Sheets database — no new tools required.

### 6.1 New Columns (Places sheet)

| Column | Name | Values | Purpose |
|---|---|---|---|
| J | `sponsor_tier` | `basic` / `featured` / `spotlight` / *(empty)* | Drives all sponsor UI |
| K | `sponsor_promo` | Free text, e.g. `HALAL10` | Promo code shown to users |
| L | `sponsor_promo_text` | Free text, e.g. `10% off for Halal Finder users!` | Button label for promo |
| M | `sponsor_group` | Free text, e.g. `Hanami Group` | Groups chain locations |

### 6.2 How It Works

1. An admin fills in the `sponsor_tier` column for the sponsored place(s)
2. Optionally fills in promo code, promo text, and group name
3. The app automatically picks up the change on the next data refresh (within ~1 hour due to CDN caching, or instantly with a cache purge)
4. All sponsor UI (badge, pin, search boost, carousel, etc.) renders automatically based on the tier value
5. To remove sponsorship, simply clear the `sponsor_tier` cell

**No code changes are needed to add or remove sponsors.** It's fully data-driven.

### 6.3 Boycott Override

If column I (`boycott`) is set to "yes" for a place, all sponsor UI is suppressed regardless of the `sponsor_tier` value. This is enforced in code and cannot be bypassed from the sheet.

---

## 7. Ethical & Transparency Safeguards

| Safeguard | Implementation |
|---|---|
| Every sponsor UI element is labelled | Badge text, search prefix, carousel title, and promo panel all use the word "Sponsored" |
| Users can learn what sponsorship means | ℹ️ icon on every badge → tooltip + link to policy |
| Halal status is never influenced | Tags, halal certification, and user-reported data are on independent columns |
| Boycott always wins | Code-level check: `if (place.boycott)` → skip all sponsor rendering |
| Search isn't flooded | Max 2 sponsored results in top 4 search results |
| No tracking or redirects | Promo codes use clipboard copy — no external URLs, no analytics pixels |
| Unique codes prevent abuse | Each promo code includes a short IP-hash suffix, preventing mass sharing |
| Sponsor data is public | Same API, same JSON — no hidden fields. Anyone can inspect the data |
| First-encounter notice | A one-time toast the first time a user sees a sponsored place: *"Some places support Halal Finder through sponsorship. Tap ℹ️ to learn more."* |

---

## 8. User Experience Walkthrough

### A user finds a sponsored restaurant on the map:

1. They see the pin has a **soft breathing gold glow** — subtle but distinct from non-sponsored pins
2. They tap it. The popup shows "Restaurant" badge, then a gold **"Sponsored ✦"** badge with an ℹ️ icon
3. Below the title they see the restaurant name, address, and tags (Fully Halal, Japanese, etc.) — **unchanged from non-sponsored places**
4. In the action bar, alongside Directions and Share, there's a **tag icon button** with a gold tint
5. They tap it → a unique code `HANAMI10-X7K` is generated and copied → a **persistent toast** appears: **"Code HANAMI10-X7K copied! Show this at Hanami Sushi for 10% off"** with a ✕ dismiss button
6. They visit the restaurant and mention the code

### A user searches for "sushi":

1. Results show 4 matches. The 1st result is a Featured sponsor — it shows **"Sponsored · Hanami Sushi"** with a small gold indicator
2. The remaining 3 results are organic, ranked by relevance and distance as usual
3. The user can see at a glance which result is sponsored and which isn't

### A user taps the Promos pill:

1. They tap the **"Promos"** pill button (next to Prayer Times) at the bottom-right of the map
2. A panel opens listing all restaurants with active promotions — each with name, offer description, and a tappable code
3. They tap a code → it's copied → persistent toast confirms

### A user opens the places list:

1. At the top, a horizontal carousel titled **"Sponsored Restaurants"** shows 2 Spotlight partners
2. Below it, the normal city-grouped list shows all places. Sponsored ones have a small gold **"Sponsored"** chip next to their name
3. Everything else — sorting, filtering, favourites — works identically

---

## 9. Implementation Summary

### What changes in the app

| Component | Change |
|---|---|
| Google Sheet | 4 new columns (J–M) |
| Apps Script (`Code.gs`) | Include new columns in API output |
| CSS Design Tokens | New `--sponsor` gold colour, badge template, glow effect |
| CSS Styles | Sponsor badge, promo button, carousel, chip positioning |
| Map Markers | Breathing gold glow animation + size scale for sponsored pins |
| Place Popup | "Sponsored ✦" badge, ℹ️ tooltip, icon-only promo button, persistent toast, group label |
| Place List | "Sponsored" chip on cards, spotlight restaurant carousel at top, Promos pill + panel |
| Search | Score bonus + "Sponsored ·" label + max-2 cap |
| Middleware | OG meta enhancement for spotlight shares |
| Transparency | Info modal explaining sponsorship policy |

### What doesn't change

- Halal verification and tag system
- Boycott functionality
- Place submission and editing flow
- Map controls, directions, prayer times
- Privacy, security headers, and CSP policy

---

## 10. Pricing Considerations

*(To be decided by the team — placeholder structure below)*

| Tier | Suggested Range (monthly) | Notes |
|---|---|---|
| Basic | €XX – €XX | Low barrier for small businesses |
| Featured | €XX – €XX | Includes promo code + search boost |
| Spotlight | €XX – €XX | Full presence, best for chains |
| Chain discount | –XX% per additional location | Encourages multi-location sponsorship |

Pricing should reflect the platform's community-first nature. Consider:
- **Introductory pricing** for early sponsors
- **Non-profit / community discount** for mosque-adjacent businesses
- **Quarterly or annual plans** with a discount vs. monthly
- **Revenue transparency** — consider sharing how sponsor revenue supports the platform (server costs, development, etc.)

---

## 11. Future Enhancements (Not in v1)

These are intentionally deferred to keep v1 simple, but worth planning for:

| Enhancement | Description |
|---|---|
| **Sponsor expiry date** | A `sponsor_until` column so sponsorship auto-deactivates. Manual removal works for v1. |
| **Sponsor logo / image** | Custom thumbnail in spotlight popups. Deferred due to image hosting and CSP complexity. |
| **Analytics dashboard** | Show sponsors how many popup views, promo code copies, and search impressions they received. |
| **Sponsor self-service portal** | A web form where sponsors can update their promo code and text without admin involvement. |
| **Seasonal promotions** | Time-limited offers (e.g., Ramadan specials) with start/end dates. |
| **User feedback on sponsors** | Allow users to rate their experience using a promo code — builds trust loop. |

---

## 12. Next Steps

1. **Team review** — circulate this document for feedback
2. **Pricing decision** — finalise tier pricing
3. **First sponsor outreach** — identify 1–2 pilot sponsors for soft launch
4. **Implementation** — Phase 1 (data layer) → Phase 2–8 (UI, search, transparency)
5. **Testing** — verify all tiers on desktop + mobile, light + dark mode
6. **Launch communication** — brief in-app announcement about the new sponsorship program

---

*This document is a living draft. Last updated: March 2026.*
