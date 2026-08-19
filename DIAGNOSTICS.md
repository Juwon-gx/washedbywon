# WashedByWon — Chatbot & Site Diagnostics

Date: 2026-08-19

## ⚠️ Read this first: this repo is build output, not source

This repository contains only the **compiled Vite bundle** (`assets/index-*.js`, `assets/index-*.css`)
plus the hand-written `admin.html`. There is no `src/`, no `package.json`, no React source anywhere in
the git history.

The fixes in this commit were applied **directly to the minified bundle**. They are live and verified,
but **the next `npm run build` from your source project will overwrite every one of them.**

Port the changes into your source project. `src/ChatWidget.jsx` in this repo is the corrected chat
component written out as readable React — drop it into your source tree (or diff it against your
existing widget) so the fixes survive the next build. The non-chat fixes are listed below with enough
detail to reapply.

---

## How the chatbot works

`index.html` → React bundle → chat widget posts to
`POST https://washedbywon-backend.onrender.com/api/chat` with `{ message, history }` and reads
`reply` from the response. The backend lives in a separate repo on Render and was **not reachable
from this environment** (blocked by network egress policy), so everything below is frontend analysis
verified in a real Chromium browser against a mocked backend. **The backend itself has not been
inspected** — see "Still to check" at the end.

---

## Root cause: Render free tier sleeps, the chat never accounted for it

Your backend spins down after ~15 minutes of inactivity. The first request after that takes 30–60
seconds. Your admin dashboard already got a fix for this (commit `5aa2f07`, "Fix admin dashboard
hanging on Render cold start"). **The chat widget never did.** That is almost certainly the "issues"
you've been hitting: the first customer of the day types a question and gets animated dots forever,
or a generic failure, and leaves.

---

## Findings

Every item below was reproduced in Chromium against the **original** bundle and re-tested against the
fixed one. "Before → After" values are measured, not estimated.

### Chat widget

| # | Issue | Impact | Before → After |
|---|---|---|---|
| 1 | **No timeout on the chat request.** No `AbortController`, no deadline. | A cold start or a hung backend left the typing dots spinning indefinitely with zero feedback. | after 12s hung: *no feedback at all* → cold-start notice at 6s, hard 45s timeout with a recovery message |
| 2 | **HTTP status was never checked.** `await (await fetch(...)).json()` — `fetch` doesn't reject on 4xx/5xx, so an error page hit `.json()`, threw, and landed in a bare `catch`. | Every failure mode — 500, 429, cold start, offline — showed one useless string. A 200 response with no `reply` field showed "Sorry, I didn't get that. Try again!" forever. | HTTP 500 → `"Connection error. Please try again or text us directly."` → distinct messages per cause (429 / 5xx / timeout / network) |
| 3 | **The user's typed message was destroyed on failure.** Input cleared before the request; nothing restored it. | Customer types a long question, cold start fails, their text is gone. Most people don't retype. | input after failure: `""` → text restored, ready to resend |
| 4 | **Replies lost all formatting.** No `white-space: pre-wrap`. | Every list, price breakdown, and line break from the AI collapsed into one run-on paragraph. | `white-space: normal` → `pre-wrap`, plus `overflow-wrap: anywhere` so long URLs stop blowing out the bubble |
| 5 | **Chat panel taller than a small phone screen.** Fixed `height: 480px` at `bottom: 5.5rem`. | On a 360×500 viewport the panel's top — **including the × close button** — sat off-screen. Users could not close the chat. | panel top `-68px`, close button **off-screen** → top `32px`, close button reachable; panel now shrinks to fit |
| 6 | **On-screen keyboard covered the input.** Nothing tracked `visualViewport`. | Typing on a phone pushed the input under the keyboard. | panel now offsets by the live keyboard height (`--wbw-kb`) and caps to the visible viewport (`--wbw-vh`) |
| 7 | **Chat input font size ~12.5px.** | iOS Safari auto-zooms the page on any input under 16px, wrecking the layout mid-conversation. **The booking form had the same bug on all 5 fields.** | inputs `<16px` → 16px on mobile via one CSS rule |
| 8 | **Send button never disabled during a request.** | No feedback that anything was happening; button stayed fully lit. | not disabled → disabled + dimmed while sending, and when the box is empty |
| 9 | **Phantom unread badge.** The 4-second nudge timer was keyed on the open/close state, so it restarted every time the chat closed. | A customer who read the chat and closed it got a fake "1 unread" badge again 4 seconds later, forever. | badge returns after reading: **yes** → no |
| 10 | **Unbounded conversation history.** The entire transcript was posted on every message. | Payload, latency, and token cost grew every turn; long chats eventually break. | full transcript → last 12 messages (error/system bubbles excluded) |
| 11 | **No input length cap.** | Anyone could paste 100KB into the box and send it straight to your LLM bill. | unlimited → 500 characters |
| 12 | **Enter key fired mid-IME-composition.** | Anyone typing with a CJK/emoji keyboard sent half-composed words. | now guarded with `isComposing`; Shift+Enter no longer sends |
| 13 | **Not usable with a screen reader or keyboard.** No `role="dialog"`, no live region, `→`/`×` buttons with no labels, no Escape-to-close. | Inaccessible, and a plain usability gap. | added `role="dialog"`, `role="log"` + `aria-live="polite"`, `aria-label`s, Escape-to-close, larger close tap target |
| 14 | **Scroll chaining.** Scrolling to the bottom of the transcript started scrolling the page behind it. | Jarring, especially with Lenis smooth-scroll running. | `overscroll-behavior: contain`; transcript now scrolls its own container instead of relying on `scrollIntoView` ancestor-walking |

### Booking flow — the most expensive bug on the site

| # | Issue | Impact | Before → After |
|---|---|---|---|
| 15 | **A dead backend looked like a fully-booked calendar.** Both availability fetches did `.catch(() => setDates([]))` — no status check, no error state, no retry. | **This is a silent revenue leak.** During a cold start, or any backend outage, every visitor saw a calendar with zero selectable dates and *no error message*. It looks like you're booked solid. And because the fetch only re-runs when the month changes, it never recovered on its own. | selectable days: `0`, error shown to user: **none** → clear error explaining the server is waking up, plus how to reach you |
| 16 | **Booking submit had no timeout.** | "Sending…" hung forever on a cold start. | added 60s timeout with a message that says their details are preserved |
| 17 | **All booking failures showed one message.** `throw Error("Booking failed")` discarded the status. | A double-booked slot (409) was indistinguishable from a server crash — the customer just retries into the same failure. | distinct handling for 409 / 429 / 5xx / timeout |
| 18 | **No phone validation.** `type="tel"` validates nothing. | A typo'd phone number means the SMS confirmation silently never arrives and you have no way to reach the customer. | now requires 10 digits before submitting |
| 19 | **Confirmation said "Check your texts!" even without SMS consent**, and showed the raw date. | Told customers to expect a text you shouldn't send them. | now `"Saturday, August 22"` and switches to "Watch your email" when consent is unchecked |
| 20 | **`localStorage` read unguarded.** | In Safari Private Mode / blocked-cookie browsers this throws inside a `useEffect` and takes the **whole page** blank. | wrapped in try/catch |

### Site-wide

| # | Issue | Impact | Before → After |
|---|---|---|---|
| 21 | **Footer "Privacy Policy" and "Terms" were dead `href="#"` links.** `privacy.html` and `terms.html` exist and were added *specifically for Twilio A2P verification* (commit `07d2ee8`). | Broken for every visitor, and carrier/Twilio review checks that consent language links to a reachable policy — this can fail your SMS registration. | `["#", "#"]` → `["./privacy.html", "./terms.html"]` |
| 22 | **Decorative glow elements overhang the viewport by 72px** (pre-existing, unchanged by this work). `body { overflow-x: hidden }` alone doesn't reliably stop horizontal panning on iOS Safari. | Page could pan sideways on iPhone. | added `html { overflow-x: clip }` |

### Admin dashboard

| # | Issue | Impact | Before → After |
|---|---|---|---|
| 23 | **Only 2 of 9 admin API calls had the cold-start timeout.** Schedule, availability toggle, subscribers, message log, and SMS broadcast all used bare `fetch`. | The exact hang you already fixed for login, still present on every other tab. | 7 bare calls now use `fetchWithTimeout`; SMS fan-out calls get 90s |
| 24 | **A stale session key showed an empty dashboard instead of the login screen.** Auto-login never re-validated, and `loadBookings` never checked `res.ok`. | After a password change you'd see a dashboard with zero bookings and assume you'd lost data. | 401/403 now clears the key, toasts "Session expired", returns to login |

---

## What I could not verify

- **The backend was unreachable from this environment** (blocked by network egress policy), so the
  `/api/chat` handler itself — model choice, system prompt, rate limits, error shapes, CORS — was not
  inspected. If the assistant is giving *wrong answers* (bad prices, wrong service area, hallucinated
  availability) as opposed to *failing to answer*, that lives in the backend and is the next thing to look at.
- The `/api/chat` request and response contract is **byte-for-byte unchanged** by this work — verified by
  capturing request bodies before and after. No backend changes are required for any of this.

## Recommended next steps

1. **Port these fixes into your source repo** before the next build (see the warning at the top).
2. **Keep the backend warm.** A cron ping every 10 minutes to any cheap endpoint removes the cold-start
   problem at the source and makes the whole site feel instant. This is the single highest-value change left.
3. **Review the backend `/api/chat` handler** — rate limiting, a per-message token cap, and a check that
   it returns a proper status code on failure (the frontend now reads them).
4. Add Open Graph tags to `index.html` — the site is shared over Instagram DMs and texts, and currently
   previews as a bare URL.
5. Add real photos to the gallery — all six tiles still say "Photo Coming Soon".

## How this was verified

Fixes were applied to the bundle with exact-match, single-occurrence assertions (any ambiguous match
aborts the patch), syntax-checked with `node --check`, then exercised in headless Chromium against a
mocked backend across four scenarios (healthy, HTTP 500, hung/cold-start, offline) and three viewports.
The original bundle was served side-by-side from `git archive HEAD` so every "before" number above is
measured from the real pre-fix code, not assumed.
