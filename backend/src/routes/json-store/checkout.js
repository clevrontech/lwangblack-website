const express = require('express');
const stripeService = require('../../services/json-store-stripe');
const esewaService = require('../../services/json-store-esewa');
const khaltiService = require('../../services/json-store-khalti');

const router = express.Router();

router.post('/stripe-intent', async (req, res) => {
  try {
    const { amount, currency, region, orderId } = req.body;
    const intent = await stripeService.createPaymentIntent(amount, currency, { orderId: orderId || '', region: region || '' });
    res.json({ success: true, clientSecret: intent.client_secret, intentId: intent.id });
  } catch (err) {
    const msg = err.message || 'Stripe payment intent failed';
    const status = /not configured/i.test(msg) ? 503 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.post('/esewa/initiate', (req, res) => {
  try {
    const { amount, orderId } = req.body;
    const params = esewaService.getPaymentParams(amount, orderId);
    res.json({ success: true, params, paymentUrl: esewaService.getPaymentUrl() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/esewa/verify', async (req, res) => {
  try {
    const token = req.body.token || req.body.data;
    const verified = await esewaService.verifyPayment(token);
    res.json({ success: verified });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/khalti/initiate', async (req, res) => {
  try {
    const { amount, orderId, customerInfo } = req.body;
    const result = await khaltiService.initiatePayment(amount, orderId, customerInfo);
    res.json({ success: true, payment_url: result.payment_url, pidx: result.pidx });
  } catch (err) {
    const msg = err.message || 'Khalti initiation failed';
    const status = /not configured/i.test(msg) ? 503 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.post('/khalti/verify', async (req, res) => {
  try {
    const { pidx } = req.body;
    const result = await khaltiService.verifyPayment(pidx);
    res.json({ success: result.status === 'Completed', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
