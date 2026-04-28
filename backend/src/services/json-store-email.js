// ── JSON-store email service ────────────────────────────────────────────────
// Storefront orders go through this. We unify on SendGrid via the canonical
// notifications.js, falling back to Nodemailer/Gmail if EMAIL_USER/EMAIL_PASS
// are present and SendGrid isn't configured. The previous implementation
// used Nodemailer only — which silently dropped emails in production where
// only SENDGRID_API_KEY was set.

const config = require('../config');
const notifications = require('./notifications');

const BRAND_COLOR = '#1a1a1a';
const GOLD = '#c8a96e';

let _transporter;
function getNodemailerTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) return null;
  try {
    const nodemailer = require('nodemailer');
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    return _transporter;
  } catch {
    return null;
  }
}

function emailBase(content) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
      <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden">
        <div style="background:${BRAND_COLOR};padding:30px;text-align:center">
          <h1 style="color:${GOLD};margin:0;font-size:28px;letter-spacing:3px">LWANG BLACK</h1>
          <p style="color:#fff;margin:5px 0 0;font-size:12px;letter-spacing:2px">PREMIUM CLOVE COFFEE · NEPAL</p>
        </div>
        <div style="padding:30px">${content}</div>
        <div style="background:#f5f5f5;padding:20px;text-align:center">
          <p style="color:#888;font-size:11px;margin:0">© 2026 Lwang Black · PAN: 622414599</p>
          <p style="color:#888;font-size:11px;margin:5px 0 0">
            <a href="https://www.lwangblack.co" style="color:${GOLD}">lwangblack.co</a> ·
            <a href="mailto:brewed@lwangblack.co" style="color:${GOLD}">brewed@lwangblack.co</a>
          </p>
        </div>
      </div>
    </body>
    </html>`;
}

/**
 * Unified send: try SendGrid (via notifications.sendEmail), then Nodemailer/Gmail,
 * then dry-run log. Returns { ok, provider } so callers can audit.
 */
async function sendUnified({ to, subject, html }) {
  if (!to) return { ok: false, provider: 'none', error: 'missing recipient' };

  // 1. Prefer SendGrid (matches admin path).
  if (config.email && config.email.apiKey) {
    const r = await notifications.sendEmail({ to, subject, html });
    if (r && r.success) return { ok: true, provider: 'sendgrid' };
    // fall through to nodemailer if sendgrid failed
  }

  // 2. Fallback to Nodemailer/Gmail.
  const t = getNodemailerTransporter();
  if (t) {
    try {
      await t.sendMail({
        from: `"Lwang Black" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
      });
      return { ok: true, provider: 'nodemailer' };
    } catch (err) {
      console.error('[json-store-email] Nodemailer error:', err.message);
    }
  }

  // 3. Final fallback: notifications.sendEmail's dry-run logger.
  await notifications.sendEmail({ to, subject, html });
  return { ok: false, provider: 'dry-run' };
}

async function sendOrderConfirmation(order) {
  const items = (order.lineItems || []).map(
    (i) =>
      `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${i.name} × ${i.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${Number(i.price) * Number(i.qty)}</td>
    </tr>`
  ).join('');

  const custName = order.customer?.name || order.customer?.firstName || 'Customer';
  const content = `
    <h2 style="color:#1a1a1a">Order Confirmed ☕</h2>
    <p>Hi ${custName},</p>
    <p>Your order has been received and is being prepared.</p>
    <div style="background:#f9f9f9;padding:15px;border-radius:6px;margin:20px 0">
      <p style="margin:0;font-size:12px;color:#666;letter-spacing:1px">ORDER NUMBER</p>
      <p style="margin:5px 0 0;font-size:22px;font-weight:bold;color:#1a1a1a">${order.orderNumber}</p>
    </div>
    <table style="width:100%;border-collapse:collapse">${items}</table>
    <div style="border-top:2px solid #1a1a1a;padding-top:10px;text-align:right;margin-top:10px">
      <strong>Total: ${order.totalDisplay != null ? order.totalDisplay : order.totalAmount}</strong>
    </div>
    <p style="margin-top:20px">
      <strong>Delivery to:</strong> ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.country || ''}<br>
      <strong>Payment:</strong> ${String(order.paymentMethod || '').toUpperCase()}<br>
      <strong>Estimated delivery:</strong> ${order.region === 'NP' ? '1–3 business days' : '7–14 business days'}
    </p>
    <p>Questions? <a href="https://wa.me/9779857059386" style="color:#c8a96e">WhatsApp us</a> or reply to this email.</p>`;

  await sendUnified({
    to: order.customer?.email,
    subject: `Order Confirmed — ${order.orderNumber} ☕`,
    html: emailBase(content),
  });
}

async function sendContactNotification(contact) {
  const adminTo = process.env.ADMIN_EMAIL || config.email.fromEmail;
  const content = `
      <h2>New Contact Submission</h2>
      <p><strong>Name:</strong> ${contact.name}</p>
      <p><strong>Email:</strong> ${contact.email}</p>
      <p><strong>Phone:</strong> ${contact.phone || 'N/A'}</p>
      <p><strong>Message:</strong></p>
      <div style="background:#f5f5f5;padding:15px;border-radius:6px">${contact.message}</div>
      <p style="margin-top:20px">
        <a href="mailto:${contact.email}" style="background:#1a1a1a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Reply to ${contact.name}</a>
      </p>`;
  await sendUnified({
    to: adminTo,
    subject: `New Contact: ${contact.name} — ${contact.email}`,
    html: emailBase(content),
  });
}

async function sendWelcomeEmail({ name, email }) {
  const content = `
      <h2>Welcome, ${name || 'Coffee Lover'}!</h2>
      <p>Thank you for joining the Lwang Black community — Nepal's premium clove-infused coffee.</p>
      <div style="background:#1a1a1a;padding:20px;border-radius:6px;text-align:center;margin:20px 0">
        <p style="color:#c8a96e;margin:0;font-size:13px;letter-spacing:2px">YOUR DISCOUNT CODE</p>
        <p style="color:#fff;font-size:32px;font-weight:bold;margin:10px 0;letter-spacing:4px">WELCOME10</p>
        <p style="color:#888;margin:0;font-size:12px">10% off your first order</p>
      </div>
      <p>Use code <strong>WELCOME10</strong> at checkout.</p>
      <div style="text-align:center;margin-top:20px">
        <a href="https://www.lwangblack.co/shop.html" style="background:#c8a96e;color:#1a1a1a;padding:14px 28px;text-decoration:none;border-radius:4px;font-weight:bold">SHOP NOW</a>
      </div>`;
  await sendUnified({
    to: email,
    subject: "Welcome to Lwang Black — Here's 10% Off ☕",
    html: emailBase(content),
  });
}

module.exports = { sendOrderConfirmation, sendContactNotification, sendWelcomeEmail };
