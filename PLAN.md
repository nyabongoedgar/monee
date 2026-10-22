# monee — Offline-First Budget PWA: Implementation Plan

A personal budget, expense, income and savings-goal tracker, delivered as a **Progressive Web App** that installs on iPhone and Android from the browser. **No backend, no database server, no third-party APIs, no bank connections.** All data lives on the user's own device.

---

## 0. Decisions locked (testing phase)

This build is for **testing only, not production**. That relaxes some choices below, and each relaxed one is marked **[TEST]**.

| Topic | Decision |
|---|---|
| Hosting | **Vercel free tier**, static Vite build, no serverless functions. Test on the stable production alias (`<project>.vercel.app`), not per-deploy preview URLs. Every URL is a separate origin with its own separate data. |
| PIN | **4 digits**. |
| Master PIN **[TEST]** | `0000` always unlocks the app and can reset the PIN. It exists only when `VITE_TEST_MASTER_PIN=true` at build time. It must be off for any real release (see §5.2). |
| PIN reset | New **Profile → Security → Reset PIN** section: change the PIN (current PIN or master PIN) and a "Forgot PIN?" path on the lock screen. |
| Biometrics | **Optional**, off by default. Onboarding has a "Skip for now" button, and it can be enabled or disabled later under Profile → Security. |
| Email | Stored locally as a label. No verification. |
| Notifications | **None for now.** No push, no bell badge logic. The bell icon becomes an in-app "Upcoming bills & alerts" list (or is hidden). |
| Backups | Manual export through the phone's share sheet and Files app (see §5.6). Writing to a hidden folder like WhatsApp isn't possible from a web app. |
| Recovery code | **Dropped for the test build.** The master PIN replaces it. |
| Currency | One currency, chosen at onboarding. **Default UGX** (0 decimal places), changeable to others (USD, KES, TZS, RWF, NGN, ZAR, EUR, GBP…). Decimals follow the currency via `Intl.NumberFormat`. |
| Branding | Keep **monee** and the coral/ink palette. |
| Dark mode | **Later**, not in v1. Use CSS variables from the start so adding it is cheap. |

---

## 1. What the prototype contains today

The Figma Make prototype (`src/App.tsx`, `src/index.css`) is a single-file, static mock with hardcoded data:

| Screen | What's in the design | Real-app interpretation |
|---|---|---|
| **Home** | Greeting + avatar, total balance card, quick actions (Send / Add / Pay bills), monthly budget ring, insight card, 7-day spending bars, recent transactions | Dashboard computed from stored data |
| **Stats** | Week/Month/Year tabs, total spent + vs-last-period, 12-bar chart, daily average, biggest expense, spend by category | Reports computed from transactions |
| **Wallet** | Dark "bank card", Transfer / Add money / Manage, accounts list, upcoming bills | **Accounts** (manual balances), transfers between accounts, recurring bills |
| **Profile** | Avatar, name/email, monthly savings goal ring, settings lists, sign out | Profile, goals, security, data export, settings |
| **Add transaction sheet** | Amount + description only | Full form: type, amount, category, account, date, note |

### Prototype items that must change for this product
- **Bank-connection concepts go away:** "Linked accounts", the VISA card face, "Send/Transfer money to people", and "Sign out" (there is no account/server — replaced by *Lock app*).
- **Text is mockup-scaled (6–10 px).** Real phone text must be ≥ 12 px (body 14–16 px). All sizes in `index.css` need to be rescaled.
- **Remove the phone frame** (`.viewport`, `.phone-app`, fake status bar "9:41"). The real device provides those. Use `viewport-fit=cover` and `env(safe-area-inset-*)` instead.
- **Google Fonts `@import`** must be self-hosted (DM Serif Display, Plus Jakarta Sans) or the app breaks offline.
- All `<button>` elements with no handlers (See all, View details, Details, etc.) need real destinations.
- The mock uses `$`; currency must be a user setting.

---

## 2. Product scope

### In scope (v1)
1. **Onboarding:** first name, last name, email, currency, set PIN, optionally enable Face ID / fingerprint.
2. **App lock:** PIN and/or biometrics at launch and after the app has been in the background.
3. **Transactions:** add / edit / delete income, expense and transfer entries; search and filter.
4. **Accounts:** manual accounts (Cash, Bank, Mobile money, Savings…) with running balances.
5. **Categories:** defaults plus user-created (name, icon, colour).
6. **Budgets:** overall monthly budget plus optional per-category limits; ring and "left to spend".
7. **Savings goals:** target, deadline (optional), contributions, progress ring.
8. **Recurring items:** bills and recurring income (rent, salary, subscriptions); "Upcoming bills" with a *Mark as paid* action that creates the transaction.
9. **Reports/Stats:** week / month / year; trend bars, category breakdown, daily average, biggest expense, income vs expense.
10. **Insights:** simple rule-based messages computed locally ("You spent 12% less on dining this week"). No AI/API.
11. **Backup & restore:** export/import a file (optionally passphrase-encrypted), plus CSV export.
12. **PWA:** installable, fully offline, auto-update with a prompt.

### Out of scope (v1)
Bank/wallet syncing, cloud sync, multi-device sync, accounts/logins, server push notifications, receipts OCR, multi-user. (Cloud sync could be a later phase; the data layer is designed to allow it.)

---

## 3. Key technical constraints (read these — they shape the design)

These are honest limits of "everything on the phone, no backend":

1. **Hosting is Vercel (free tier).** The app is static files the phone downloads once and then runs offline. Vercel serves them over HTTPS, which service workers and biometrics require. Add a `vercel.json` with an SPA rewrite to `index.html`, and send `Cache-Control: no-cache` for `sw.js` and `manifest.webmanifest` so updates reach phones.
2. **Data is tied to the exact URL.** IndexedDB and passkeys belong to one origin. During testing, always install from the same stable `*.vercel.app` alias. Preview deployment URLs and a later custom domain would each start with empty data. Backup/restore is the way to move data between them.
3. **Browser storage can be evicted.** On iOS, Safari deletes site data for sites not used in ~7 days **unless the app is installed to the Home Screen** (installed PWAs are exempt). Therefore: push users to install, call `navigator.storage.persist()`, and make backups prominent (reminder every N days / "last backup" indicator).
4. **Biometrics on the web = WebAuthn.** We cannot read or "capture" a fingerprint or face. The OS shows Face ID / Touch ID / fingerprint, and returns only success or failure. That's the correct and safest design — biometric data never touches our code.
5. **Biometric-only is a lock screen, not encryption.** To make data genuinely protected at rest, the PIN derives an encryption key (see §5). Biometrics are then a convenience that unlocks that key where the platform supports the WebAuthn **PRF extension**; where it doesn't, biometrics gate the UI and the PIN remains the root secret.
6. **No notifications in this phase.** Upcoming bills are visible in-app when it's opened. Nothing is pushed.
7. **Email is a local label**, with no verification and no account behind it.
8. **PIN recovery in the test build is the master PIN `0000`.** This is a deliberate backdoor (§5.2), acceptable only because this is a test. A real release needs a recovery code instead.
9. **Web apps can't write to hidden app folders like WhatsApp.** WhatsApp is a native app with its own protected storage. A PWA can only use (a) browser storage, which is private but can be evicted, and (b) files the user explicitly saves through the share sheet or a file picker. See §5.6 for what that means in practice.

---

## 4. Tech stack

Keep what's already in the repo (React 19, Vite, Tailwind v4, TypeScript) and add only what's needed.

| Concern | Choice | Why |
|---|---|---|
| Framework | React 19 + Vite + TS (existing) | Already scaffolded |
| Styling | Tailwind v4 + design tokens in `index.css` (existing palette) | Keep Figma look |
| PWA | `vite-plugin-pwa` (Workbox, `generateSW`, `registerType: 'prompt'`) | Manifest + precache + update flow |
| Storage | **IndexedDB** via **Dexie** | Structured, queryable, large capacity; localStorage is too small/sync |
| State | Dexie `useLiveQuery` for data + **Zustand** for UI/session state (locked, sheet open) | Reactive UI with little code |
| Routing | `react-router` (hash or browser) — tab routes + sheets | Back-button behaviour on Android; deep links from shortcuts |
| Crypto | Native **Web Crypto** (PBKDF2/Argon-like params, AES-GCM) — no library | No dependency, audited primitives |
| Biometrics | Native **WebAuthn** (`navigator.credentials`) — no library | Platform authenticator only |
| Validation | Zod | Forms + validating imported backup files |
| Dates | `date-fns` | Period maths |
| Charts | Keep the hand-built CSS bars from the design; add small SVG for line/donut if needed | No chart lib needed, tiny bundle |
| Fonts | `@fontsource/dm-serif-display`, `@fontsource-variable/plus-jakarta-sans` | Self-hosted for offline |
| Tests | Vitest + React Testing Library (logic/UI), Playwright (flows, offline, installability) | |
| Quality | oxfmt (existing), `tsc --noEmit`, Lighthouse PWA audit | |

---

## 5. Security design

### 5.1 Layers
```
 Onboarding ──► PIN set ──► key derived ──► data encrypted at rest (field-level)
                  │
                  └─► optional: register platform passkey (Face ID / Touch ID / fingerprint)
                           └─ PRF available?  yes → passkey can unwrap the data key
                                              no  → passkey only unlocks the UI; PIN stays root
```

### 5.2 PIN
- **4 digits.** With only 10,000 combinations, the attempt back-off below matters even more.
- **[TEST] Master PIN `0000`:** at setup, the data key (DEK) is also wrapped by a key derived from `0000`. It only happens when `VITE_TEST_MASTER_PIN=true`.
  - **What this means:** anyone who knows `0000` can open the app, and encryption no longer protects against them. That's fine for testing with test data. **Never ship it in a real release.** Before production, remove the flag, drop the extra wrapped key, and switch to a recovery code.
  - **Guard:** the build fails if the flag is on when `VERCEL_ENV=production` is paired with a `PRODUCTION_RELEASE=true` variable. Add a small check script for this.
- **Reset PIN (Profile → Security):**
  1. *Change PIN:* enter the current PIN, then the new PIN twice. The DEK is re-wrapped, so no data is re-encrypted.
  2. *Forgot PIN?* (also on the lock screen): enter the master PIN `0000`, then set a new PIN.
  3. *Reset app:* a last resort that wipes everything, with a typed confirmation.
- Never stored. Store: random `salt`, KDF params, and a **key-check blob** (AES-GCM encryption of a known string) to verify the PIN by successfully decrypting.
- KDF: PBKDF2-SHA-256 with a high iteration count (≥ 600k, tuned on-device) → derives a key-encryption key (KEK). A random 256-bit **data key (DEK)** is generated once and stored only **wrapped** by the KEK (and, if available, also wrapped by the passkey PRF secret).
- Changing the PIN re-wraps the DEK; no bulk re-encryption needed.
- Attempt limiting: exponential back-off after 5 failures (30 s → 1 m → 5 m…), persisted so a reload doesn't reset it. Optional "wipe after 10 failures" toggle (off by default).

### 5.3 What gets encrypted
Sensitive fields (amounts, notes, descriptions, account names, profile email/name) are AES-GCM-encrypted with the DEK before being written to IndexedDB. Index-only fields needed for queries (date, type, category id) stay plain, **or** — simpler and the recommended v1 approach — records are stored plain in IndexedDB while the app is unlocked and the *entire database is wrapped in an encrypted snapshot on lock*. **Decision needed in Phase 2** (see §13): field-level encryption is stronger but complicates queries; the v1 default is field-level for `amount`, `note`, `payee`, and names.

### 5.4 Biometrics (WebAuthn)
- Register: `navigator.credentials.create({ publicKey: { authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, extensions: { prf: {…} } } })`.
- Unlock: `navigator.credentials.get({ userVerification: 'required' })`; verify the assertion locally against the stored public key and unwrap the DEK via PRF when supported.
- Feature-detect with `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`; hide the toggle if unavailable.
- Always keep PIN as fallback (biometrics can be re-enrolled/changed by the OS).

### 5.5 Session behaviour
- Lock on cold start and when the page is hidden > N seconds (`visibilitychange`; default 30 s, user-configurable: immediately / 30 s / 1 min / 5 min).
- Blur/hide balances when the app switches to the background so the app-switcher thumbnail doesn't reveal amounts.
- Optional "hide balances" eye toggle on Home.
- No analytics, no third-party scripts, no external fonts/CDNs, strict CSP (`default-src 'self'`).

### 5.6 Backups (and why "folders like WhatsApp" isn't possible)
What a PWA can and can't do on each platform:

| Option | iPhone | Android | Verdict |
|---|---|---|---|
| Browser storage (IndexedDB) | Yes. An **installed** app is exempt from the 7-day cleanup. | Yes. Persistent once installed and `persist()` is granted. | **Primary store** |
| Origin Private File System (OPFS) | Yes | Yes | Same sandbox and same eviction rules as IndexedDB, so it's no safer. Skipped. |
| Save a file to a chosen folder (File System Access API) | **No** | Only in some Chrome versions, and only a save dialog each time | Use `showSaveFilePicker` if present, else fall back to share/download |
| Share sheet → "Save to Files" / Drive / WhatsApp / email | **Yes** | **Yes** | **Main backup route**, works everywhere |
| Silent writes to a hidden folder | No | No | Needs a native app |

- **What we'll build:** *Export backup* opens the phone's share sheet (`navigator.share` with a file). The user picks **Save to Files** (iCloud Drive), Google Drive, WhatsApp "Saved messages" and so on. Restoring is *Import backup* via a file picker. It's one tap each, but manual.
- **Nudges:** "Last backup" date on Profile and a reminder banner in-app if it's been more than 7 days since the last backup, or more than N new transactions. Banner only, no notifications.
- **If you want truly automatic, protected-folder storage like WhatsApp:** that requires wrapping this same React app in a native shell with **Capacitor**. It's a separate later phase, and it needs an Apple Developer account ($99/yr) to run on iPhones beyond a 7-day dev signing. The code and data model here would carry over unchanged.
- Export `.monee` JSON file (versioned schema). Option to encrypt with a user passphrase (AES-GCM, PBKDF2).
- Import validates with Zod, shows a preview (counts, date range), and asks *Replace* vs *Merge*.
- Share via the native share sheet (`navigator.share({ files })`) where available; otherwise download.
- CSV export of transactions for spreadsheets.

---

## 6. Data model (IndexedDB / Dexie)

Money is stored as **integer minor units** (cents) to avoid floating-point errors. Dates as ISO strings (`YYYY-MM-DD` for day-level, ISO timestamp for `createdAt`). IDs are `crypto.randomUUID()`.

```ts
Profile        { id:'me', firstName, lastName, email, currency, createdAt, avatarColor }
SecurityMeta   { id:'sec', salt, kdf:{name,iterations}, wrappedDek, keyCheck,
                 passkey?: { credentialId, publicKey, prfSalt, wrappedDekByPrf },
                 lockAfterSec, failedAttempts, lockedUntil, recoveryHash? }
Account        { id, name, type:'cash'|'bank'|'mobile'|'savings'|'other',
                 openingBalance, color, icon, archived, sortOrder }
Category       { id, name, kind:'expense'|'income', icon, color, isDefault, archived }
Transaction    { id, type:'expense'|'income'|'transfer', amount, accountId,
                 toAccountId?, categoryId?, date, note?, recurringId?, goalId?,
                 createdAt, updatedAt }
Budget         { id, month:'YYYY-MM', categoryId|null /*null = overall*/, limit }
Goal           { id, name, target, deadline?, icon, color, accountId?, archived }
   (contributions are Transactions with goalId → progress is derived, never stale)
Recurring      { id, name, type, amount, accountId, categoryId, frequency:
                 'weekly'|'monthly'|'yearly', dayRule, startDate, endDate?,
                 nextDue, autoPost:false }
Settings       { id:'app', theme, weekStart, hideBalances, lastBackupAt,
                 installPromptDismissedAt, schemaVersion }
```

Indexes: `Transaction[date]`, `[accountId+date]`, `[categoryId+date]`, `[type+date]`.
Derived (never stored): account balances, budget used, goal progress, period totals, insights.
Dexie schema versions + migrations from day one (`db.version(n).upgrade(...)`) and `schemaVersion` in backups.

---

## 7. Screen map (mapping prototype → app)

```
Lock screen (PIN pad + biometric button)
Onboarding: Welcome → Your details → Currency → Create PIN → (Optional biometrics, skippable) → Starter accounts/categories
Tabs
 ├─ Home        balance, quick actions (Expense / Income / Transfer / Pay bill), budget ring, insight,
 │              7-day bars, upcoming bills strip, recent transactions → "See all"
 ├─ Activity*   full transaction list, search, filters (date, type, category, account), edit/delete (swipe)
 ├─ Stats       Week/Month/Year, hero total + delta, bar trend, daily avg, biggest expense,
 │              income vs expense, category breakdown → category detail
 ├─ Wallet      accounts list + total, add/edit account, transfers, upcoming bills / recurring, Goals
 └─ Profile     edit profile, savings goal ring, Security (PIN, biometrics, auto-lock),
                Budgets, Categories, Currency & theme, Backup & restore, Install help, About/Privacy
Sheets: Add/Edit transaction · Add/Edit account · Add/Edit goal (+ contribute) · Add/Edit recurring · Set budget
```
\* The prototype has 4 tabs; "See all" links need a destination, so Activity is reached from Home/Wallet rather than adding a fifth tab (keeps the designed nav).

---

## 8. Project structure

```
src/
  main.tsx
  App.tsx                  # shell: lock gate → onboarding → tabs
  index.css                # tokens + base (scaled for real devices)
  app/
    router.tsx
    providers.tsx
  db/
    schema.ts              # Dexie tables + versions/migrations
    repositories/          # transactions.ts, accounts.ts, budgets.ts, goals.ts, recurring.ts …
    seed.ts                # default categories/accounts
    backup.ts              # export/import/CSV
  security/
    crypto.ts              # KDF, wrap/unwrap, AES-GCM helpers
    pin.ts                 # set/verify/change, attempt limiting
    webauthn.ts            # register/authenticate, PRF, feature detection
    lockStore.ts           # Zustand: locked state, auto-lock timers
  features/
    onboarding/  lock/  home/  activity/  stats/  wallet/  goals/  recurring/  profile/
  components/              # Icon, Card, Sheet, Ring, BarChart, AmountInput, PinPad, EmptyState…
  lib/
    money.ts               # format, parse, minor units
    dates.ts  periods.ts   # week/month/year ranges
    insights.ts            # rule-based insight generation
    pwa.ts                 # install prompt, update prompt, persist()
public/
  icons/ (192, 512, maskable-512, apple-touch-icon-180), splash images (optional)
  offline.html (fallback)
```

---

## 9. PWA implementation details

### 9.1 Manifest (`vite-plugin-pwa`)
`name: "monee"`, `short_name: "monee"`, `display: "standalone"`, `orientation: "portrait"`, `start_url: "/"`, `scope: "/"`, `theme_color` and `background_color` from the palette (`#f8f6f1`), icons 192/512 + **maskable** 512, `shortcuts`: *Add expense*, *Add income* (long-press app icon on Android → opens the add sheet via `/?add=expense`).

### 9.2 iOS-specific (Safari ignores parts of the manifest)
In `index.html`:
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-title" content="monee">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="theme-color">` (light/dark variants)
- Optional `apple-touch-startup-image` splash screens.

CSS: `env(safe-area-inset-*)` on header/bottom nav, `100dvh`, `overscroll-behavior: none`, `-webkit-tap-highlight-color: transparent`, inputs ≥ 16 px (prevents iOS zoom-on-focus), `user-select: none` on UI chrome.

### 9.3 Install experience
- **Android/Chrome:** capture `beforeinstallprompt`, show a custom "Install monee" card on Home/Profile.
- **iOS Safari:** no install event exists. Detect iOS + not standalone → show a short guided card: *Share ⎋ → Add to Home Screen*. Explain that installing also protects the user's data from Safari's 7-day cleanup.
- Hide prompts when already `display-mode: standalone`; remember dismissal in Settings.

### 9.4 Service worker & updates
- Precache the app shell and all built assets (fonts/icons included). Navigation fallback to `index.html`. **No runtime network caching needed** — the app makes no network calls.
- `registerType: 'prompt'`: show "New version available — Update" toast (never silently reload mid-entry).
- Schema migrations run on first launch of a new version; export a safety snapshot before destructive migrations.

### 9.5 Storage hygiene
Call `navigator.storage.persist()` after onboarding; show estimated usage (`navigator.storage.estimate()`) in Profile → Backup; surface a warning if persistence is denied.

---

## 10. Implementation phases

Each phase ends in something runnable and testable on a real phone.

**Build status (this pass):** Phases 0–7 are implemented and checked in the dev server, with 37 passing unit tests and a passing production build. Still open: the Vercel deploy, real-device checks, Playwright, Lighthouse, a full accessibility audit, and the dark theme (deferred by §0).

### Phase 0 — Foundations (½ day)
- [ ] Install deps: `vite-plugin-pwa`, `dexie`, `dexie-react-hooks`, `zustand`, `react-router`, `zod`, `date-fns`, fontsource packages; `vitest`, `@testing-library/react`, `playwright`. *(`playwright` not installed yet, see Phase 8)*
- [x] Split `App.tsx` into the §8 folder structure; extract the prototype's CSS into tokens + components; keep the visual design.
- [x] Rescale type to real-device sizes; remove phone frame and fake status bar; add safe-area handling.
- [x] Self-host fonts; drop the Google Fonts `@import`.
- **Done when:** the prototype looks the same (but readable) in a mobile viewport, and `pnpm build` passes.

### Phase 1 — PWA shell (½–1 day)
- [x] Manifest, icons (192/512/maskable/apple-touch), iOS meta tags.
- [x] Service worker precache + offline fallback; update toast.
- [x] Install prompt (Android) + iOS "Add to Home Screen" guide card.
- [ ] Deploy to **Vercel** (`vercel.json` SPA rewrite and no-cache headers for `sw.js`/manifest) so real devices can test on a stable `*.vercel.app` URL. *(`vercel.json` written with rewrites, no-cache and CSP headers. Deploy not run.)*
- **Done when:** Lighthouse PWA/installable checks pass; app installs on a real iPhone and Android; opens in airplane mode.

### Phase 2 — Data layer (1–2 days)
- [x] Dexie schema v1, repositories, seed default categories (Housing, Food & drinks, Shopping, Transport, Bills, Health, Entertainment, Salary, Other…) and a starter "Cash" account.
- [x] `lib/money.ts` (minor units, currency formatting via `Intl.NumberFormat`), `lib/periods.ts`.
- [x] Selectors for balances, period totals, category breakdown (pure functions, unit-tested).
- [x] `storage.persist()` request.
- **Done when:** unit tests cover money/period/aggregate maths; data survives reload and app restart.

### Phase 3 — Onboarding & security (2–3 days)
- [x] Onboarding flow (name, email, currency) with validation. No email verification.
- [x] 4-digit PIN set/confirm with PinPad component; crypto helpers (§5.2); key-check verify; attempt limiting. *(Key check is the AES-GCM unwrap of the data key, so a wrong PIN fails authentication.)*
- [x] **[TEST]** Master PIN `0000` behind `VITE_TEST_MASTER_PIN`, plus the production-build guard script.
- [x] **Optional** biometric step ("Enable Face ID / fingerprint" or "Skip for now") with feature detection and graceful "not available" copy. Off by default. *(Built and feature-detected. The WebAuthn PRF path is not yet tested on a real device.)*
- [x] Lock screen with "Forgot PIN?" → master PIN → set new PIN; auto-lock on background; privacy blur.
- [x] Profile → Security: **Change PIN**, **Reset PIN**, biometrics on/off, auto-lock timeout, reset app.
- **Done when:** on a real iPhone (Face ID) and Android (fingerprint) the installed app prompts for biometrics on launch; wrong PIN back-off works; changing PIN keeps data readable.

### Phase 4 — Transactions & accounts (2–3 days)
- [x] Add/Edit transaction sheet (type toggle, amount keypad-friendly input, category picker, account, date, note); delete with undo.
- [x] Home: real balance, recent transactions, 7-day bars; Activity list with search/filters.
- [x] Wallet: accounts CRUD, balances, transfers between accounts.
- [x] Empty states for a brand-new user.
- **Done when:** a user can record a month of income/expenses and balances are always correct (including transfers and edits/deletes).

### Phase 5 — Budgets & Stats (2 days)
- [x] Monthly overall budget + per-category limits; ring, "left", "days remaining", over-budget state.
- [x] Stats screen: Week/Month/Year, trend bars, daily average, biggest expense, category breakdown, income vs expense, category drill-down.
- [x] Insights engine (rule-based): vs-last-period changes, over-budget warnings, top category, no-spend streaks.
- **Done when:** the numbers on Home/Stats match hand-calculated test fixtures.

### Phase 6 — Goals & recurring (2 days)
- [x] Savings goals CRUD, contribute/withdraw, progress ring; Profile "Monthly savings goal" card.
- [x] Recurring bills/income; "Upcoming bills (next 7 days)"; *Mark as paid* creates a transaction and advances `nextDue`; overdue state shown in-app. No notifications.
- **Done when:** a monthly bill appears when due, can be paid in one tap, and rolls to next month (incl. month-end edge cases like the 31st).

### Phase 7 — Backup, settings, polish (1–2 days)
- [x] Export through the share sheet (plain + passphrase-encrypted), import via file picker, CSV export, "last backup" indicator and in-app reminder banner (§5.6).
- [ ] Settings: currency, theme (light/dark/system), week start, hide balances. *(Currency, week start and hide-balances done. Light/dark theme deferred, see §0.)*
- [x] Haptics (`navigator.vibrate` where supported), motion-reduce support.
- [ ] Accessibility pass: labels, focus order, contrast, dynamic type, screen-reader checks. *(Partial: labels, focus rings and reduced motion done. No full screen-reader audit yet.)*
- **Done when:** a full export → wipe → import round-trip restores everything identically.

### Phase 8 — Hardening & launch (1–2 days)
- [ ] Playwright flows: onboarding, lock/unlock, add transaction, offline reload, update flow.
- [ ] Real-device matrix: iPhone (Safari + installed), Android Chrome (installed), a low-end Android.
- [ ] Strict CSP, remove console logs, bundle-size review, Lighthouse ≥ 90 on PWA/Performance/Accessibility. *(CSP and cache headers done in `vercel.json`. Lighthouse and bundle review still to do.)*
- [x] Privacy statement screen ("Your data never leaves this device").
- [ ] Final production domain locked → deploy → share install link/QR code.

**Rough total:** ~2–3 weeks of focused work for a solo developer.

---

## 11. Testing strategy

- **Unit (Vitest):** money maths, period ranges, aggregates, recurring-date rollover, insights, backup schema validation, crypto wrap/unwrap round-trips, PIN back-off.
- **Component (RTL):** PinPad, transaction form validation, budget ring states.
- **E2E (Playwright):** happy paths + offline mode (`context.setOffline(true)`), service-worker update.
- **Manual device checklist:** install, launch biometrics, background → auto-lock, airplane mode, rotate, notch/home-indicator safe areas, keyboard overlap on the Add sheet, iOS 7-day-eviction awareness (installed vs not), large text setting.
- **Testing on phones during dev:** `localhost` works for service workers on desktop, but phones need HTTPS → use a deploy preview or a tunnel (e.g. Cloudflare Tunnel).

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| iOS evicts storage of non-installed sites | Install guidance, `persist()`, prominent backups, backup-age reminder |
| Biometrics unsupported/inconsistent across browsers | Feature detection, PIN always available, clear messaging |
| Domain change orphans data | Lock domain early; backup/restore; consider a custom domain from the start |
| User forgets PIN | Test build: master PIN 0000. Real release: recovery code + backup restore |
| WebAuthn PRF support varies | PRF-optional design (§5.1); PIN remains root key |
| No background notifications | In-app reminders on open + calendar export; set expectations in UI |
| Data corruption on schema change | Dexie versioned migrations + pre-migration snapshot + tests |
| Time-zone / DST date bugs | Store day-level dates as plain `YYYY-MM-DD`; compute periods in local time with date-fns |
| Float rounding in money | Integer minor units only |

---

## 13. Open questions

None blocking. Currency, branding and dark mode are settled in §0.

---

## 14. Suggested first steps once approved

1. Phase 0 + Phase 1 together, deployed to Vercel so you can install it on your own phone immediately.
2. Then Phase 3 (security) before building features, so all feature data is written through the encrypted layer from the start rather than retrofitted.
