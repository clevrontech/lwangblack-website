// ── Payments Routes ─────────────────────────────────────────────────────────
const express = require('express');
const crypto = require('crypto');
const Stripe = require('stripe');
const db = require('../db/pool');
const config = require('../config');
const { requireAuth, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');

const router = express.Router();

const CURRENCY_MAP = {
  AU: 'aud', US: 'usd', GB: 'gbp', CA: 'cad', NZ: 'nzd', JP: 'jpy', NP: 'npr',
};

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
async function updateOrderStatus(orderId, status, method, reference) {
  if (db.isUsingMemory()) {
    const mem = db.getMemStore();
    const order = mem.orders.find(o => o.id === orderId);
    if (order) { order.status = status; order.updated_at = new Date(); }
    const txn = mem.transactions.find(t => t.order_id === orderId && t.status === 'pending');
    if (txn) {
      txn.status = status === 'paid' ? 'paid' : 'pending';
      if (method) txn.method = method;
      if (reference) txn.reference = reference;
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
  }
}

// ── GET /api/payments/methods?country=XX ─────────────────────────────────────
router.get('/methods', (req, res) => {
  const country = (req.query.country || 'US').toUpperCase();

  const METHOD_META = {
    nabil:      { id: 'nabil',      label: 'Nabil Bank',              icon: '🏦', description: "Pay directly via Nabil Bank" },
    cod:        { id: 'cod',        label: 'Cash on Delivery',        icon: '💵', description: 'Pay Rs when your order arrives' },
    paypal:     { id: 'paypal',     label: 'PayPal',                  icon: '🅿️', description: 'Pay securely with your PayPal account' },
    stripe:     { id: 'stripe',     label: 'Credit / Debit Card',     icon: '💳', description: 'Visa, Mastercard, AMEX — encrypted by Stripe' },
    apple_pay:  { id: 'apple_pay',  label: 'Apple Pay',               icon: '🍎', description: 'Fast checkout with Apple Pay' },
    google_pay: { id: 'google_pay', label: 'Google Pay',              icon: '🔵', description: 'Quick checkout with Google Pay' },
    afterpay:   { id: 'afterpay',   label: 'Afterpay',                icon: '🟩', description: 'Buy now, pay in 4 interest-free installments' },
    card:       { id: 'card',       label: 'Mastercard / Debit Card', icon: '💳', description: 'Mastercard, Visa Debit — secured checkout' },
  };

  const allowed = config.paymentMethods?.[country] || config.paymentMethods?.US || ['paypal', 'stripe', 'card'];
  const methods = allowed.map(id => METHOD_META[id]).filter(Boolean);

  res.json({ country, methods });
});

// ── POST /api/payments/stripe-session ────────────────────────────────────────
router.post('/stripe-session', async (req, res) => {
  try {
    if (!config.stripe.secretKey || config.stripe.secretKey === 'sk_test_placeholder') {
      return res.json({
        demo: true,
        sessionId: 'cs_demo_' + Date.now(),
        url: `/order-confirmation.html?order_id=${req.body?.orderId || 'DEMO'}&method=stripe&demo=true`,
        message: 'Stripe keys not configured. Running in demo mode.',
      });
    }

    const stripe = Stripe(config.stripe.secretKey);
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
          product_data: { name: 'International Shipping (DHL)' },
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
    const stripe = Stripe(config.stripe.secretKey || 'sk_test_placeholder');
    const sig = req.headers['stripe-signature'];
    let event;

    if (config.stripe.webhookSecret && config.stripe.webhookSecret !== 'whsec_placeholder') {
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
    } else {
      // Dev mode: parse raw body
      try { event = JSON.parse(req.body.toString()); }
      catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      const paymentType = session.metadata?.paymentType || 'stripe';
      if (orderId && orderId !== 'unknown') {
        await updateOrderStatus(orderId, 'paid', paymentType, session.payment_intent);
        broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: paymentType } });
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        broadcast({ type: 'order:payment_failed', data: { orderId } });
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

    if (!config.paypal.clientId || config.paypal.clientId === 'paypal_client_placeholder') {
      return res.json({
        demo: true,
        approvalUrl: `/order-confirmation.html?order_id=${orderId}&method=paypal&demo=true`,
        paypalOrderId: 'PP_DEMO_' + Date.now(),
        message: 'PayPal keys not configured. Running in demo mode.',
      });
    }

    const baseUrl = config.paypal.isLive ? config.paypal.liveUrl : config.paypal.sandboxUrl;
    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64'),
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

    if (!config.paypal.clientId || config.paypal.clientId === 'paypal_client_placeholder') {
      return res.redirect(`${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=paypal&demo=true`);
    }

    const baseUrl = config.paypal.isLive ? config.paypal.liveUrl : config.paypal.sandboxUrl;
    const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const authData = await authRes.json();

    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`,
        'Content-Type': 'application/json',
      },
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

// ── POST /api/payments/nabil-initiate ────────────────────────────────────────
// Nabil Bank payment — Nepal region
router.post('/nabil-initiate', async (req, res) => {
  try {
    const { orderId, amount, customerName, customerPhone } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

    const merchantId = config.nabil?.merchantId || 'NB_MERCHANT_PLACEHOLDER';
    const secretKey  = config.nabil?.secretKey  || '';
    const isLive     = config.nabil?.isLive     || false;

    const transactionUuid = `${orderId}-${Date.now()}`;
    const totalAmount = parseFloat(amount).toFixed(2);
    const origin = req.headers.origin || config.siteUrl;

    // Generate HMAC-SHA256 signature
    const message = `merchant_id=${merchantId},transaction_uuid=${transactionUuid},amount=${totalAmount}`;
    const signature = secretKey
      ? crypto.createHmac('sha256', secretKey).update(message).digest('base64')
      : 'DEMO_SIGNATURE';

    const gatewayUrl = isLive
      ? 'https://payment.nabilbank.com/checkout'
      : 'https://payment-sandbox.nabilbank.com/checkout';

    const formData = {
      merchant_id: merchantId,
      transaction_uuid: transactionUuid,
      amount: totalAmount,
      currency: 'NPR',
      product_name: 'Lwang Black Coffee',
      customer_name: customerName || '',
      customer_phone: customerPhone || '',
      success_url: `${origin}/api/payments/nabil-callback?orderId=${orderId}&status=success`,
      failure_url: `${origin}/checkout.html?nabil_failed=true&orderId=${orderId}`,
      signature,
      signed_field_names: 'merchant_id,transaction_uuid,amount',
    };

    // Demo mode if no real credentials
    if (merchantId === 'NB_MERCHANT_PLACEHOLDER') {
      return res.json({
        demo: true,
        orderId,
        gatewayUrl: `${origin}/order-confirmation.html?order_id=${orderId}&method=nabil&demo=true`,
        message: 'Nabil Bank credentials not configured. Running in demo mode.',
      });
    }

    res.json({
      gatewayUrl,
      formData,
      transactionUuid,
      isTest: !isLive,
    });
  } catch (err) {
    console.error('[Payments] Nabil initiate error:', err);
    res.status(500).json({ error: 'Nabil Bank payment initiation failed' });
  }
});

// ── GET /api/payments/nabil-callback ─────────────────────────────────────────
// Called by Nabil Bank after payment
router.get('/nabil-callback', async (req, res) => {
  try {
    const { orderId, status, transaction_uuid, amount } = req.query;

    if (status === 'success' && orderId) {
      await updateOrderStatus(orderId, 'paid', 'nabil', transaction_uuid || `NB-${Date.now()}`);
      broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'nabil' } });
    }

    const redirectUrl = `${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=nabil${status !== 'success' ? '&failed=true' : ''}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('[Payments] Nabil callback error:', err);
    res.redirect(`${config.siteUrl}/checkout.html?nabil_failed=true`);
  }
});

// ── POST /api/payments/esewa-initiate ────────────────────────────────────────
// Keep eSewa for legacy / fallback
router.post('/esewa-initiate', async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: 'orderId and amount required' });

    const transactionUuid = `${orderId}-${Date.now()}`;
    const totalAmount = parseFloat(amount).toFixed(2);
    const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${config.esewa.merchantId}`;
    const signature = crypto.createHmac('sha256', config.esewa.secretKey).update(message).digest('base64');
    const origin = req.headers.origin || config.siteUrl;

    const formData = {
      amount: totalAmount, tax_amount: '0', total_amount: totalAmount,
      transaction_uuid: transactionUuid, product_code: config.esewa.merchantId,
      product_service_charge: '0', product_delivery_charge: '0',
      success_url: `${origin}/api/payments/esewa-verify?orderId=${orderId}`,
      failure_url: `${origin}/checkout.html?esewa_failed=true&orderId=${orderId}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature,
    };

    res.json({
      gatewayUrl: config.esewa.isLive ? config.esewa.liveUrl : config.esewa.testUrl,
      formData, transactionUuid, isTest: !config.esewa.isLive,
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
        await updateOrderStatus(orderId, 'paid', 'esewa', decoded.transaction_uuid || decoded.transaction_code);
        broadcast({ type: 'order:updated', data: { orderId, status: 'paid', method: 'esewa' } });
      }
    }
    res.redirect(`${config.siteUrl}/order-confirmation.html?order_id=${orderId}&method=esewa`);
  } catch (err) {
    console.error('[Payments] eSewa verify error:', err);
    res.redirect(`${config.siteUrl}/checkout.html?esewa_failed=true`);
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
    if (txn?.method === 'stripe' && txn.reference && config.stripe.secretKey !== 'sk_test_placeholder') {
      try {
        const stripe = Stripe(config.stripe.secretKey);
        await stripe.refunds.create({
          payment_intent: txn.reference,
          reason: reason || 'requested_by_customer',
        });
      } catch (stripeErr) {
        console.error('[Payments] Stripe refund error:', stripeErr.message);
      }
    }

    // PayPal refund
    if (txn?.method === 'paypal' && txn.reference && config.paypal.clientId !== 'paypal_client_placeholder') {
      try {
        const baseUrl = config.paypal.isLive ? config.paypal.liveUrl : config.paypal.sandboxUrl;
        const authRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64'),
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
