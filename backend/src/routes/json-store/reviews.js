const express = require('express');
const fs = require('fs');
const { file } = require('../../services/json-store-paths');

const router = express.Router();
const REVIEWS_FILE = file('reviews.json');

const defaultReviews = [
  { id: '1', name: 'Abhishek Kushwaha', location: 'Verified Purchase', rating: 5, body: "Recently picked up Lwang Black's newly added product along with their Brewing Pot, and it's been a great experience. Premium build, consistent brew. Highly recommended!", createdAt: '2026-01-15T00:00:00Z', verified: true },
  { id: '2', name: 'Priya Maharjan', location: 'Kathmandu, Nepal', rating: 5, body: "The clove and coffee combination is genius. Zero stomach issues and the taste is incredible. It's become my morning ritual.", createdAt: '2026-01-20T00:00:00Z', verified: true },
  { id: '3', name: 'Roshan Thapa', location: 'Pokhara, Nepal', rating: 5, body: 'Ordered the 500g bag and was blown away by the quality. The clove aroma is subtle, bold, and exactly what I needed.', createdAt: '2026-02-01T00:00:00Z', verified: true },
  { id: '4', name: 'Sunita Gurung', location: 'Chitwan, Nepal', rating: 5, body: "Gifted the Pot & Press Set to my father and he absolutely loves it. Beautiful packaging, very premium feel.", createdAt: '2026-02-10T00:00:00Z', verified: true },
  { id: '5', name: 'Mohan Shrestha', location: 'Butwal, Nepal', rating: 5, body: "I've tried many coffees — Lwang Black is truly unique. The clove infusion is perfectly blended. Already on my third order.", createdAt: '2026-02-20T00:00:00Z', verified: true },
  { id: '6', name: 'Kavya Rana', location: 'Lalitpur, Nepal', rating: 5, body: 'Fast delivery, brilliant product. No crash like regular coffee. I feel focused all morning. Permanent part of my routine.', createdAt: '2026-03-01T00:00:00Z', verified: true },
];

function getReviews() {
  if (!fs.existsSync(REVIEWS_FILE)) {
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(defaultReviews, null, 2));
  }
  return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
}

router.get('/', (req, res) => {
  const reviews = getReviews();
  res.json({ success: true, reviews, count: reviews.length });
});

router.post('/', (req, res) => {
  try {
    const { name, email, rating, body, location } = req.body;
    if (!name || !body || rating == null) {
      return res.status(400).json({ success: false, error: 'Name, review and rating are required' });
    }
    const reviews = getReviews();
    const review = {
      id: Date.now().toString(),
      name,
      email: email || '',
      location: location || 'Nepal',
      rating: parseInt(rating, 10),
      body,
      verified: false,
      createdAt: new Date().toISOString(),
    };
    reviews.push(review);
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
    res.json({ success: true, message: 'Review submitted! It will appear after verification.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
