// ── Export Service — CSV & PDF generation ───────────────────────────────────
const PDFDocument = require('pdfkit');

/**
 * Generate PDF invoice for an order
 */
function generateInvoicePDF(order, res) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.id}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(24).font('Helvetica-Bold').text('Lwang Black', { align: 'left' });
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text("Nepal's Premium Clove-Infused Coffee", { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Invoice: ${order.id}`, { align: 'right' });
  doc.text(`Date: ${new Date(order.created_at || order.date).toLocaleDateString('en-US')}`, { align: 'right' });

  // Divider
  doc.moveDown();
  doc.strokeColor('#ddd').lineWidth(1)
    .moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Customer
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000').text('Bill To:');
  doc.fontSize(10).font('Helvetica').fillColor('#333');
  const cust = order.customer || {};
  doc.text(`${cust.fname || ''} ${cust.lname || ''}`);
  if (cust.email) doc.text(cust.email);
  if (cust.phone) doc.text(cust.phone);
  if (cust.address) doc.text(cust.address);
  doc.moveDown();

  // Items table
  const tableTop = doc.y;
  const headers = ['Item', 'Qty', 'Unit Price', 'Total'];
  const colWidths = [250, 60, 90, 90];
  let x = 50;

  doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
  headers.forEach((h, i) => {
    doc.text(h, x, tableTop, { width: colWidths[i], align: i > 0 ? 'right' : 'left' });
    x += colWidths[i];
  });

  doc.moveDown(0.5);
  doc.strokeColor('#eee').lineWidth(0.5)
    .moveTo(50, doc.y).lineTo(550, doc.y).stroke();

  // Item rows
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  const items = order.items || [];
  items.forEach(item => {
    const y = doc.y + 5;
    x = 50;
    doc.text(item.name, x, y, { width: colWidths[0] }); x += colWidths[0];
    doc.text(String(item.qty || 1), x, y, { width: colWidths[1], align: 'right' }); x += colWidths[1];
    doc.text(`${order.symbol}${item.price}`, x, y, { width: colWidths[2], align: 'right' }); x += colWidths[2];
    doc.text(`${order.symbol}${((item.qty || 1) * item.price).toFixed(2)}`, x, y, { width: colWidths[3], align: 'right' });
    doc.moveDown();
  });

  // Totals
  doc.moveDown(0.5);
  doc.strokeColor('#eee').lineWidth(0.5)
    .moveTo(350, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.3);

  const totalX = 370;
  doc.text('Subtotal:', totalX, doc.y, { width: 90 });
  doc.text(`${order.symbol}${parseFloat(order.subtotal || 0).toFixed(2)}`, totalX + 90, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });
  doc.moveDown(0.3);

  doc.text('Shipping:', totalX, doc.y, { width: 90 });
  doc.text(`${order.symbol}${parseFloat(order.shipping || 0).toFixed(2)}`, totalX + 90, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000');
  doc.text('TOTAL:', totalX, doc.y, { width: 90 });
  doc.text(`${order.symbol}${parseFloat(order.total || 0).toFixed(2)}`, totalX + 90, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });

  // Footer
  doc.moveDown(3);
  doc.fontSize(9).font('Helvetica').fillColor('#999')
    .text('Thank you for your order! — lwangblack.co', 50, doc.y, { align: 'center' });
  doc.text('PAN: 622414599 · REG NO: 372142/82/83', { align: 'center' });

  doc.end();
}

/**
 * Generate CSV string from array of arrays
 */
function generateCSV(headers, rows) {
  const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  rows.forEach(row => lines.push(row.map(escape).join(',')));
  return lines.join('\n');
}

module.exports = { generateInvoicePDF, generateCSV };
