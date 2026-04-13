// ── Memory Store — In-process fallback for social connections ─────────────────
// Only used by social.js when the DB query fails (e.g. table missing in demo mode).
// Logistics and subscription state are managed by pool.js memQuery + settings table.
const store = {
  social: {},  // userId -> { platformId -> connection }
};

function getSocialConnections(userId) {
  return Object.values(store.social[userId] || {});
}
function getSocialConnection(userId, platform) {
  return store.social[userId]?.[platform] || null;
}
function setSocialConnection(userId, platform, data) {
  if (!store.social[userId]) store.social[userId] = {};
  store.social[userId][platform] = {
    ...data,
    platform,
    isActive: true,
    connectedAt: new Date().toISOString(),
    keys_data: data.keysData ? JSON.stringify(data.keysData) : null,
    page_id: data.pageId || null,
    page_name: data.pageName || null,
    username: data.username || null,
  };
}
function deleteSocialConnection(userId, platform) {
  if (store.social[userId]) delete store.social[userId][platform];
}

module.exports = {
  getSocialConnections,
  getSocialConnection,
  setSocialConnection,
  deleteSocialConnection,
};
