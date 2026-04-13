// ── Notification Service — SendGrid Email + Twilio SMS ───────────────────────
const config = require('../config');
const db = require('../db/pool');

// Lazy-loaded clients to avoid startup errors when keys are absent
let sgMail = null;
let twilioClient = null;

function getSendGrid() {
  if (sgMail) return sgMail;
  try {
    sgMail = require('@sendgrid/mail');
    if (config.email.apiKey) sgMail.setApiKey(config.email.apiKey);
    return sgMail;
  } catch {
    console.warn('[Notify] @sendgrid/mail not installed');
    return null;
  }
}

function getTwilio() {
  if (twilioClient) return twilioClient;
  try {
    const twilio = require('twilio');
    if (config.twilio.accountSid && config.twilio.authToken) {
      twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
      return twilioClient;
    }
  } catch {
    console.warn('[Notify] twilio not installed');
  }
  return null;
}

async function logNotification({ type, recipient, subject, template, status, provider, providerId, metadata }) {
  try {
    await db.query(
      `INSERT INTO notification_log (type, recipient, subject, template, status, provider, provider_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [type, recipient, subject || null, template || null, status, provider || null, providerId || null, JSON.stringify(metadata || {})]
    );
  } catch (err) {
    console.error('[Notify] Failed to log notification:', err.message);
  }
}

// ── Email Sending ────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text, template }) {
  const sg = getSendGrid();
  if (!sg || !config.email.apiKey) {
    console.log(`[Notify] Email (dry-run) → ${to}: ${subject}`);
    await logNotification({ type: 'email', recipient: to, subject, template, status: 'sent', provider: 'dry-run', metadata: { dryRun: true } });
    return { success: true, dryRun: true };
  }

  try {
    const [response] = await sg.send({
      to,
      from: { email: config.email.fromEmail, name: config.email.fromName },
      subject,
      html: html || `<p>${text || ''}</p>`,
      text: text || subject,
    });
    const msgId = response?.headers?.['x-message-id'] || null;
    await logNotification({ type: 'email', recipient: to, subject, template, status: 'sent', provider: 'sendgrid', providerId: msgId });
    return { success: true, messageId: msgId };
  } catch (err) {
    console.error('[Notify] SendGrid error:', err.message);
    await logNotification({ type: 'email', recipient: to, subject, template, status: 'failed', provider: 'sendgrid', metadata: { error: err.message } });
    return { success: false, error: err.message };
  }
}

// ── SMS Sending ─────────────────────────────────────────────────────────────

async function sendSMS({ to, body, template }) {
  const twilio = getTwilio();
  if (!twilio || !config.twilio.fromNumber) {
    console.log(`[Notify] SMS (dry-run) → ${to}: ${body}`);
    await logNotification({ type: 'sms', recipient: to, subject: body?.substring(0, 100), template, status: 'sent', provider: 'dry-run', metadata: { dryRun: true } });
    return { success: true, dryRun: true };
  }

  try {
    const message = await twilio.messages.create({
      body,
      from: config.twilio.fromNumber,
      to,
    });
    await logNotification({ type: 'sms', recipient: to, subject: body?.substring(0, 100), template, status: 'sent', provider: 'twilio', providerId: message.sid });
    return { success: true, sid: message.sid };
  } catch (err) {
    console.error('[Notify] Twilio error:', err.message);
    await logNotification({ type: 'sms', recipient: to, subject: body?.substring(0, 100), template, status: 'failed', provider: 'twilio', metadata: { error: err.message } });
    return { success: false, error: err.message };
  }
}

// ── Template-based Notifications ────────────────────────────────────────────

async function sendOrderConfirmation(order, customer) {
  if (!customer?.email) return;

  const itemsList = (order.items || []).map(i => `${i.name} x${i.qty} — ${order.symbol}${i.price}`).join('<br>');

  await sendEmail({
    to: customer.email,
    subject: `Order Confirmed — ${order.id}`,
    template: 'order_confirmation',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Thank you for your order!</h2>
        <p>Hi ${customer.fname || 'there'},</p>
        <p>Your order <strong>${order.id}</strong> has been confirmed.</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 8px;font-weight:600;">Order Summary</p>
          ${itemsList}
          <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;">
          <p style="margin:0;">Subtotal: ${order.symbol}${order.subtotal}</p>
          <p style="margin:0;">Shipping: ${order.symbol}${order.shipping}</p>
          <p style="margin:0;font-weight:600;font-size:1.1em;">Total: ${order.symbol}${order.total}</p>
        </div>
        <p>We'll send you tracking details once your order ships.</p>
        <p style="color:#888;font-size:0.9em;">— Lwang Black Coffee</p>
      </div>
    `,
  });

  if (customer.phone) {
    await sendSMS({
      to: customer.phone,
      body: `Lwang Black: Order ${order.id} confirmed! Total: ${order.symbol}${order.total}. We'll notify you when it ships.`,
      template: 'order_confirmation',
    });
  }
}

async function sendShippingUpdate(order, customer, trackingNumber, carrier) {
  if (!customer?.email) return;

  await sendEmail({
    to: customer.email,
    subject: `Your Order ${order.id} Has Shipped!`,
    template: 'shipping_update',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Your order is on its way!</h2>
        <p>Hi ${customer.fname || 'there'},</p>
        <p>Your order <strong>${order.id}</strong> has been shipped via <strong>${carrier || 'courier'}</strong>.</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0;font-weight:600;">Tracking Number: ${trackingNumber}</p>
        </div>
        <p>You can track your parcel at any time using the tracking number above.</p>
        <p style="color:#888;font-size:0.9em;">— Lwang Black Coffee</p>
      </div>
    `,
  });

  if (customer.phone) {
    await sendSMS({
      to: customer.phone,
      body: `Lwang Black: Order ${order.id} shipped via ${carrier || 'courier'}! Tracking: ${trackingNumber}`,
      template: 'shipping_update',
    });
  }
}

async function sendRefundNotice(order, customer, amount, currency) {
  if (!customer?.email) return;

  await sendEmail({
    to: customer.email,
    subject: `Refund Processed — Order ${order.id}`,
    template: 'refund_notice',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Refund Processed</h2>
        <p>Hi ${customer.fname || 'there'},</p>
        <p>A refund of <strong>${currency} ${amount}</strong> has been processed for order <strong>${order.id}</strong>.</p>
        <p>Please allow 5-10 business days for the refund to appear in your account.</p>
        <p>If you have any questions, please contact us at <a href="mailto:${config.email.fromEmail}">${config.email.fromEmail}</a>.</p>
        <p style="color:#888;font-size:0.9em;">— Lwang Black Coffee</p>
      </div>
    `,
  });

  if (customer.phone) {
    await sendSMS({
      to: customer.phone,
      body: `Lwang Black: Refund of ${currency} ${amount} processed for order ${order.id}. Allow 5-10 days for it to appear.`,
      template: 'refund_notice',
    });
  }
}

async function sendDeliveryConfirmation(order, customer) {
  if (!customer?.email) return;

  await sendEmail({
    to: customer.email,
    subject: `Order ${order.id} Delivered!`,
    template: 'delivery_confirmation',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Your order has been delivered!</h2>
        <p>Hi ${customer.fname || 'there'},</p>
        <p>Your order <strong>${order.id}</strong> has been delivered. We hope you enjoy your Lwang Black coffee!</p>
        <p>If you have a moment, we'd love to hear your thoughts — leave us a review!</p>
        <p style="color:#888;font-size:0.9em;">— Lwang Black Coffee</p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendSMS,
  sendOrderConfirmation,
  sendShippingUpdate,
  sendRefundNotice,
  sendDeliveryConfirmation,
  logNotification,
};
