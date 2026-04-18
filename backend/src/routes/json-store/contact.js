const express = require('express');
const fs = require('fs');
const emailService = require('../../services/json-store-email');
const { file } = require('../../services/json-store-paths');

const router = express.Router();
const CONTACTS_FILE = file('contacts.json');

function getContacts() {
  if (!fs.existsSync(CONTACTS_FILE)) fs.writeFileSync(CONTACTS_FILE, '[]');
  return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
}

router.post('/', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email and message are required' });
    }

    const contact = {
      id: Date.now().toString(),
      name,
      email,
      phone: phone || '',
      message,
      status: 'new',
      createdAt: new Date().toISOString(),
    };

    const contacts = getContacts();
    contacts.push(contact);
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));

    await emailService.sendContactNotification(contact).catch(console.error);

    res.json({ success: true, message: 'Message received! We will reply within 24 hours.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
