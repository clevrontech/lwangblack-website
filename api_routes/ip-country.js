// ── api/ip-country.js ──────────────────────────────────────────────────────
// Returns the visitor's country code based on their real IP address.
// Used by geo-router.js on the frontend for automatic region detection.

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Vercel passes real IP in x-forwarded-for header
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.connection?.remoteAddress;

  // Map of local/private IPs → default to Nepal (dev environment)
  const privateRanges = ['127.0.0.1', '::1', 'localhost'];
  if (!ip || privateRanges.includes(ip)) {
    return res.json({ country: 'NP', country_name: 'Nepal', ip: ip || 'local', source: 'fallback' });
  }

  try {
    // Use ipapi.co for free IP-to-country lookup (1000 req/day free)
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { 'User-Agent': 'LwangBlack/1.0' }
    });
    const data = await geoRes.json();

    if (data.country_code) {
      return res.json({
        ip,
        country: data.country_code,
        country_name: data.country_name,
        region: data.region,
        city: data.city,
        currency: data.currency,
        source: 'ipapi'
      });
    }
    throw new Error('No country in response');
  } catch (err) {
    // Fallback — try ip-api.com as secondary
    try {
      const fallback = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,country,city`);
      const fd = await fallback.json();
      return res.json({
        ip,
        country: fd.countryCode || 'NP',
        country_name: fd.country || 'Nepal',
        city: fd.city,
        source: 'ip-api-fallback'
      });
    } catch {
      return res.json({ ip, country: 'NP', country_name: 'Nepal', source: 'error-fallback' });
    }
  }
};

