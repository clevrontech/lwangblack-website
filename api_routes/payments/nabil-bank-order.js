// ── api/payments/nabil-bank-order.js ─────────────────────────────────────────
// POST /api/payments/nabil-bank-order
// Receives a Nabil Bank manual transfer order with payment slip (base64).
// Saves order as "pending_verification" and notifies admin.

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const {
      orderId,
      amount,
      currency,
      customerName,
      customerEmail,
      customerPhone,
      address,
      items,
      bankDetails,
      paymentSlip,
      slipFileName,
    } = req.body;

    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Missing required fields: orderId, amount' });
    }

    // ── Build order record ───────────────────────────────────────────────────
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      status: 'pending_verification',
      paymentMethod: 'nabil_bank',
      amount,
      currency: currency || 'NPR',
      customer: { name: customerName, email: customerEmail, phone: customerPhone, address },
      items: items || [],
      bankDetails: {
        bank: 'Nabil Bank Ltd.',
        accountName: 'LWANG BLACK PRODUCTS PVT.LTD',
        accountNumber: '15301017500402',
        ...(bankDetails || {}),
      },
      slip: {
        fileName: slipFileName,
        // Store base64 data — in production you'd upload to S3/Cloudinary instead
        data: paymentSlip || null,
        receivedAt: new Date().toISOString(),
      },
    };

    // ── Persist in memory (global store, same as other orders) ───────────────
    if (!global._lb_orders) global._lb_orders = [];
    global._lb_orders.unshift(order);

    // ── Console log for admin awareness ─────────────────────────────────────
    console.log(`\n🏦 NABIL BANK ORDER RECEIVED`);
    console.log(`   Order ID  : ${orderId}`);
    console.log(`   Customer  : ${customerName} <${customerEmail}>`);
    console.log(`   Phone     : ${customerPhone}`);
    console.log(`   Amount    : NPR ${amount}`);
    console.log(`   Slip File : ${slipFileName}`);
    console.log(`   Status    : pending_verification\n`);

    // ── Optional: Send email notification via Nodemailer (if configured) ─────
    const adminEmail = process.env.ADMIN_EMAIL;
    const smtpUser   = process.env.SMTP_USER;
    const smtpPass   = process.env.SMTP_PASS;

    if (adminEmail && smtpUser && smtpPass) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: `"Lwang Black Orders" <${smtpUser}>`,
          to: adminEmail,
          subject: `🏦 Nabil Bank Order — ${orderId} (NPR ${amount}) — VERIFY SLIP`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;padding:24px;">
              <h2 style="color:#c8860a;">New Nabil Bank Payment Received</h2>
              <p><b>Order ID:</b> ${orderId}<br>
                 <b>Amount:</b> NPR ${Number(amount).toLocaleString()}<br>
                 <b>Customer:</b> ${customerName}<br>
                 <b>Email:</b> ${customerEmail}<br>
                 <b>Phone:</b> ${customerPhone}<br>
                 <b>Address:</b> ${address}</p>
              <hr/>
              <h3>Items</h3>
              <ul>${(items || []).map(i => `<li>${i.name} × ${i.qty} — NPR ${i.price}</li>`).join('')}</ul>
              <hr/>
              <p style="color:#888;">Payment slip "${slipFileName}" was uploaded by the customer.
              Please verify the transfer in your Nabil Bank account
              (Account: <b>15301017500402</b>) and confirm the order.</p>
              <p style="margin-top:24px;font-size:12px;color:#aaa;">
                Lwang Black — automated order notification
              </p>
            </div>
          `,
          // Attach the slip image/PDF if it is base64 encoded
          attachments: paymentSlip ? [{
            filename: slipFileName || 'payment-slip.jpg',
            content: paymentSlip.replace(/^data:[^;]+;base64,/, ''),
            encoding: 'base64',
          }] : [],
        });

        console.log(`   📧 Admin email notification sent to ${adminEmail}`);
      } catch (emailErr) {
        // Non-fatal — order is already saved
        console.warn('   ⚠ Email notification failed:', emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      orderId,
      status: 'pending_verification',
      message: 'Order received. Your payment slip is under review. We will confirm your order within 1–2 business hours.',
    });

  } catch (err) {
    console.error('Nabil Bank order error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
