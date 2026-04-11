// ── Memory Store — In-memory fallback when DB is unavailable ─────────────────
// Simulates DB for dev/demo mode without PostgreSQL
const store = {
  logistics: {},   // userId -> { carrierId -> config }
  social: {},      // userId -> { platformId -> connection }
  subscriptions: {}, // userId -> sub data
};

// Logistics
function getLogisticsConfig(userId) {
  return Object.values(store.logistics[userId] || {});
}
function setLogisticsConfig(userId, carrierId, data) {
  if (!store.logistics[userId]) store.logistics[userId] = {};
  store.logistics[userId][carrierId] = { ...data, carrierId, isActive: true, updatedAt: new Date().toISOString() };
}
function getLogisticsKeys(userId, carrierId) {
  return store.logistics[userId]?.[carrierId]?.keysData || null;
}
function deleteLogisticsConfig(userId, carrierId) {
  if (store.logistics[userId]) delete store.logistics[userId][carrierId];
}

// Social
function getSocialConnections(userId) {
  return Object.values(store.social[userId] || {});
}
function getSocialConnection(userId, platform) {
  return store.social[userId]?.[platform] || null;
}
function setSocialConnection(userId, platform, data) {
  if (!store.social[userId]) store.social[userId] = {};
  store.social[userId][platform] = { ...data, platform, isActive: true, connectedAt: new Date().toISOString() };
}
function deleteSocialConnection(userId, platform) {
  if (store.social[userId]) delete store.social[userId][platform];
}

// Subscriptions
function getSubscription(userId) {
  return store.subscriptions[userId] || null;
}
function setSubscription(userId, data) {
  store.subscriptions[userId] = { ...data, userId };
}

module.exports = {
  getLogisticsConfig, setLogisticsConfig, getLogisticsKeys, deleteLogisticsConfig,
  getSocialConnections, getSocialConnection, setSocialConnection, deleteSocialConnection,
  getSubscription, setSubscription,
};
