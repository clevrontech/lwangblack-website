'use strict';

/**
 * Reliable upstream fetch from Vercel serverless → Express.
 * Native `fetch` + spread `req.headers` often throws (hop-by-hop headers, IPv6).
 * node-fetch + IPv4 agents + sanitized headers fixes most production failures.
 */
const http = require('http');
const https = require('https');
const nodeFetch = require('node-fetch');

const httpsAgent = new https.Agent({ family: 4, keepAlive: true, maxSockets: 50 });
const httpAgent = new http.Agent({ family: 4, keepAlive: true, maxSockets: 50 });

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

function sanitizeHeaders(req) {
  const out = {};
  for (const key of Object.keys(req.headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    let val = req.headers[key];
    if (val === undefined || val === '') continue;
    if (Array.isArray(val)) val = val.join(', ');
    out[key] = String(val);
  }
  return out;
}

/**
 * @param {string} targetUrl
 * @param {import('http').IncomingMessage} req
 * @param {Buffer|string|undefined} body
 */
async function forwardToBackend(targetUrl, req, body) {
  const headers = sanitizeHeaders(req);
  const xff = req.headers['x-forwarded-for'];
  const first = typeof xff === 'string' ? xff.split(',')[0] : (Array.isArray(xff) ? xff[0] : '');
  headers['x-forwarded-for'] = (first && String(first).trim()) || req.socket?.remoteAddress || '';
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-host'] = req.headers.host || '';

  /** @type {import('node-fetch').RequestInit} */
  const opts = {
    method: req.method,
    headers,
    redirect: 'manual',
    timeout: 28000,
    agent: (parsed) => (parsed.protocol === 'http:' ? httpAgent : httpsAgent),
  };

  if (body !== undefined && body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
    opts.body = body;
  }

  return nodeFetch(targetUrl, opts);
}

module.exports = { forwardToBackend };
