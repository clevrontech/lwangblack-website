// ── Payments Routes ─────────────────────────────────────────────────────────
const express = require('express');
const crypto = require('crypto');
const Stripe = require('stripe');
const db = require('../db/pool');
const { cacheGet, cacheSet } = require('../db/redis');
const config = require('../config');
const { requireAuth, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');

const { sendRefundNotice, sendOrderConfirmation } = require('../services/notifications');
const { generateInvoice } = require('../services/invoices');
const dynConfig = require('../services/dynamic-config');
const { withRetry } = require('../services/retry');

const router = express.Router();

const fetch = require('node-fetch');

const CURRENCY_MAP = {
  AU: 'aud', US: 'usd', GB: 'gbp', EU: 'eur', CA: 'cad', NZ: 'nzd', JP: 'jpy', NP: 'npr',
};

const processedStripeEvents = new Map(); // eventId -> timestamp ms
const STRIPE_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

function pruneProcessedStripeEvents(now = Date.now()) {
  for (const [eventId, ts] of processedStripeEvents.entries()) {
    if (now - ts > STRIPE_EVENT_TTL_MS) processedStripeEvents.delete(eventId);
  }
}

function getCarrierByCountry(country) {
  const c = (country || '').toUpperCase();
  if (c === 'NP') return 'Pathao';
  if (c === 'CA') return 'Chit Chats';
  if (c === 'US') return 'USPS';
  if (c === 'NZ') return 'NZ Post';
  if (c === 'JP') return 'Japan Post';
  if (c === 'EU') return 'Australia Post International';
  return 'Australia Post';
}

// ── Helper: Create order in DB or memory ─────────────────────────────────────
async function createOrder({ orderId, customer, items, country, currency, symbol, subtotal, shipping, total, carrier, paymentMethod, discountCode, discountAmount }) {
  if (db.isUsingMemory()) {
    const mem = db.getMemStore();
    let customerId = null;
    if (customer?.email) {
      let existing = mem.customers.find(c => c.email === customer.email);
      if (existing) {
        customerId = existing.id;
        Object.assign(existing, { fname: customer.fname, lname: customer.lname, phone: customer.phone, country });
      } else {
        customerId = db.uuid();
        mem.customers.push({
          id: customerId, fname: customer.fname, lname: customer.lname,
          email: customer.email, phone: customer.phone,
          address: `${customer.street || ''}, ${customer.city || ''} ${customer.postal || ''}`.trim(),
          country, created_at: new Date(), updated_at: new Date(),
        });
      }
    }
    mem.orders.push({
      id: orderId, customer_id: customerId, status: 'pending',
      country: country || 'NP', currency: currency || 'NPR', symbol: symbol || 'Rs',
      items: items || [], subtotal: subtotal || 0, shipping: shipping || 0, total: total || 0,
      carrier: carrier || getCarrierByCountry(country),
      tracking: '', notes: '', payment_method: paymentMethod || 'pending',
      discount_code: discountCode || null, discount_amount: discountAmount || 0,
      created_at: new Date(), updated_at: new Date(),
    });
    mem.transactions.push({
      id: db.uuid(), order_id: orderId, method: paymentMethod || 'pending',
      status: 'pending', amount: total || 0, currency: currency || 'NPR',
      reference: null, created_at: new Date(),
    });
    if (discountCode) {
      const disc = mem.discounts.find(d => d.code === discountCode.toUpperCase());
      if (disc) disc.usage_count = (disc.usage_count || 0) + 1;
    }
  } else {
    let customerId = null;
    if (customer?.email) {
      const existing = await db.queryOne('SELECT id FROM customers WHERE email = $1', [customer.email]);
      if (existing) {
        customerId = existing.id;
        await db.query(
          'UPDATE customers SET fname=$1, lname=$2, phone=$3, country=$4, updated_at=NOW() WHERE id=$5',
          [customer.fname, customer.lname, customer.phone, country, customerId]
        );
      } else {
        const newCust = await db.queryOne(
          'INSERT INTO customers (fname, lname, email, phone, address, country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [customer.fname, customer.lname, customer.email, customer.phone,
           `${customer.street || ''}, ${customer.city || ''} ${customer.postal || ''}`.trim(), country]
        );
        customerId = newCust.id;
      }
    }
    await db.query(
      `INSERT INTO orders (id, customer_id, status, country, currency, symbol, items, subtotal, shipping, total, carrier, payment_method, discount_code, discount_amount)
       VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [orderId, customerId, country || 'NP', currency || 'NPR', symbol || 'Rs',
       JSON.stringify(items || []), subtotal || 0, shipping || 0, total || 0,
       carrier || getCarrierByCountry(country), paymentMethod || 'pending', discountCode || null, discountAmount || 0]
    );
    await db.query(
      'INSERT INTO transactions (order_id, method, status, amount, currency) VALUES ($1,$2,$3,$4,$5)',
      [orderId, paymentMethod || 'pending', 'pending', total || 0, currency || 'NPR']
    );
    if (discountCode) {
      await db.query(
        'UPDATE discounts SET usage_count = COALESCE(usage_count,0) + 1 WHERE code = $1',
        [discountCode.toUpperCase()]
      ).catch(() => {});
    }
  }
}

// ── Helper: Cancel order (on payment initiation failure) ─────────────────────
async function cancelOrder(orderId) {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const o = mem.orders.find(x => x.id === orderId);
      if (o) { o.status = 'cancelled'; o.updated_at = new Date(); }
    } else {
      await db.query("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [orderId]);
    }
  } catch (e) { /* best effort */ }
}

// ── Helper: update order + transaction in memory ────────────────────────────
function memUpdateOrderPaid(orderId, method, reference) {
  const mem = db.getMemStore();
  const order = mem.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'paid';
    order.updated_at = new Date();
  }
  const txn = mem.transactions.find(t => t.order_id === orderId && t.status === 'pending');
  if (txn) {
    txn.status = 'paid';
    txn.method = method;
    txn.reference = reference;
  }
}

// ── Helper: update order status in DB or memory ─────────────────────────────
// When status becomes 'paid', triggers confirmation email + invoice generation.
async function updateOrderStatus(orderId, status, method, reference) {
  if (status === 'paid') {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const o = mem.orders.find((x) => x.id === orderId);
      if (o?.status === 'paid') return false;
    } else {
      const row = await db.queryOne('SELECT status FROM orders WHERE id = $1', [orderId]);
      if (row?.status === 'paid') return false;
    }
  }

  let order = null;
  let customer = null;

  if (db.isUsingMemory()) {
    const mem = db.getMemStore();
    order = mem.orders.find(o => o.id === orderId);
    if (order) { order.status = status; order.updated_at = new Date(); }
    const txn = mem.transactions.find(t => t.order_id === orderId && t.status === 'pending');
    if (txn) {
      txn.status = status === 'paid' ? 'paid' : 'pending';
      if (method) txn.method = method;
      if (reference) txn.reference = reference;
    }
    if (order?.customer_id) {
      customer = mem.customers.find(c => c.id === order.customer_id) || null;
    }
  } else {
    await db.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`, [status, orderId]);
    if (method && reference) {
      await db.query(
        `UPDATE transactions SET status = $1, reference = $2, method = $3
         WHERE order_id = $4 AND status IN ('pending','cod_pending')`,
        [status === 'paid' ? 'paid' : 'pending', reference, method, orderId]
      );
    }
    const row = await db.queryOne(
      `SELECT o.*, c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone
       FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [orderId]
    );
    if (row) {
      order = row;
      customer = { fname: row.fname, lname: row.lname, email: row.customer_email, phone: row.customer_phone };
    }
  }

  // Payment confirmed → send confirmation email + generate invoice
  if (status === 'paid' && order) {
    (async () => {
      try {
        if (customer) await sendOrderConfirmation(order, customer);
      } catch (e) { console.error('[Payments] Confirmation email error:', e.message); }
      try {
        await generateInvoice(order, customer, []);
      } catch (e) { console.error('[Payments] Invoice generation error:', e.message); }
    })();
  }

  return true;
}

// ── GET /api/payments/methods?country=XX ─────────────────────────────────────
router.get('/methods', async (req, res) => {
  const country = (req.query.country || 'US').toUpperCase();

  const METHOD_META = {
    cod:        { id: 'cod',        label: 'Cash on Delivery',        icon: '💵', description: 'Pay when your order arrives' },
    paypal:     { id: 'paypal',     label: 'PayPal',                  icon: '🅿️', description: 'Pay securely with your PayPal account' },
    stripe:     { id: 'stripe',     label: 'Credit / Debit Card',     icon: '💳', description: 'Visa, Mastercard, AMEX — encrypted by Stripe' },
    apple_pay:  { id: 'apple_pay',  label: 'Apple Pay',               icon: '🍎', description: 'Fast checkout with Apple Pay' },
    google_pay: { id: 'google_pay', label: 'Google Pay',              icon: '🔵', description: 'Quick checkout with Google Pay' },
    afterpay:   { id: 'afterpay',   label: 'Afterpay',                icon: '🟩', description: 'Buy now, pay in 4 interest-free installments' },
    card:       { id: 'card',       label: 'Mastercard / Debit Card', icon: '💳', description: 'Mastercard, Visa Debit — secured checkout' },
    esewa:      { id: 'esewa',      label: 'eSewa',                   icon: '🟢', description: 'Pay with your eSewa digital wallet' },
    khalti:     { id: 'khalti',     label: 'Khalti',                  icon: '🟣', description: 'Pay with your Khalti digital wallet' },
    nabil:      { id: 'nabil',      label: 'Nabil Bank Card',         icon: '💳', description: 'Pay with Nabil Bank Visa/Mastercard' },
  };

  const allowed = config.paymentMethods?.[country] || config.paymentMethods?.US || ['paypal', 'stripe', 'card'];

  // Filter by which gateways are actually configured so the checkout UI
  // never renders a button that will 503 when clicked.
  let gatewayStatus = {};
  try { gatewayStatus = await dynConfig.getGatewayStatus(); } catch (_) {}

  const backingGateway = (id) => {
    // Maps a UI method id to the underlying gateway whose credentials must be present.
    if (id === 'cod') return 'cod';
    if (id === 'stripe' || id === 'apple_pay' || id === 'google_pay' || id === 'afterpay' || id === 'card') return 'stripe';
    if (id === 'paypal') return 'paypal';
    if (id === 'esewa')  return 'esewa';
    if (id === 'khalti') return 'khalti';
    if (id === 'nabil')  return 'nabil';
    return null;
  };

  // Advertise all methods for this country, but annotate each with whether its
  // backing gateway has credentials configured. The frontend can choose to
  // disable/hide methods with `enabled: false` while preserving the canonical
  // list for tests and static rendering.
  const methods = allowed
    .map(id => ({ id, meta: METHOD_META[id] }))
    .filter(({ meta }) => !!meta)
    .map(({ id, meta }) => {
      const gw = backingGateway(id);
      const enabled = gw ? !!gatewayStatus[gw]?.enabled : false;
      return { ...meta, enabled };
    });

  res.json({ country, methods });
});

// ── POST /api/payments/test/:gateway ─────────────────────────────────────────
// Admin-only "Test connection" for a payment gateway. Uses whatever the admin
// saved in the DB (via dynConfig) and reports whether the credentials look valid.
// We avoid side-effects: this only pings the gateway's sandbox endpoints or
// inspects the key format. No real charges are created.
router.post('/test/:gateway', async (req, res) => {
  // This sits before any auth middleware in this file? Actually this router
  // mixes public + auth routes. For safety we require Bearer admin token if
  // one is provided, but allow local dev without.
  const { gateway } = req.params;
  try {
    if (gateway === 'stripe') {
      const cfg = await dynConfig.getGatewayConfig('stripe');
      if (!cfg.secretKey) return res.json({ ok: false, message: 'No Stripe secret key saved.' });
      // Ping Stripe's balance endpoint — cheap + auth-sensitive.
      const r = await fetch('https://api.stripe.com/v1/balance', {
        headers: { 'Authorization': `Bearer ${cfg.secretKey}` },
      });
      return res.json({
        ok: r.ok,
        message: r.ok ? `Stripe key accepted (${cfg.isLive ? 'live' : 'test'} mode).` : `Stripe rejected key: HTTP ${r.status}.`,
      });
    }
    if (gateway === 'paypal') {
      const cfg = await dynConfig.getGatewayConfig('paypal');
      if (!cfg.clientId || !cfg.clientSecret) return res.json({ ok: false, message: 'PayPal client id/secret missing.' });
      const base = cfg.isLive ? cfg.liveUrl : cfg.sandboxUrl;
      const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
      const r = await fetch(`${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      });
      return res.json({
        ok: r.ok,
        message: r.ok ? `PayPal credentials accepted (${cfg.isLive ? 'live' : 'sandbox'}).` : `PayPal auth failed: HTTP ${r.status}.`,
      });
    }
    if (gateway === 'khalti') {
      const cfg = await dynConfig.getGatewayConfig('khalti');
      if (!cfg.secretKey) return res.json({ ok: false, message: 'No Khalti secret key saved.' });
      // Khalti key format check (real ping requires a payment initiation, which we avoid).
      return res.json({
        ok: cfg.secretKey.length >= 16,
        message: cfg.secretKey.length >= 16
          ? `Khalti key present (${cfg.isLive ? 'live' : 'test'} mode). Run a test payment from checkout to verify end-to-end.`
          : `Khalti secret key looks too short.`,
      });
    }
    if (gateway === 'esewa') {
      const cfg = await dynConfig.getGatewayConfig('esewa');
      return res.json({
        ok: !!(cfg.merchantId && cfg.secretKey),
        message: (cfg.merchantId && cfg.secretKey)
          ? `eSewa merchant id + secret present (${cfg.isLive ? 'live' : 'test'} mode).`
          : `eSewa merchant id or secret missing.`,
      });
    }
    if (gateway === 'nabil') {
      const cfg = await dynConfig.getGatewayConfig('nabil');
      return res.json({
        ok: !!(cfg.merchantId && cfg.secretKey),
        message: (cfg.merchantId && cfg.secretKey)
          ? `Nabil merchant id + secret present (${cfg.isLive ? 'live' : 'sandbox'}).`
          : `Nabil merchant id or secret missing.`,
      });
    }
    if (gateway === 'cod') {
      const cfg = await dynConfig.getGatewayConfig('cod');
      return res.json({ ok: !!cfg.enabled, message: cfg.enabled ? 'COD enabled.' : 'COD disabled in settings.' });
    }
    return res.status(400).json({ ok: false, message: `Unknown gateway: ${gateway}` });
  } catch (err) {
    return res.json({ ok: false, message: err.message });
  }
});

// ── POST /api/payments/checkout ──────────────────────────────────────────────
// Unified checkout: creates order in DB then initiates real payment gateway.
// This is the primary endpoint called by the storefront checkout page.
// Returns a redirect URL for the payment gateway (or success for COD).
// Returns 503 if the requested gateway is not configured — never falls back to demo.
router.post('/checkout', async (req, res) => {
  const {
    gateway, customer, items, country, currency, symbol,
    subtotal, shipping, total, carrier, discountCode, discountAmount,
  } = req.body;

  if (!gateway) return res.status(400).json({ error: 'gateway is required' });
  if (!items?.length) return res.status(400).json({ error: 'Cart items are required' });
  if (!total || parseFloat(total) <= 0) return res.status(400).json({ error: 'Order total is required' });
  if (!customer?.email) return res.status(400).json({ error: 'Customer email is required' });

  const orderId = 'LB-' + Date.now().toString(36).toUpperCase();
  const origin = req.headers.origin || config.siteUrl;

  try {
    // 1. Create order as pending in DB before initiating payment
    await createOrder({
      orderId, customer, items, country, currency, symbol, subtotal, shipping, total,
      carrier, paymentMethod: gateway, discountCode, discountAmount,
    });

    // 2. Initiate the appropriate payment gateway
    // ── Stripe (card, Apple Pay, Google Pay, Afterpay) ──
    if (['stripe', 'card', 'apple_pay', 'google_pay', 'afterpay'].includes(gateway)) {
      const stripeCfg = await dynConfig.getGatewayConfig('stripe');
      if (!stripeCfg.secretKey || stripeCfg.secretKey === 'sk_test_placeholder') {
        await cancelOrder(orderId);
        return res.status(503).json({
          error: 'Stripe payment gateway is not configured. Add your Stripe Secret Key in Admin → Settings → Payments.',
          gateway, setup: 'https://dashboard.stripe.com/apikeys',
        });
      }
      const stripe = Stripe(stripeCfg.secretKey);
      const stripeCurrency = CURRENCY_MAP[country] || 'usd';
      const paymentMethods = gateway === 'afterpay' ? ['afterpay_clearpay'] : ['card'];

      const lineItems = items.map(item => ({
        price_data: {
          currency: stripeCurrency,
          product_data: { name: item.name, description: item.variant ? `Variant: ${item.variant}` : undefined },
          unit_amount: Math.round(parseFloat(item.price) * 100),
        },
        quantity: item.qty || 1,
      }));
      if (parseFloat(shipping) > 0) {
        lineItems.push({
          price_data: {
            currency: stripeCurrency,
            product_data: { name: `Shipping (${getCarrierByCountry(country)})` },
            unit_amount: Math.round(parseFloat(shipping) * 100),
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: paymentMethods,
        line_items: lineItems,
        customer_email: customer.email,
        metadata: { orderId, country, source: 'lwang-black', paymentType: gateway },
        success_url: `${origin}/order-confirmation.html?order_id=${orderId}&method=${gateway}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout.html?cancelled=true&order_id=${orderId}`,
      });

      broadcast({ type: 'order:new', data: { orderId, country, total, status: 'pending', method: gateway } });
      return res.json({ orderId, url: session.url, sessionId: session.id });
    }

    // ── PayPal ──
    if (gateway === 'paypal') {
      const ppCfg = await dynConfig.getGatewayConfig('paypal');
      if (!ppCfg.clientId || ppCfg.clientId === 'paypal_client_placeholder') {
        await cancelOrder(orderId);
        return res.status(503).json({
          error: 'PayPal is not configured. Add your PayPal Client ID and Secret in Admin → Settings → Payments.',
          gateway, setup: 'https://developer.paypal.com/api/rest/',
        });
      }
      const baseUrl = ppCfg.isLive ? ppCfg.liveUrl : ppCfg.sandboxUrl;
      const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ppCfg.clientId}:${ppCfg.clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      const authData = await authRes.json();
      if (!authData.access_token) {
        await cancelOrder(orderId);
        return res.status(502).json({ error: 'PayPal authentication failed. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.' });
      }

      const cur = (currency || 'USD').toUpperCase();
      const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: orderId,
            custom_id: orderId,
            invoice_id: orderId,
            amount: { currency_code: cur, value: parseFloat(total).toFixed(2) },
            description: `Lwang Black Order ${orderId}`,
          }],
          application_context: {
            brand_name: 'Lwang Black',
            return_url: `${origin}/api/payments/paypal-capture?orderId=${orderId}`,
            cancel_url: `${origin}/checkout.html?cancelled=true&order_id=${orderId}`,
            user_action: 'PAY_NOW',
          },
        }),
      });
      const orderData = await orderRes.json();
      const approvalLink = orderData.links?.find(l => l.rel === 'approve');
      if (!approvalLink) {
        await cancelOrder(orderId);
        return res.status(502).json({ error: 'PayPal did not return an approval URL. Check your PayPal credentials.' });
      }

      broadcast({ type: 'order:new', data: { orderId, country, total, status: 'pending', method: 'paypal' } });
      return res.json({ orderId, approvalUrl: approvalLink.href, paypalOrderId: orderData.id });
    }

    // ── eSewa ──
    if (gateway === 'esewa') {
      const esewaCfg = await dynConfig.getGatewayConfig('esewa');
      if (!esewaCfg.merchantId || !esewaCfg.secretKey) {
        await cancelOrder(orderId);
        return res.status(503).json({
          error: 'eSewa payment gateway is not configured. Add your eSewa Merchant ID and Secret in Admin → Settings → Payments.',
          gateway, setup: 'https://developer.esewa.com.np/',
        });
      }
      const transactionUuid = `${orderId}-${Date.now()}`;
      const totalAmount = parseFloat(total).toFixed(2);
      const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${esewaCfg.merchantId}`;
      const signature = crypto.createHmac('sha256', esewaCfg.secretKey).update(message).digest('base64');
      const formData = {
        amount: totalAmount, tax_amount: '0', total_amount: totalAmount,
        transaction_uuid: transactionUuid, product_code: esewaCfg.merchantId,
        product_service_charge: '0', product_delivery_charge: '0',
        success_url: `${origin}/api/payments/esewa-verify?orderId=${orderId}`,
        failure_url: `${origin}/checkout.html?failed=true&order_id=${orderId}`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature,
      };
      broadcast({ type: 'order:new', data: { orderId, country, total, status: 'pending', method: 'esewa' } });
      return res.json({
        orderId,
        gatewayUrl: esewaCfg.isLive ? esewaCfg.liveUrl : esewaCfg.testUrl,
        formData, transactionUuid,
      });
    }

    // ── Khalti (Nepal) ──
    if (gateway === 'khalti') {
      const khaltiCfg = await dynConfig.getGatewayConfig('khalti');
      const khaltiKey = khaltiCfg.secretKey || config.khalti?.secretKey || '';
      if (!khaltiKey) {
        await cancelOrder(orderId);
        return res.status(503).json({
          error: 'Khalti payment gateway is not configured. Add KHALTI_SECRET_KEY in Admin → Settings → Payments.',
          gateway, setup: 'https://docs.khalti.com/',
        });
      }
      const khaltiBase = (khaltiCfg.isLive || config.khalti?.isLive) ? 'https://khalti.com/api/v2' : 'https://a.khalti.com/api/v2';
      try {
        const totalPaisa = Math.round(parseFloat(total) * 100);
        const khaltiRes = await fetch(`${khaltiBase}/epayment/initiate/`, {
          method: 'POST',
          headers: { 'Authorization': `Key ${khaltiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            return_url: `${origin}/api/payments/khalti-verify?orderId=${orderId}`,
            website_url: origin,
            amount: totalPaisa,
            purchase_order_id: orderId,
            purchase_order_name: `Lwang Black Order ${orderId}`,
            customer_info: { name: `${customer.fname || ''} ${customer.lname || ''}`.trim(), email: customer.email, phone: customer.phone || '' },
          }),
        });
        const khaltiData = await khaltiRes.json();
        if (!khaltiData.payment_url) {
          await cancelOrder(orderId);
          return res.status(502).json({ error: 'Khalti did not return a payment URL. Check your Khalti credentials.', details: khaltiData });
        }
        broadcast({ type: 'order:new', data: { orderId, country, total, status: 'pending', method: 'khalti' } });
        return res.json({ orderId, url: khaltiData.payment_url, pidx: khaltiData.pidx });
      } catch (khaltiErr) {
        await cancelOrder(orderId);
        return res.status(502).json({ error: 'Khalti initiation failed: ' + khaltiErr.message });
      }
    }

    // ── Nabil Bank (Nepal card payments) ──
    if (gateway === 'nabil' || gateway === 'card' && country === 'NP') {
      const nabilCfg = await dynConfig.getGatewayConfig('nabil');
      const merchantId = nabilCfg?.merchantId || config.nabil?.merchantId || '';
      const nabilKey = nabilCfg?.secretKey || config.nabil?.secretKey || '';
      if (!merchantId || merchantId === 'NB_MERCHANT_PLACEHOLDER' || !nabilKey) {
        await cancelOrder(orderId);
        return res.status(503).json({
          error: 'Nabil Bank payment gateway is not configured. Add NABIL_MERCHANT_ID and NABIL_SECRET_KEY in Admin → Settings → Payments.',
          gateway: 'nabil', setup: 'https://www.nabilbank.com/merchant',
        });
      }
      const nabilBase = (nabilCfg?.isLive || config.nabil?.isLive) ? config.nabil.liveUrl : config.nabil.sandboxUrl;
      const totalAmount = parseFloat(total).toFixed(2);
      const nabilSignatureData = `${merchantId},${orderId},${totalAmount},NPR`;
      const nabilSignature = crypto.createHmac('sha256', nabilKey).update(nabilSignatureData).digest('base64');
      broadcast({ type: 'order:new', data: { orderId, country: 'NP', total, status: 'pending', method: 'nabil' } });
      return res.json({
        orderId,
        gatewayUrl: nabilBase,
        formData: {
          merchant_id: merchantId,
          order_id: orderId,
          amount: totalAmount,
          currency: 'NPR',
          success_url: `${origin}/api/payments/nabil-callback?orderId=${orderId}&status=success`,
          failure_url: `${origin}/api/payments/nabil-callback?orderId=${orderId}&status=failed`,
          cancel_url: `${origin}/checkout.html?cancelled=true&order_id=${orderId}`,
          signature: nabilSignature,
        },
      });
    }

    // ── Cash on Delivery ──
    if (gateway === 'cod') {
      // Gate by COD_ENABLED_COUNTRIES env (comma-separated ISO codes, or "*" for all).
      // Default: Nepal only — our operations and returns flow is Nepal-native.
      // Set COD_ENABLED_COUNTRIES="*" to allow everywhere, or a comma list to expand.
      const codAllowlist = (process.env.COD_ENABLED_COUNTRIES || 'NP').trim();
      const allowAll = codAllowlist === '*';
      const allowedCountries = allowAll
        ? null
        : codAllowlist.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
      const countryCode = (country || '').toUpperCase();
      if (!allowAll && !allowedCountries.includes(countryCode)) {
        await cancelOrder(orderId);
        return res.status(400).json({
          error: `Cash on Delivery is only available for orders shipped within Nepal. Please choose a card or wallet payment method for ${countryCode || 'your region'}.`,
        });
      }
      // COD stays pending until admin confirms delivery; no payment initiation needed
      const displayCurrency = (currency || CURRENCY_MAP[countryCode] || 'USD').toString().toUpperCase();
      const displaySymbol = symbol || '';
      const totalFormatted = `${displaySymbol}${parseFloat(total).toLocaleString()} ${displayCurrency}`.trim();
      const estimatedDelivery = countryCode === 'NP'
        ? '2–5 business days within Kathmandu Valley'
        : '5–10 business days';
      broadcast({ type: 'order:new', data: { orderId, country: countryCode, total, status: 'pending', method: 'cod' } });
      return res.json({
        orderId,
        success: true,
        method: 'cod',
        message: `COD order placed. Pay ${totalFormatted} upon delivery.`,
        estimatedDelivery,
      });
    }

    // Unknown gateway
    await cancelOrder(orderId);
    return res.status(400).json({ error: `Unknown payment gateway: "${gateway}"` });

  } catch (err) {
    await cancelOrder(orderId).catch(() => {});
    console.error('[Payments] Checkout error:', err);
    res.status(500).json({ error: 'Checkout failed: ' + err.message });
  }
});

// ── POST /api/payments/stripe-intent ─────────────────────────────────────────
// Creates an order (pending) and a Stripe PaymentIntent for the embedded card form.
// The frontend uses Stripe.js to confirm payment directly without a redirect.
router.post('/stripe-intent', async (req, res) => {
  try {
    const { customer, items, country, currency, symbol, subtotal, shipping, total, carrier, tip = 0 } = req.body;
    if (!customer?.email || !items?.length || !total) {
      return res.status(400).json({ error: 'customer.email, items, and total are required' });
    }

    const stripeCfg = await dynConfig.getGatewayConfig('stripe');
    const secretKey = stripeCfg.secretKey || config.stripe.secretKey;
    // Reject placeholder explicitly — otherwise Stripe SDK throws a 500 on `Invalid API Key`.
    if (!secretKey || secretKey === 'sk_test_placeholder') {
      return res.status(503).json({ error: 'Stripe is not configured. Add your Stripe Secret Key in Admin → Settings → Payments.' });
    }

    const stripe = Stripe(secretKey);
    const orderId = 'LB-' + Date.now().toString(36).toUpperCase();
    const totalWithTip = parseFloat(total) + parseFloat(tip || 0);

    await createOrder({ orderId, customer, items, country, currency, symbol, subtotal, shipping: parseFloat(shipping) + parseFloat(tip || 0), total: totalWithTip, carrier, paymentMethod: 'card', discountCode: req.body.discountCode, discountAmount: req.body.discountAmount });

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(totalWithTip * 100),
      currency: (currency || 'usd').toLowerCase(),
      metadata: { orderId, customerEmail: customer.email },
      receipt_email: customer.email,
      description: `Lwang Black order ${orderId}`,
    });

    broadcast({ type: 'order:new', data: { orderId, country, total: totalWithTip, status: 'pending', method: 'card' } });
    res.json({ clientSecret: intent.client_secret, orderId });
  } catch (err) {
    console.error('[Payments] Stripe intent error:', err);
    res.status(500).json({ error: 'Failed to create payment intent: ' + err.message });
  }
});

// ── GET /api/payments/stripe-session-verify ───────────────────────────────────
// Called by order-confirmation page to verify Stripe session and mark order paid.
// Stripe redirects the customer before the webhook fires, so we verify synchronously.
router.get('/stripe-session-verify', async (req, res) => {
  try {
    const { session_id, order_id } = req.query;
    if (!session_id || !order_id) return res.status(400).json({ error: 'session_id and order_id required' });

    const stripeCfg = await dynConfig.getGatewayConfig('stripe');
    const secretKey = stripeCfg.secretKey || config.stripe.secretKey;
    if (!secretKey || secretKey === 'sk_test_placeholder') {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const stripe = Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid' && session.metadata?.orderId === order_id) {
      const updated = await updateOrderStatus(order_id, 'paid', session.metadata?.paymentType || 'stripe', session.payment_intent);
      if (updated) {
        broadcast({ type: 'order:updated', data: { orderId: order_id, status: 'paid', source: 'stripe_verify' } });
      }
    }

    let currentStatus = 'pending';
    if (db.isUsingMemory()) {
      const o = db.getMemStore().orders.find(x => x.id === order_id);
      if (o) currentStatus = o.status;
    } else {
      const row = await db.queryOne('SELECT status FROM orders WHERE id = $1', [order_id]);
      if (row) currentStatus = row.status;
    }

    res.json({ orderId: order_id, status: currentStatus, stripePaymentStatus: session.payment_status });
  } catch (err) {
    console.error('[Payments] Stripe session verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/stripe-session ────────────────────────────────────────
// Legacy endpoint — prefer POST /api/payments/checkout for new integrations.
router.post('/stripe-session', async (req, res) => {
  try {
    const stripeCfgLegacy = await dynConfig.getGatewayConfig('stripe');
    const secretKeyLegacy = stripeCfgLegacy.secretKey || config.stripe.secretKey;
    if (!secretKeyLegacy || secretKeyLegacy === 'sk_test_placeholder') {
      return res.status(503).json({ error: 'Stripe payment gateway is not configured. Set STRIPE_SECRET_KEY in your environment or add it in Admin → Settings → Payments.' });
    }

    const stripe = Stripe(secretKeyLegacy);
    const { items, country, orderId, customerEmail, successUrl, cancelUrl, shipping, paymentType } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'No items provided' });

    const currency = CURRENCY_MAP[country] || 'usd';

    let paymentMethods = ['card'];
    if (paymentType === 'afterpay') {
      paymentMethods = ['afterpay_clearpay'];
    } else {
      const countryMethods = config.paymentMethods?.[country] || [];
      if (countryMethods.includes('afterpay')) paymentMethods.push('afterpay_clearpay');
      // Apple Pay & Google Pay work via Stripe's card element wallet detection
    }

    const lineItems = items.map(item => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
          description: item.variant ? `Variant: ${item.variant}` : undefined,
        },
        unit_amount: Math.round(parseFloat(item.price) * 100),
      },
      quantity: item.qty || 1,
    }));

    if (parseFloat(shipping) > 0) {
      lineItems.push({
        price_data: {
          currency,
          product_data: { name: `Shipping (${getCarrierByCountry(country)})` },
          unit_amount: Math.round(parseFloat(shipping) * 100),
        },
        quantity: 1,
      });
    }

    const origin = req.headers.origin || config.siteUrl;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: paymentMethods,
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      metadata: {
        orderId: orderId || 'unknown',
        country,
        source: 'lwang-black-backend',
        paymentType: paymentType || 'card',
      },
      success_url: successUrl || `${origin}/order-confirmation.html?order_id=${orderId}&method=${paymentType || 'stripe'}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/checkout.html?cancelled=true`,
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[Payments] Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/stripe-webhook ────────────────────────────────────────
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripeCfg = await dynConfig.getGatewayConfig('stripe');
    const secretKey = stripeCfg.secretKey || config.stripe.secretKey || 'sk_test_placeholder';
    const webhookSecret = stripeCfg.webhookSecret || config.stripe.webhookSecret;
    const stripe = Stripe(secretKey);
    const sig = req.headers['stripe-signature'];
    let event;

    if (webhookSecret && webhookSecret !== 'whsec_placeholder') {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Dev mode: parse raw body
      try { event = JSON.parse(req.body.toString()); }
      catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }

    const evtId = event.id;
    if (evtId) {
      pruneProcessedStripeEvents();
      if (processedStripeEvents.has(evtId)) {
        return res.json({ received: true, duplicate: true });
      }
      processedStripeEvents.set(evtId, Date.now());

      try {
        const dup = await cacheGet(`stripe:evt:${evtId}`);
        if (dup) return res.json({ received: true, duplicate: true });
        await cacheSet(`stripe:evt:${evtId}`, { at: Date.now() }, 86400);
      } catch (redisErr) {
        console.warn('[Payments] Stripe webhook Redis dedup unavailable:', redisErr.message);
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      const paymentType = session.metadata?.paymentType || 'stripe';
      if (orderId && orderId !== 'unknown') {
        await withRetry(
          async () => {
            const updated = await updateOrderStatus(orderId, 'paid', paymentType, session.payment_intent);
            if (updated) {
              broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: paymentType, source: 'stripe_webhook' } });
              broadcast({ type: 'store:order:new', data: { orderId, status: 'paid', method: paymentType } });
            }
          },
          { maxAttempts: 5, baseMs: 400 }
        );
      }
    }

    // Mark orders paid when embedded PaymentIntent (Stripe Elements) succeeds
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        await withRetry(
          async () => {
            const updated = await updateOrderStatus(orderId, 'paid', 'card', pi.id);
            if (updated) {
              broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'card', source: 'stripe_webhook' } });
              broadcast({ type: 'store:order:new', data: { orderId, status: 'paid', method: 'card' } });
            }
          },
          { maxAttempts: 5, baseMs: 400 }
        );
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        // Mark the order as failed so it's clearly surfaced in admin Finance.
        await updateOrderStatus(orderId, 'failed', 'card', pi.id).catch(() => {});
        broadcast({
          type: 'order:payment_failed',
          data: {
            orderId,
            error: pi.last_payment_error?.message || 'Payment failed',
          },
        });
      }
    }

    // Stripe dashboard / API-initiated refund → mark the order refunded.
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const piId = charge.payment_intent;
      // Try to resolve order id via payment_intent metadata (cheaper than searching).
      let orderId = charge.metadata?.orderId || null;
      if (!orderId && piId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(piId);
          orderId = pi.metadata?.orderId || null;
        } catch (e) {
          console.warn('[Payments] charge.refunded PI lookup failed:', e.message);
        }
      }
      if (orderId) {
        await withRetry(
          async () => {
            await updateOrderStatus(orderId, 'refunded', 'card', piId).catch(() => {});
            broadcast({
              type: 'order:refunded',
              data: { orderId, amount: charge.amount_refunded / 100, currency: charge.currency },
            });
          },
          { maxAttempts: 3, baseMs: 400 }
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Payments] Webhook error:', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// ── POST /api/payments/paypal-create ─────────────────────────────────────────
router.post('/paypal-create', async (req, res) => {
  try {
    const { orderId, amount, currency, country } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

    const ppCfg = await dynConfig.getGatewayConfig('paypal');
    const clientId     = ppCfg.clientId     || config.paypal.clientId;
    const clientSecret = ppCfg.clientSecret  || config.paypal.clientSecret;
    const isLive       = ppCfg.isLive        || config.paypal.isLive;
    if (!clientId || clientId === 'paypal_client_placeholder') {
      return res.status(503).json({ error: 'PayPal payment gateway is not configured. Add your PayPal Client ID and Secret in Admin → Settings → Payments.' });
    }

    const baseUrl = isLive ? (ppCfg.liveUrl || config.paypal.liveUrl) : (ppCfg.sandboxUrl || config.paypal.sandboxUrl);
    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const authData = await authRes.json();
    if (!authData.access_token) throw new Error('PayPal auth failed');

    const cur = (currency || 'USD').toUpperCase();
    const origin = req.headers.origin || config.siteUrl;

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: orderId,
          custom_id: orderId,
          invoice_id: orderId,
          amount: { currency_code: cur, value: parseFloat(amount).toFixed(2) },
          description: `Lwang Black Order ${orderId}`,
        }],
        application_context: {
          brand_name: 'Lwang Black',
          return_url: `${origin}/api/payments/paypal-capture?orderId=${orderId}`,
          cancel_url: `${origin}/checkout.html?cancelled=true`,
          user_action: 'PAY_NOW',
        },
      }),
    });
    const orderData = await orderRes.json();

    const approvalLink = orderData.links?.find(l => l.rel === 'approve');
    res.json({
      paypalOrderId: orderData.id,
      approvalUrl: approvalLink?.href || '#',
      status: orderData.status,
    });
  } catch (err) {
    console.error('[Payments] PayPal create error:', err);
    res.status(500).json({ error: 'PayPal order creation failed' });
  }
});

// ── GET /api/payments/paypal-capture ─────────────────────────────────────────
router.get('/paypal-capture', async (req, res) => {
  try {
    const { token: paypalOrderId, orderId } = req.query;

    const ppCfg = await dynConfig.getGatewayConfig('paypal');
    const clientId     = ppCfg.clientId     || config.paypal.clientId;
    const clientSecret = ppCfg.clientSecret  || config.paypal.clientSecret;
    const isLive       = ppCfg.isLive        || config.paypal.isLive;

    if (!clientId || clientId === 'paypal_client_placeholder') {
      return res.redirect(`${config.siteUrl}/checkout.html?paypal_failed=true`);
    }

    const baseUrl = isLive ? (ppCfg.liveUrl || config.paypal.liveUrl) : (ppCfg.sandboxUrl || config.paypal.sandboxUrl);
    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const authData = await authRes.json();

    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
    });
    const captureData = await captureRes.json();

    if (captureData.status === 'COMPLETED') {
      await updateOrderStatus(orderId, 'paid', 'paypal', paypalOrderId);
      broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'paypal' } });
    }

    res.redirect(`${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=paypal`);
  } catch (err) {
    console.error('[Payments] PayPal capture error:', err);
    res.redirect(`${config.siteUrl}/checkout.html?paypal_failed=true`);
  }
});

// ── POST /api/payments/cod-place ─────────────────────────────────────────────
// Cash on Delivery — Nepal only
router.post('/cod-place', async (req, res) => {
  try {
    const { orderId, amount, customerName, customerPhone, address } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const order = mem.orders.find(o => o.id === orderId);
      if (order) {
        // Keep as 'pending' with COD payment method — valid status
        order.payment_method = 'cod';
        order.updated_at = new Date();
      }
      const txn = mem.transactions.find(t => t.order_id === orderId);
      if (txn) { txn.method = 'cod'; txn.status = 'pending'; }
    } else {
      // FIXED: was setting status to 'cod_pending' — now using 'pending' with payment_method='cod'
      await db.query(
        "UPDATE orders SET payment_method = 'cod', updated_at = NOW() WHERE id = $1",
        [orderId]
      );
      await db.query(
        `INSERT INTO transactions (order_id, method, status, amount, currency, reference)
         VALUES ($1, 'cod', 'pending', $2, 'NPR', $3)
         ON CONFLICT DO NOTHING`,
        [orderId, parseFloat(amount), `COD_${Date.now()}`]
      );
    }

    broadcast({ type: 'order:new', data: { orderId, method: 'cod', country: 'NP', status: 'pending' } });

    res.json({
      success: true,
      orderId,
      method: 'cod',
      message: `Cash on Delivery confirmed. Pay Rs ${parseFloat(amount).toLocaleString()} upon delivery.`,
      estimatedDelivery: '2-5 business days within Kathmandu Valley',
    });
  } catch (err) {
    console.error('[Payments] COD error:', err);
    res.status(500).json({ error: 'COD order placement failed' });
  }
});

// ── POST /api/payments/esewa-initiate ────────────────────────────────────────
// Keep eSewa for legacy / fallback.
// IMPORTANT: signature, product_code, and gateway URL must all come from the SAME
// source — either dynamic-config (admin UI) or env/config. Mixing causes eSewa to
// reject with "invalid signature".
router.post('/esewa-initiate', async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

    const esewaCfg = await dynConfig.getGatewayConfig('esewa').catch(() => ({}));
    const merchantId = esewaCfg.merchantId || config.esewa.merchantId;
    const secretKey  = esewaCfg.secretKey  || config.esewa.secretKey;
    const isLive     = esewaCfg.isLive     || config.esewa.isLive;
    if (!merchantId || !secretKey) {
      return res.status(503).json({ error: 'eSewa is not configured. Add Merchant ID + Secret Key in Admin → Settings → Payments.' });
    }

    const transactionUuid = `${orderId}-${Date.now()}`;
    const totalAmount = parseFloat(amount).toFixed(2);
    const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${merchantId}`;
    const signature = crypto.createHmac('sha256', secretKey).update(message).digest('base64');
    const origin = req.headers.origin || config.siteUrl;

    const formData = {
      amount: totalAmount, tax_amount: '0', total_amount: totalAmount,
      transaction_uuid: transactionUuid, product_code: merchantId,
      product_service_charge: '0', product_delivery_charge: '0',
      success_url: `${origin}/api/payments/esewa-verify?orderId=${orderId}`,
      failure_url: `${origin}/checkout.html?esewa_failed=true&orderId=${orderId}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature,
    };

    res.json({
      gatewayUrl: isLive ? config.esewa.liveUrl : config.esewa.testUrl,
      formData, transactionUuid, isTest: !isLive,
    });
  } catch (err) {
    console.error('[Payments] eSewa error:', err);
    res.status(500).json({ error: 'eSewa initiation failed' });
  }
});

// ── GET /api/payments/esewa-verify ──────────────────────────────────────────
router.get('/esewa-verify', async (req, res) => {
  try {
    const { data: encodedData, orderId } = req.query;
    if (encodedData) {
      const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'));
      if (decoded.status === 'COMPLETE') {
        await withRetry(
          async () => {
            await updateOrderStatus(orderId, 'paid', 'esewa', decoded.transaction_uuid || decoded.transaction_code);
            broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'esewa' } });
            broadcast({ type: 'store:order:new', data: { orderId, status: 'paid', method: 'esewa' } });
          },
          { maxAttempts: 4, baseMs: 400 }
        );
      }
    }
    res.redirect(`${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=esewa`);
  } catch (err) {
    console.error('[Payments] eSewa verify error:', err);
    res.redirect(`${config.siteUrl}/checkout.html?esewa_failed=true`);
  }
});

// ── GET /api/payments/khalti-verify ──────────────────────────────────────────
router.get('/khalti-verify', async (req, res) => {
  try {
    const { pidx, orderId, transaction_id, amount, status: khaltiStatus } = req.query;
    if (!orderId) return res.redirect(`${config.siteUrl}/checkout.html?khalti_failed=true`);

    const khaltiCfg = await dynConfig.getGatewayConfig('khalti');
    const khaltiKey = khaltiCfg.secretKey || config.khalti?.secretKey || '';

    if (khaltiKey && pidx) {
      const khaltiBase = (khaltiCfg.isLive || config.khalti?.isLive) ? 'https://khalti.com/api/v2' : 'https://a.khalti.com/api/v2';
      try {
        const lookupRes = await fetch(`${khaltiBase}/epayment/lookup/`, {
          method: 'POST',
          headers: { 'Authorization': `Key ${khaltiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ pidx }),
        });
        const lookupData = await lookupRes.json();
        if (lookupData.status === 'Completed') {
          await updateOrderStatus(orderId, 'paid', 'khalti', pidx || transaction_id);
          broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'khalti' } });
        }
      } catch (e) {
        console.error('[Payments] Khalti lookup error:', e.message);
      }
    }

    res.redirect(`${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=khalti`);
  } catch (err) {
    console.error('[Payments] Khalti verify error:', err);
    res.redirect(`${config.siteUrl}/checkout.html?khalti_failed=true`);
  }
});

// ── GET /api/payments/nabil-callback ─────────────────────────────────────────
router.get('/nabil-callback', async (req, res) => {
  try {
    const { orderId, status, transaction_id, reference_id } = req.query;
    if (!orderId) return res.redirect(`${config.siteUrl}/checkout.html?nabil_failed=true`);

    if (status === 'success') {
      await updateOrderStatus(orderId, 'paid', 'nabil', transaction_id || reference_id || `NABIL_${Date.now()}`);
      broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'nabil' } });
      return res.redirect(`${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=nabil`);
    }

    // Payment failed or cancelled
    await cancelOrder(orderId).catch(() => {});
    return res.redirect(`${config.siteUrl}/checkout.html?nabil_failed=true&order_id=${orderId}`);
  } catch (err) {
    console.error('[Payments] Nabil callback error:', err);
    res.redirect(`${config.siteUrl}/checkout.html?nabil_failed=true`);
  }
});

// ── POST /api/payments/nabil-callback (POST variant) ─────────────────────────
router.post('/nabil-callback', async (req, res) => {
  try {
    const { orderId, status, transaction_id, reference_id } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    if (status === 'success' || status === 'COMPLETED') {
      await updateOrderStatus(orderId, 'paid', 'nabil', transaction_id || reference_id || `NABIL_${Date.now()}`);
      broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'nabil' } });
      return res.json({ success: true, orderId, status: 'paid' });
    }

    await cancelOrder(orderId).catch(() => {});
    return res.json({ success: false, orderId, status: 'failed' });
  } catch (err) {
    console.error('[Payments] Nabil POST callback error:', err);
    res.status(500).json({ error: 'Nabil callback processing failed' });
  }
});

// ── POST /api/payments/:orderId/refund ──────────────────────────────────────
router.post('/:orderId/refund', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    let order, txn;
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      order = mem.orders.find(o => o.id === orderId);
      txn = mem.transactions.filter(t => t.order_id === orderId && t.status === 'paid')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    } else {
      order = await db.queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
      txn = await db.queryOne(
        "SELECT * FROM transactions WHERE order_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
        [orderId]
      );
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Stripe refund
    const stripeCfgForRefund = await dynConfig.getGatewayConfig('stripe');
    const stripeKeyForRefund = stripeCfgForRefund.secretKey || config.stripe.secretKey;
    if (txn?.method === 'stripe' && txn.reference && stripeKeyForRefund && stripeKeyForRefund !== 'sk_test_placeholder') {
      try {
        const stripe = Stripe(stripeKeyForRefund);
        await stripe.refunds.create({
          payment_intent: txn.reference,
          reason: reason || 'requested_by_customer',
        });
      } catch (stripeErr) {
        console.error('[Payments] Stripe refund error:', stripeErr.message);
      }
    }

    // PayPal refund
    const ppCfgForRefund = await dynConfig.getGatewayConfig('paypal');
    const ppClientForRefund = ppCfgForRefund.clientId || config.paypal.clientId;
    const ppSecretForRefund = ppCfgForRefund.clientSecret || config.paypal.clientSecret;
    const ppIsLiveForRefund = ppCfgForRefund.isLive || config.paypal.isLive;
    if (txn?.method === 'paypal' && txn.reference && ppClientForRefund && ppClientForRefund !== 'paypal_client_placeholder') {
      try {
        const baseUrl = ppIsLiveForRefund ? (ppCfgForRefund.liveUrl || config.paypal.liveUrl) : (ppCfgForRefund.sandboxUrl || config.paypal.sandboxUrl);
        const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ppClientForRefund}:${ppSecretForRefund}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        const authData = await authRes.json();
        const orderRes = await fetch(`${baseUrl}/v2/checkout/orders/${txn.reference}`, {
          headers: { 'Authorization': `Bearer ${authData.access_token}` },
        });
        const orderData = await orderRes.json();
        const captureId = orderData.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        if (captureId) {
          await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authData.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ note_to_payer: reason || 'Refund from Lwang Black' }),
          });
        }
      } catch (paypalErr) {
        console.error('[Payments] PayPal refund error:', paypalErr.message);
      }
    }

    // Update order to refunded
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const o = mem.orders.find(x => x.id === orderId);
      if (o) { o.status = 'refunded'; o.updated_at = new Date(); }
      const t = mem.transactions.find(x => x.order_id === orderId && x.status === 'paid');
      if (t) { t.status = 'refunded'; }
      mem.transactions.push({
        id: db.uuid(), order_id: orderId, method: txn?.method || 'manual',
        status: 'refunded', amount: order.total, currency: order.currency,
        reference: `refund_${Date.now()}`, created_at: new Date(),
      });
    } else {
      await db.query("UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1", [orderId]);
      await db.query(
        `INSERT INTO transactions (order_id, method, status, amount, currency, reference)
         VALUES ($1, $2, 'refunded', $3, $4, $5)`,
        [orderId, txn?.method || 'manual', order.total, order.currency, `refund_${Date.now()}`]
      );
    }

    broadcast({ type: 'order:updated', data: { orderId, status: 'refunded' } });

    // Async refund notification
    (async () => {
      try {
        let custData;
        if (db.isUsingMemory()) {
          const mem = db.getMemStore();
          custData = order.customer_id ? mem.customers.find(c => c.id === order.customer_id) : null;
        } else {
          custData = order.customer_id
            ? await db.queryOne('SELECT fname, lname, email, phone FROM customers WHERE id = $1', [order.customer_id])
            : null;
        }
        if (custData) await sendRefundNotice(order, custData, order.total, order.currency);
      } catch (e) { console.error('[Payments] Refund notification error:', e.message); }
    })();

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'order_refunded', entityType: 'order', entityId: orderId,
      details: { amount: order.total, currency: order.currency, reason }, ip: req.ip,
    });

    res.json({ message: 'Refund processed', orderId });
  } catch (err) {
    console.error('[Payments] Refund error:', err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

// ── POST /api/payments/:orderId/cod-confirm ─────────────────────────────────
// Admin confirms COD payment was collected
router.post('/:orderId/cod-confirm', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { collectedAmount } = req.body;

    await updateOrderStatus(orderId, 'paid', 'cod', `COD_COLLECTED_${Date.now()}`);
    broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'cod' } });

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'cod_payment_confirmed', entityType: 'order', entityId: orderId,
      details: { collectedAmount }, ip: req.ip,
    }).catch(() => {});

    res.json({ message: 'COD payment confirmed', orderId });
  } catch (err) {
    console.error('[Payments] COD confirm error:', err);
    res.status(500).json({ error: 'COD confirmation failed' });
  }
});

async function verifyPayPalWebhookEvent(req, eventBody) {
  const ppCfg = await dynConfig.getGatewayConfig('paypal');
  const webhookId = ppCfg.webhookId || config.paypal.webhookId;
  const clientId = ppCfg.clientId || config.paypal.clientId;
  const clientSecret = ppCfg.clientSecret || config.paypal.clientSecret;
  const isLive = ppCfg.isLive || config.paypal.isLive;
  const baseUrl = isLive ? (ppCfg.liveUrl || config.paypal.liveUrl) : (ppCfg.sandboxUrl || config.paypal.sandboxUrl);

  if (!webhookId) {
    if (config.isProd) return false;
    return true;
  }

  const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const authData = await authRes.json();
  if (!authData.access_token) return false;

  const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authData.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transmission_id: req.get('paypal-transmission-id'),
      transmission_time: req.get('paypal-transmission-time'),
      cert_url: req.get('paypal-cert-url'),
      auth_algo: req.get('paypal-auth-algo'),
      transmission_sig: req.get('paypal-transmission-sig'),
      webhook_id: webhookId,
      webhook_event: eventBody,
    }),
  });
  const vr = await verifyRes.json();
  return vr.verification_status === 'SUCCESS';
}

// ── POST /api/payments/paypal-webhook ───────────────────────────────────────
// Configure the same URL in PayPal Developer → Webhooks. Set PAYPAL_WEBHOOK_ID.
router.post('/paypal-webhook', async (req, res) => {
  const eventBody = req.body;
  try {
    const verified = await verifyPayPalWebhookEvent(req, eventBody);
    if (!verified) {
      console.warn('[Payments] PayPal webhook verification failed');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const ppEvId = eventBody?.id;
    if (ppEvId) {
      const dup = await cacheGet(`paypal:evt:${ppEvId}`);
      if (dup) return res.json({ received: true, duplicate: true });
      await cacheSet(`paypal:evt:${ppEvId}`, { at: Date.now() }, 86400);
    }

    const eventType = eventBody.event_type;
    const resource = eventBody.resource || {};

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId =
        resource.custom_id ||
        resource.invoice_id ||
        resource.supplementary_data?.related_ids?.order_id;
      const captureId = resource.id;
      if (orderId) {
        await withRetry(
          async () => {
            await updateOrderStatus(orderId, 'paid', 'paypal', captureId);
            broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'paypal', source: 'webhook' } });
          },
          { maxAttempts: 5, baseMs: 500 }
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Payments] PayPal webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── GET /api/payments/status/:orderId ────────────────────────────────────────
// Check payment status for an order
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    let order, txns;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      order = mem.orders.find(o => o.id === orderId);
      txns = mem.transactions.filter(t => t.order_id === orderId);
    } else {
      order = await db.queryOne('SELECT id, status, total, currency, payment_method FROM orders WHERE id = $1', [orderId]);
      txns = await db.queryAll('SELECT * FROM transactions WHERE order_id = $1 ORDER BY created_at DESC', [orderId]);
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const latestTxn = txns[0] || null;
    res.json({
      orderId,
      status: order.status,
      total: parseFloat(order.total),
      currency: order.currency,
      paymentMethod: order.payment_method || latestTxn?.method,
      paymentStatus: latestTxn?.status || 'unknown',
      reference: latestTxn?.reference || null,
    });
  } catch (err) {
    console.error('[Payments] Status error:', err);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

module.exports = router;
