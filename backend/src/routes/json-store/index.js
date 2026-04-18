const express = require('express');

const router = express.Router();

router.use('/products', require('./products'));
router.use('/orders', require('./orders'));
router.use('/checkout', require('./checkout'));
router.use('/contact', require('./contact'));
router.use('/subscribe', require('./subscribe'));
router.use('/reviews', require('./reviews'));
router.use('/admin', require('./admin'));

module.exports = router;
