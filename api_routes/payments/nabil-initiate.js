// ── api/payments/nabil-initiate.js ──────────────────────────────────────────
// POST /api/payments/nabil-initiate
//
// Initiates a Nabil Bank payment gateway session.
// Returns either:
//   { gatewayUrl: "https://..." }         → browser redirects to hosted page
//   { formAction: "...", formData: {...} } → browser POSTs a form (eSewa-style)
//
// ─── HOW TO ACTIVATE ────────────────────────────────────────────────────────
// When you receive your Nabil Bank Payment Gateway API, add these to your
// Vercel / .env environment variables:
//
//   NABIL_GATEWAY_URL      = https://gateway.nabilbank.com/api/v1/payment (example)
//   NABIL_MERCHANT_ID      = your merchant ID from Nabil Bank
//   NABIL_API_KEY          = your API key / secret from Nabil Bank
//   NABIL_ACCOUNT_NUMBER   = 15301017500402
//
// Then fill in the `initiatePayment()` function below with the exact
// request body format Nabil Bank specifies in their API docs.
// ────────────────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    orderId,
    amount,
    currency      = 'NPR',
    customerName,
    customerEmail,
    customerPhone,
    address,
    items,
    shipping,
    returnUrl,
    cancelUrl,
  } = req.body;

  // ── Validate required fields ─────────────────────────────────────────────
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Missing required fields: orderId, amount' });
  }

  // ── Read gateway credentials from environment ────────────────────────────
  const GATEWAY_URL    = process.env.NABIL_GATEWAY_URL;
  const MERCHANT_ID    = process.env.NABIL_MERCHANT_ID;
  const API_KEY        = process.env.NABIL_API_KEY;
  const ACCOUNT_NUMBER = process.env.NABIL_ACCOUNT_NUMBER || '15301017500402';

  // ── Check if credentials are configured ─────────────────────────────────
  if (!GATEWAY_URL || !MERCHANT_ID || !API_KEY) {
    // ─────────────────────────────────────────────────────────────────────
    // PLACEHOLDER MODE — credentials not yet added.
    // Return a clear error so the frontend shows a helpful message.
    // Replace this block with real integration once you have the API.
    // ─────────────────────────────────────────────────────────────────────
    console.log(`[Nabil Gateway] PLACEHOLDER — credentials not set.`);
    console.log(`  Order ID : ${orderId}`);
    console.log(`  Amount   : NPR ${amount}`);
    console.log(`  Customer : ${customerName} <${customerEmail}>`);
    console.log(`  To activate: set NABIL_GATEWAY_URL, NABIL_MERCHANT_ID, NABIL_API_KEY in .env`);

    return res.status(200).json({
      error: 'Nabil Bank gateway credentials not configured yet. Add NABIL_GATEWAY_URL, NABIL_MERCHANT_ID, NABIL_API_KEY to your environment variables.',
      placeholder: true,
    });
  }

  // ── Initiate payment with Nabil Bank gateway ─────────────────────────────
  try {
    const payload = await initiatePayment({
      GATEWAY_URL,
      MERCHANT_ID,
      API_KEY,
      ACCOUNT_NUMBER,
      orderId,
      amount,
      currency,
      customerName,
      customerEmail,
      customerPhone,
      address,
      items,
      shipping,
      returnUrl,
      cancelUrl,
    });

    return res.status(200).json(payload);

  } catch (err) {
    console.error('[Nabil Gateway] Error:', err.message);
    return res.status(500).json({ error: 'Gateway initiation failed: ' + err.message });
  }
};


// ═══════════════════════════════════════════════════════════════════════════
// GATEWAY INTEGRATION FUNCTION
// ─────────────────────────────────────────────────────────────────────────
// Fill this in when you receive your Nabil Bank API documentation.
// The function must return ONE of:
//   { gatewayUrl: "https://..." }             ← redirect (most common)
//   { formAction: "url", formData: {...} }    ← POST form redirect
// ═══════════════════════════════════════════════════════════════════════════
async function initiatePayment(opts) {
  const {
    GATEWAY_URL, MERCHANT_ID, API_KEY, ACCOUNT_NUMBER,
    orderId, amount, currency, customerName, customerEmail,
    customerPhone, returnUrl, cancelUrl,
  } = opts;

  // ── EXAMPLE: REST redirect style (most modern gateways) ─────────────────
  // const response = await fetch(GATEWAY_URL, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${API_KEY}`,
  //     'X-Merchant-ID': MERCHANT_ID,
  //   },
  //   body: JSON.stringify({
  //     merchant_id:    MERCHANT_ID,
  //     account_number: ACCOUNT_NUMBER,
  //     transaction_id: orderId,
  //     amount:         Number(amount).toFixed(2),
  //     currency:       currency,
  //     customer_name:  customerName,
  //     customer_email: customerEmail,
  //     customer_phone: customerPhone,
  //     success_url:    returnUrl,
  //     failure_url:    cancelUrl,
  //   }),
  // });
  // const data = await response.json();
  // return { gatewayUrl: data.payment_url };

  // ── EXAMPLE: POST form style (like eSewa) ────────────────────────────────
  // return {
  //   formAction: GATEWAY_URL,
  //   formData: {
  //     amt:          Number(amount).toFixed(2),
  //     txAmt:        '0',
  //     psc:          '0',
  //     pdc:          '0',
  //     tAmt:         Number(amount).toFixed(2),
  //     pid:          orderId,
  //     scd:          MERCHANT_ID,
  //     su:           returnUrl,
  //     fu:           cancelUrl,
  //   },
  // };

  // ── TODO: Replace the above with Nabil Bank's actual API format ──────────
  throw new Error('Gateway integration not implemented yet. Add API credentials and fill in the initiatePayment() function in /api/payments/nabil-initiate.js');
}
