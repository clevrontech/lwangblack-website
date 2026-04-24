const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../../services/json-store-email');
const { file } = require('../../services/json-store-paths');
const { broadcastStoreEvent } = require('../../ws');

const router = express.Router();
const ORDERS_FILE = file('orders.json');

function getOrders() {
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

/** Patch a JSON-store order by orderNumber or id. Returns the updated order or null if not found. */
function updateOrder(orderKey, patch) {
  if (!orderKey) return null;
  const orders = getOrders();
  const idx = orders.findIndex(o => o.orderNumber === orderKey || o.id === orderKey);
  if (idx < 0) return null;
  orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
  saveOrders(orders);
  return orders[idx];
}

function findOrder(orderKey) {
  if (!orderKey) return null;
  return getOrders().find(o => o.orderNumber === orderKey || o.id === orderKey) || null;
}

function generateOrderNumber() {
  const orders = getOrders();
  const year = new Date().getFullYear();
  const next = 1001 + orders.length;
  return `LWB-${year}-${next}`;
}

function sumLineItems(lineItems) {
  return (lineItems || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0);
}

router.post('/', async (req, res) => {
  try {
    const {
      customer,
      shippingAddress,
      lineItems,
      paymentMethod,
      region,
      total,
      totalAmount,
      totalDisplay,
      discountCode,
      tip,
      stripePaymentIntentId,
      // ── Shipping/logistics fields (NEW) ─────────────────────────────────
      shippingCost,
      shippingMethod,
      shippingLabel,
      serviceCode,
      carrier,
      carrierId,
      subtotal,
    } = req.body;

    if (!customer?.email || !lineItems?.length || !shippingAddress) {
      return res.status(400).json({ success: false, error: 'Missing required order fields' });
    }

    const computed = sumLineItems(lineItems);
    const amount = totalAmount != null ? Number(totalAmount) : computed;

    const order = {
      id: uuidv4(),
      orderNumber: generateOrderNumber(),
      customer,
      shippingAddress,
      lineItems,
      paymentMethod: paymentMethod || 'cod',
      region: region || 'NP',
      total: total != null ? total : String(amount),
      totalAmount: amount,
      totalDisplay: totalDisplay != null ? totalDisplay : total,
      discountCode: discountCode || null,
      tip: tip || 0,
      stripePaymentIntentId: stripePaymentIntentId || null,
      // ── Logistics fields ─────────────────────────────────────────────────
      subtotal: subtotal != null ? Number(subtotal) : null,
      shippingCost: shippingCost != null ? Number(shippingCost) : null,
      shippingMethod: shippingMethod || null,
      shippingLabel: shippingLabel || null,
      serviceCode: serviceCode || null,
      carrier: carrier || null,
      carrierId: carrierId || null,
      // ─────────────────────────────────────────────────────────────────────
      financialStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      fulfillmentStatus: 'unfulfilled',
      trackingNumber: null,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const orders = getOrders();
    orders.push(order);
    saveOrders(orders);

    emailService.sendOrderConfirmation(order).catch(console.error);

    broadcastStoreEvent({
      type: 'store:order:new',
      data: {
        orderNumber: order.orderNumber,
        orderId: order.id,
        region: order.region,
        totalAmount: order.totalAmount,
        financialStatus: order.financialStatus,
      },
    });

    res.json({ success: true, orderNumber: order.orderNumber, orderId: order.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:orderNumber', (req, res) => {
  try {
    const orders = getOrders();
    const order = orders.find((o) => o.orderNumber === req.params.orderNumber || o.id === req.params.orderNumber);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.helpers = { getOrders, saveOrders, updateOrder, findOrder };
