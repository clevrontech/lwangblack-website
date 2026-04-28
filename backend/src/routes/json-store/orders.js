const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../../services/json-store-email');
const { file } = require('../../services/json-store-paths');
const { broadcastStoreEvent, broadcast } = require('../../ws');
const db = require('../../db/pool');

const router = express.Router();
const ORDERS_FILE = file('orders.json');

/**
 * Mirror a JSON-store order into the admin orders/customers tables so the
 * Orders.jsx admin page sees storefront orders. Idempotent on order id.
 * Failures are non-fatal — the JSON record is the source of truth, the
 * mirror is for admin visibility only.
 */
async function mirrorOrderToAdminStore(order) {
  if (!order || !order.id) return;
  try {
    const country = (order.region || order.shippingAddress?.country || 'AU').toUpperCase();
    const currency = order.currency || (country === 'NP' ? 'NPR' : country === 'AU' ? 'AUD' : 'AUD');
    const symbol = order.symbol || (country === 'NP' ? 'Rs' : 'A$');
    const items = (order.lineItems || []).map(i => ({
      productId: i.productId || i.id || i.handle,
      name: i.name,
      qty: Number(i.qty) || 1,
      price: Number(i.price) || 0,
    }));
    const subtotal = order.subtotal != null ? Number(order.subtotal)
      : items.reduce((s, i) => s + i.qty * i.price, 0);
    const shipping = Number(order.shippingCost || 0);
    const total = Number(order.totalAmount || order.total || subtotal + shipping);
    const status = order.financialStatus === 'paid' ? 'paid' : 'pending';
    const carrier = order.carrier || (country === 'NP' ? 'Pathao'
      : country === 'AU' ? 'Australia Post' : country === 'US' ? 'USPS'
      : country === 'NZ' ? 'NZ Post' : country === 'JP' ? 'Japan Post'
      : country === 'CA' ? 'Chit Chats' : 'Australia Post');

    const customerEmail = order.customer?.email;
    const customerFname = order.customer?.firstName || order.customer?.name || '';
    const customerLname = order.customer?.lastName || '';
    const customerPhone = order.customer?.phone || order.shippingAddress?.phone || '';
    const addressStr = [
      order.shippingAddress?.street, order.shippingAddress?.line1,
      order.shippingAddress?.city, order.shippingAddress?.postal,
      order.shippingAddress?.country,
    ].filter(Boolean).join(', ');

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let customerId = null;
      if (customerEmail) {
        let existing = mem.customers.find(c => c.email === customerEmail);
        if (existing) {
          customerId = existing.id;
          existing.fname = customerFname || existing.fname;
          existing.lname = customerLname || existing.lname;
          existing.phone = customerPhone || existing.phone;
          existing.country = country;
        } else {
          customerId = db.uuid();
          mem.customers.push({
            id: customerId, fname: customerFname, lname: customerLname,
            email: customerEmail, phone: customerPhone, address: addressStr,
            country, created_at: new Date(), updated_at: new Date(),
          });
        }
      }
      const existingOrder = mem.orders.find(o => o.id === order.id);
      if (!existingOrder) {
        mem.orders.push({
          id: order.id, customer_id: customerId, status,
          country, currency, symbol, items, subtotal, shipping, total,
          carrier, tracking: order.trackingNumber || '', notes: order.notes || '',
          payment_method: order.paymentMethod || 'pending',
          discount_code: order.discountCode || null,
          discount_amount: 0,
          source: 'storefront',
          order_number: order.orderNumber,
          created_at: new Date(order.createdAt || Date.now()),
          updated_at: new Date(order.updatedAt || Date.now()),
        });
        mem.transactions.push({
          id: db.uuid(), order_id: order.id,
          method: order.paymentMethod || 'pending',
          status, amount: total, currency,
          reference: order.stripePaymentIntentId || null,
          created_at: new Date(),
        });
      }
      return;
    }

    // Postgres path
    let customerId = null;
    if (customerEmail) {
      const existing = await db.queryOne('SELECT id FROM customers WHERE email = $1', [customerEmail]);
      if (existing) {
        customerId = existing.id;
        await db.query(
          'UPDATE customers SET fname=COALESCE($1,fname), lname=COALESCE($2,lname), phone=COALESCE($3,phone), country=$4, updated_at=NOW() WHERE id=$5',
          [customerFname || null, customerLname || null, customerPhone || null, country, customerId]
        );
      } else {
        const newCust = await db.queryOne(
          'INSERT INTO customers (fname, lname, email, phone, address, country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [customerFname, customerLname, customerEmail, customerPhone, addressStr, country]
        );
        customerId = newCust?.id;
      }
    }

    // Idempotent insert keyed on the JSON-store order id.
    await db.query(
      `INSERT INTO orders (id, customer_id, status, country, currency, symbol, items, subtotal, shipping, total, carrier, payment_method, discount_code, discount_amount, tracking)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total = EXCLUDED.total, updated_at = NOW()`,
      [order.id, customerId, status, country, currency, symbol,
       JSON.stringify(items), subtotal, shipping, total, carrier,
       order.paymentMethod || 'pending', order.discountCode || null, 0, order.trackingNumber || '']
    ).catch((e) => console.warn('[json-store/orders] mirror insert failed:', e.message));

    await db.query(
      `INSERT INTO transactions (order_id, method, status, amount, currency, reference)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [order.id, order.paymentMethod || 'pending', status, total, currency, order.stripePaymentIntentId || null]
    ).catch(() => {});
  } catch (err) {
    console.warn('[json-store/orders] Mirror failed:', err.message);
  }
}

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

    // Mirror to admin SQL/memory store so the admin Orders page sees it.
    mirrorOrderToAdminStore(order).catch((e) =>
      console.warn('[json-store/orders] post-create mirror failed:', e.message)
    );

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

    // Also fire the canonical admin-channel event so Orders.jsx's WS listener wakes up.
    try {
      broadcast({
        type: 'order:new',
        data: { orderId: order.id, country: (order.region || 'AU').toUpperCase(),
                total: order.totalAmount, status: order.financialStatus },
      });
    } catch {}

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
module.exports.helpers = { getOrders, saveOrders, updateOrder, findOrder, mirrorOrderToAdminStore };
