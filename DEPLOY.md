# Lwang Black — Go-Live Checklist

Everything you need to do, in order, between "code is ready" and "customers are buying."

Tick items off in the order they appear — most depend on the previous one.

---

## Phase 1 — Merchant accounts (do these first, 2–7 days)

These are external; you sign up, they verify your business, you get keys.

| # | Provider | Time | URL |
|---|---|---|---|
| 1 | **Stripe** (cards / Apple Pay / Google Pay / Afterpay) | Same-day | https://dashboard.stripe.com/register |
| 2 | **PayPal Business** | 1–3 days | https://www.paypal.com/au/business |
| 3 | **SendGrid** + verify sender DKIM/SPF | 1 day | https://signup.sendgrid.com |
| 4 | **Postgres** (Render) | 5 min | https://render.com → New + → PostgreSQL |
| 5 | **Australia Post MyPost Business** | 1–3 days | https://auspost.com.au/mypost-business |
| 6 | **Khalti** (Nepal) — needs PAN + KYC | 3–7 days | https://admin.khalti.com |
| 7 | **eSewa merchant** | 3–7 days | https://merchant.esewa.com.np |
| 8 | **Pathao courier** API access | 7–14 days | https://merchant.pathao.com |
| 9 | **USPS Web Tools** (free) | Same-day | https://registration.shippingapis.com |
| 10 | **Chit Chats** (Canada) | 1 day | https://chitchats.com |
| 11 | **NZ Post developer** | 1–3 days | https://anypost.nzpost.co.nz/developer |
| 12 | **Domain** — point DNS at Vercel | 1 hour propagate | Your registrar |

> **Tip**: Steps 1–4 unlock most of the world (AU/US/UK/EU/JP/CA/NZ via Stripe + PayPal, plus
> AusPost for international). You can launch with just those four and add the Nepal stack later.

## Phase 2 — Webhooks (15 min, after Phase 1)

These wire the merchant accounts back to your API so payments confirm automatically.

### Stripe webhook

```
URL:    https://YOUR-API.onrender.com/api/payments/stripe-webhook
Events: checkout.session.completed
        payment_intent.succeeded
        payment_intent.payment_failed
        charge.refunded
```

Copy the resulting **`whsec_…`** into `STRIPE_WEBHOOK_SECRET`.

### PayPal webhook

```
URL:    https://YOUR-API.onrender.com/api/payments/paypal-webhook
Events: CHECKOUT.ORDER.APPROVED
        PAYMENT.CAPTURE.COMPLETED
        PAYMENT.CAPTURE.REFUNDED
```

Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`.

### eSewa / Khalti / Nabil

Use **return URLs**, not webhooks. The code already wires them:
- eSewa success → `https://YOUR-API/api/payments/esewa-verify?orderId=…`
- Khalti success → `https://YOUR-API/api/payments/khalti-verify?orderId=…`
- Nabil success → `https://YOUR-API/api/payments/nabil-callback`

These go into the merchant dashboard at signup.

## Phase 3 — Configure (10 min)

```bash
# Local one-shot configure
npm run setup
```

Paste each key when prompted. The script writes `backend/.env` with `0600` perms. **Don't commit it.**

For production, paste the same keys into the Render dashboard:

```
Render → your-api → Environment
  STRIPE_SECRET_KEY        = sk_live_…
  STRIPE_PUBLISHABLE_KEY   = pk_live_…
  STRIPE_WEBHOOK_SECRET    = whsec_…
  PAYPAL_CLIENT_ID         = …
  PAYPAL_CLIENT_SECRET     = …
  PAYPAL_MODE              = live
  DATABASE_URL             = postgres://… (auto if Render-Postgres in same project)
  SENDGRID_API_KEY         = SG.…
  SENDGRID_FROM_EMAIL      = brewed@yourdomain.com   ← must be verified sender
  SITE_URL                 = https://www.yourdomain.com
  FRONTEND_URL             = https://www.yourdomain.com
  CORS_ORIGIN              = https://www.yourdomain.com,https://yourdomain.com
  AUSPOST_API_KEY          = …
  AUSPOST_ACCOUNT_NUMBER   = …
  AUSPOST_PASSWORD         = …
  KHALTI_SECRET_KEY        = live_secret_…
  ESEWA_SECRET_KEY         = …
  PATHAO_CLIENT_ID         = …
  (etc — see SETUP.md)
```

For Vercel (the storefront):

```
Vercel → your-site → Settings → Environment Variables
  LWB_API_BASE         = https://YOUR-API.onrender.com/api
  BACKEND_URL          = https://YOUR-API.onrender.com
  VITE_API_URL         = https://YOUR-API.onrender.com   ← for admin SPA
  GTM_CONTAINER_ID     = GTM-ABC1234   (or leave blank to strip GTM)
```

## Phase 4 — Content (1–2 hours, you-only)

Things only you can fill in correctly:

- [ ] **Real registered address** in `geo-router.js` `REGION_DATA` (currently has placeholder
      Sydney/SF/etc. addresses). Replace with your registered business address per
      Australian Consumer Law / Nepali ecommerce regulations.
- [ ] **Real phone numbers** in `REGION_DATA` (currently placeholder).
- [ ] **WhatsApp Business numbers** in `REGION_DATA`.
- [ ] **Privacy / Terms / Refund / Return / Shipping policies** — drafts exist in
      `*-policy.html`; have a lawyer review before going live.
- [ ] **Replace `favicon.png`** (current file is 133 bytes / broken).
- [ ] **Compress `videomaking.mp4`** (currently 11.4 MB → target ~2 MB or move to a CDN).
- [ ] **Real product photos** — admin → Products → upload (the `/api/upload/image` route
      is already wired with auth, multer storage and 8 MB cap).
- [ ] **Confirm prices in `pricing.js`** match what you actually want to charge in each region.
      (28 products × 6 currencies = 168 prices. Spot-check the top sellers.)
- [ ] **GST / VAT** — if registered, edit `checkout.html` to display tax. Currently shipping
      is added but no tax line.

## Phase 5 — Test (4–6 hours, critical)

Run each scenario end-to-end before flipping the live switch.

### Test mode payments (Stripe in test, PayPal in sandbox, eSewa in EPAYTEST)

- [ ] Place an order from an AU IP using **Stripe test card 4242 4242 4242 4242**
  - Confirm: order created → email received → invoice PDF generated → admin sees it live → stock decremented
- [ ] Place an order from an AU IP using **PayPal sandbox**
- [ ] Place an order from a Nepal IP using **eSewa EPAYTEST**
- [ ] Place an order from a Nepal IP using **Khalti test wallet**
- [ ] Place an order using **COD** (Nepal)
- [ ] Trigger a **refund** from the admin → verify customer email + DB status flips
- [ ] Test a **failed payment** (Stripe card 4000 0000 0000 0002) — order status should flip to `failed`, stock NOT decremented
- [ ] Test the **shipping label** flow with at least AusPost test mode
- [ ] Test **stock at zero** — order with qty > available, should block at checkout

### Region detection

- [ ] Use a VPN / browser DevTools "Sensors → Location" to test:
  - Nepal IP → NP banner shows, NPR pricing, eSewa option visible
  - Australia IP → no NP banner, AUD pricing, Stripe/PayPal/Afterpay
  - Brazil IP (any non-six-region) → AU site loads, but BRL price shown via FX
- [ ] Manual override: open DevTools, run `GeoRouter.set('JP')`, page should reload with JPY

### Performance

- [ ] Run **Lighthouse** on production URL — Performance ≥ 80, Accessibility ≥ 90
- [ ] Check `/api/health` from Render — response < 200ms
- [ ] Run a **load test** — `npx autocannon -d 30 https://YOUR-SITE/` — should not error out
- [ ] Free Render plan **sleeps after 15 min idle** — first visitor waits 30s. Either upgrade
      to Starter ($7/mo) or wire a UptimeRobot ping every 10 min.

## Phase 6 — Switch to live (the moment)

In this exact order:

1. Verify all test scenarios in Phase 5 passed.
2. Switch `STRIPE_MODE=live`, `PAYPAL_MODE=live`, `ESEWA_LIVE=true`, `KHALTI_LIVE=true` in Render env.
3. Replace test API keys with live keys.
4. Re-deploy Render service (`git push` or click "Manual Deploy").
5. Re-register webhooks pointing at the same URL but using your live merchant accounts.
6. Place ONE real order with a small amount ($1) using your own card.
7. Confirm: money lands in Stripe dashboard, email arrives, refund works.
8. Refund yourself.
9. Announce.

## Phase 7 — Monitoring (set up before launch, not after)

| Thing | Where | What to watch |
|---|---|---|
| Stripe alerts | Stripe → Developers → Webhooks | Failed deliveries, > 3 retries |
| Server uptime | UptimeRobot or similar | `/api/health` every 5 min |
| Error tracking | Sentry (add `@sentry/node`) — currently not wired | Server-side exceptions |
| Order alerts | Already wired via WebSocket → admin dashboard | Live every order |
| Database backups | Render Postgres dashboard | Auto-daily on paid tier; verify retention |
| FX rate refresh | `/api/fx/rates?base=AUD` | Check `cached:false` once per hour |

---

## What's known-incomplete (won't block launch but will need attention)

- **No Sentry / error tracking** — server errors only logged to stdout. Add `@sentry/node` before scale.
- **No A/B test framework** — pricing is hardcoded; no experimentation hooks.
- **No abandoned-cart email** — cart contents not pushed to backend until checkout.
- **No multi-language UI** — `i18n.js` exists but only English/Nepali strings are populated.
- **GST display on checkout** — the math is correct, but the line item isn't shown separately.
- **Render free tier** — sleeps after idle. Upgrade to Starter for go-live.
- **Stock is per-product** not per-variant** — if you add T-shirts in 5 sizes, all sizes share one stock count. Variants table exists but isn't wired through stock decrement yet.
- **No fraud rules beyond Stripe Radar** (which is bundled with Stripe and on by default).

---

## TL;DR — the absolute minimum to go live

If you do nothing else, do these in this order:

1. Sign up at Stripe + PayPal + Render Postgres + SendGrid (Phase 1, items 1–4).
2. `npm run setup` → paste keys → it writes `backend/.env`.
3. `git push` to Render — backend deploys.
4. `git push` to Vercel — storefront deploys.
5. Register Stripe + PayPal webhooks (Phase 2).
6. Replace placeholder addresses in `geo-router.js` REGION_DATA (Phase 4).
7. Run Phase 5 test scenarios with test keys.
8. Switch keys to live, redeploy, place a $1 self-test order, refund it.
9. Open the doors.

That's it. The code is ready when you are.
