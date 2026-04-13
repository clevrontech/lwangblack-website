// ── Invoice Generator — PDF via PDFKit ──────────────────────────────────────
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('../db/pool');
const config = require('../config');

const INVOICE_DIR = path.join(__dirname, '..', '..', 'invoices');

function ensureDir() {
  if (!fs.existsSync(INVOICE_DIR)) {
    fs.mkdirSync(INVOICE_DIR, { recursive: true });
  }
}

function generateInvoiceNumber(orderId) {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `INV-${y}${m}-${orderId}`;
}

async function generateInvoice(order, customer, transactions) {
  ensureDir();

  const invoiceNumber = generateInvoiceNumber(order.id);
  const filename = `${invoiceNumber}.pdf`;
  const filepath = path.join(INVOICE_DIR, filename);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('LWANG BLACK', 50, 50);
      doc.fontSize(10).font('Helvetica').text('Specialty Coffee from Nepal', 50, 78);
      doc.moveDown(0.5);

      // Invoice title
      doc.fontSize(18).font('Helvetica-Bold').text('INVOICE', 400, 50, { align: 'right' });
      doc.fontSize(10).font('Helvetica')
        .text(`Invoice: ${invoiceNumber}`, 400, 75, { align: 'right' })
        .text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 400, 90, { align: 'right' })
        .text(`Order: ${order.id}`, 400, 105, { align: 'right' });

      // Line separator
      doc.moveTo(50, 130).lineTo(545, 130).stroke('#cccccc');

      // From / To
      const yStart = 150;
      doc.fontSize(10).font('Helvetica-Bold').text('From:', 50, yStart);
      doc.font('Helvetica')
        .text('Lwang Black Pvt. Ltd.', 50, yStart + 15)
        .text('Kathmandu, Nepal', 50, yStart + 30)
        .text(config.email.fromEmail, 50, yStart + 45)
        .text(config.siteUrl, 50, yStart + 60);

      doc.font('Helvetica-Bold').text('Bill To:', 300, yStart);
      doc.font('Helvetica')
        .text(`${customer?.fname || ''} ${customer?.lname || ''}`.trim() || 'Customer', 300, yStart + 15)
        .text(customer?.email || '', 300, yStart + 30)
        .text(customer?.phone || '', 300, yStart + 45)
        .text(customer?.address || '', 300, yStart + 60);

      // Items table header
      const tableTop = yStart + 100;
      doc.moveTo(50, tableTop).lineTo(545, tableTop).stroke('#cccccc');

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Item', 50, tableTop + 8);
      doc.text('Qty', 350, tableTop + 8, { width: 50, align: 'center' });
      doc.text('Price', 400, tableTop + 8, { width: 70, align: 'right' });
      doc.text('Total', 475, tableTop + 8, { width: 70, align: 'right' });

      doc.moveTo(50, tableTop + 25).lineTo(545, tableTop + 25).stroke('#cccccc');

      // Items
      const items = order.items || [];
      const sym = order.symbol || '$';
      let y = tableTop + 35;
      doc.font('Helvetica').fontSize(9);

      items.forEach(item => {
        const qty = item.qty || 1;
        const price = parseFloat(item.price) || 0;
        const lineTotal = qty * price;

        doc.text(item.name || 'Product', 50, y, { width: 290 });
        doc.text(String(qty), 350, y, { width: 50, align: 'center' });
        doc.text(`${sym}${price.toFixed(2)}`, 400, y, { width: 70, align: 'right' });
        doc.text(`${sym}${lineTotal.toFixed(2)}`, 475, y, { width: 70, align: 'right' });
        y += 20;
      });

      // Totals
      y += 10;
      doc.moveTo(350, y).lineTo(545, y).stroke('#cccccc');
      y += 10;

      doc.font('Helvetica').fontSize(9);
      doc.text('Subtotal:', 350, y, { width: 120, align: 'right' });
      doc.text(`${sym}${parseFloat(order.subtotal || 0).toFixed(2)}`, 475, y, { width: 70, align: 'right' });
      y += 18;

      doc.text('Shipping:', 350, y, { width: 120, align: 'right' });
      doc.text(`${sym}${parseFloat(order.shipping || 0).toFixed(2)}`, 475, y, { width: 70, align: 'right' });
      y += 18;

      if (order.discount_amount && parseFloat(order.discount_amount) > 0) {
        doc.text(`Discount (${order.discount_code || ''})`, 350, y, { width: 120, align: 'right' });
        doc.text(`-${sym}${parseFloat(order.discount_amount).toFixed(2)}`, 475, y, { width: 70, align: 'right' });
        y += 18;
      }

      doc.moveTo(350, y).lineTo(545, y).stroke('#cccccc');
      y += 8;
      doc.font('Helvetica-Bold').fontSize(11);
      doc.text('Total:', 350, y, { width: 120, align: 'right' });
      doc.text(`${sym}${parseFloat(order.total || 0).toFixed(2)}`, 475, y, { width: 70, align: 'right' });
      y += 25;

      doc.font('Helvetica').fontSize(9).fillColor('#666666');
      doc.text(`Currency: ${order.currency || 'USD'}`, 350, y, { width: 195, align: 'right' });

      // Payment info
      const latestTxn = transactions?.[0];
      if (latestTxn) {
        y += 20;
        doc.text(`Payment: ${(latestTxn.method || '').toUpperCase()} — ${latestTxn.status || 'pending'}`, 350, y, { width: 195, align: 'right' });
      }

      // Footer
      doc.fillColor('#999999').fontSize(8);
      doc.text('Thank you for choosing Lwang Black Coffee.', 50, 750, { align: 'center', width: 495 });
      doc.text(`${config.siteUrl} | ${config.email.fromEmail}`, 50, 762, { align: 'center', width: 495 });

      doc.end();

      stream.on('finish', async () => {
        const pdfUrl = `/invoices/${filename}`;
        try {
          await db.query(
            `INSERT INTO invoices (order_id, invoice_number, pdf_url, amount, currency, status)
             VALUES ($1, $2, $3, $4, $5, 'generated')
             ON CONFLICT (invoice_number) DO UPDATE SET pdf_url = $3, status = 'generated'`,
            [order.id, invoiceNumber, pdfUrl, order.total, order.currency || 'USD']
          );
        } catch (err) {
          console.error('[Invoice] DB insert error:', err.message);
        }
        resolve({ invoiceNumber, filename, filepath, pdfUrl });
      });

      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function getInvoiceForOrder(orderId) {
  try {
    return await db.queryOne('SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [orderId]);
  } catch {
    return null;
  }
}

module.exports = { generateInvoice, getInvoiceForOrder, generateInvoiceNumber };
