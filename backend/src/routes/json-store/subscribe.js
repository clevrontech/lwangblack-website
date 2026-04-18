const express = require('express');
const fs = require('fs');
const emailService = require('../../services/json-store-email');
const { file } = require('../../services/json-store-paths');

const router = express.Router();
const SUBS_FILE = file('subscribers.json');

function getSubscribers() {
  if (!fs.existsSync(SUBS_FILE)) fs.writeFileSync(SUBS_FILE, '[]');
  return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
}

router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    const subs = getSubscribers();
    if (subs.find((s) => s.email === email)) {
      return res.json({ success: true, message: 'Already subscribed!', discountCode: 'WELCOME10' });
    }

    subs.push({
      id: Date.now().toString(),
      name: name || '',
      email,
      phone: phone || '',
      createdAt: new Date().toISOString(),
    });
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));

    await emailService.sendWelcomeEmail({ name, email }).catch(console.error);

    res.json({ success: true, message: 'Subscribed! Check your email for 10% off.', discountCode: 'WELCOME10' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
