// ══════════════════════════════════════════════════════════════════════════════
// Lwang Black Admin — Part 3: Profile, Subscription, Logistics, Social Media
// Real-time via WebSocket · Shopify-grade architecture
// ══════════════════════════════════════════════════════════════════════════════

// ─── Hook into goPage for new pages ──────────────────────────────────────────
const _origGoPage = typeof goPage === 'function' ? goPage : null;
if (_origGoPage) {
  window.goPage = function(id) {
    _origGoPage(id);
    if (id === 'profile')      renderProfile();
    if (id === 'subscription') renderSubscription();
    if (id === 'logistics')    renderLogistics();
    if (id === 'social')       renderSocial();
  };
}

// ─── Boot hook — extend boot() to handle manager subscription check ──────────
const _origBoot = typeof boot === 'function' ? boot : null;
if (_origBoot) {
  window.boot = function() {
    _origBoot();
    // Show subscription nav only for managers
    const isManager = currentUser?.role === 'manager';
    const isOwner   = currentUser?.role === 'owner';
    document.querySelectorAll('.manager-only').forEach(el => el.style.display = isManager ? '' : 'none');
    // Populate profile display
    renderProfile();
    // Check subscription status for managers
    if (isManager) checkSubscriptionStatus();
    // Wire publish textarea character counter
    const pm = document.getElementById('publishMessage');
    if (pm) pm.addEventListener('input', () => {
      document.getElementById('publishCharCount').textContent = `${pm.value.length} / 2200 characters`;
    });
    // Handle subscription success URL param
    const sp = new URLSearchParams(location.search);
    if (sp.get('subscription') === 'success' || sp.get('subscription') === 'demo_success') {
      showToast('🎉 Subscription activated! Welcome to Manager Plan.', 'success');
      setTimeout(() => goPage('subscription'), 400);
    }
    // Extend WebSocket handler with new events
    extendWebSocketHandler();
  };
}

// Extend WS to handle new event types
function extendWebSocketHandler() {
  if (!window.adminWS) return;
  const origOnMsg = adminWS.onmessage;
  adminWS.onmessage = function(e) {
    if (origOnMsg) origOnMsg.call(this, e);
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'subscription:updated') handleSubWSEvent(msg.data);
      if (msg.type === 'subscription:cancelled') handleSubWSEvent({ ...msg.data, status: 'cancelled' });
      if (msg.type === 'logistics:configured') showToast(`🚚 ${msg.data?.carrier} API connected`, 'success');
      if (msg.type === 'social:connected') showToast(`📱 ${msg.data?.platformName} connected!`, 'success');
      if (msg.type === 'social:catalog_synced') showToast(`✅ Catalog synced to ${msg.data?.platform}`, 'success');
      if (msg.type === 'order:shipped') handleShipmentWS(msg.data);
    } catch {}
  };
}

function handleSubWSEvent(data) {
  if (data.userId === currentUser?.id || data.username === currentUser?.username) {
    const active = data.active || data.status === 'active';
    showToast(active ? '💎 Subscription is now ACTIVE!' : '⚠️ Subscription status changed', active ? 'success' : 'info');
    const pg = document.querySelector('.page.active');
    if (pg?.id === 'page-subscription') renderSubscription();
  }
}

function handleShipmentWS(data) {
  showToast(`🚚 Order ${data.orderId} shipped via ${data.carrier} — ${data.trackingNumber}`, 'success');
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE — Username & Password Change (All roles)
// ══════════════════════════════════════════════════════════════════════════════
function renderProfile() {
  if (!currentUser) return;
  const el = id => document.getElementById(id);
  if (el('profileAvatar')) el('profileAvatar').textContent = (currentUser.name || currentUser.username || 'A')[0].toUpperCase();
  if (el('profileName'))  el('profileName').textContent  = currentUser.name || currentUser.username;
  if (el('profileRole'))  el('profileRole').textContent  = currentUser.role === 'owner' ? '👑 Owner' : `📍 Manager — ${currentUser.country || 'Global'}`;
  if (el('profileEmail')) el('profileEmail').textContent = currentUser.email || `${currentUser.username}@lwangblack.com`;
  if (el('prof-name'))    el('prof-name').value    = currentUser.name || '';
  if (el('prof-email'))   el('prof-email').value   = currentUser.email || '';
  if (el('prof-current-username')) el('prof-current-username').value = currentUser.username || '';
}

async function saveProfile() {
  const name  = document.getElementById('prof-name')?.value.trim();
  const email = document.getElementById('prof-email')?.value.trim();
  const phone = document.getElementById('prof-phone')?.value.trim();
  if (!name && !email) { showToast('Fill at least name or email', 'error'); return; }
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/auth/update-profile`, {
      method: 'POST', headers: h, body: JSON.stringify({ name, email, phone }),
    });
    const d = await r.json();
    if (!r.ok) { showToast(d.error || 'Failed to update', 'error'); return; }
    if (d.user) {
      currentUser = { ...currentUser, ...d.user };
      localStorage.setItem('lb_adm_user', JSON.stringify(currentUser));
    }
    renderProfile();
    showToast('Profile saved ✅', 'success');
  } catch {
    // Local fallback
    if (name)  { currentUser.name  = name;  document.getElementById('sbName').textContent = name; }
    if (email) currentUser.email = email;
    localStorage.setItem('lb_adm_user', JSON.stringify(currentUser));
    renderProfile();
    showToast('Profile saved locally ✅', 'success');
  }
}

async function changeUsername() {
  const newUsername = document.getElementById('prof-new-username')?.value.trim();
  const password    = document.getElementById('prof-username-pass')?.value;
  if (!newUsername || !password) { showToast('Fill all fields', 'error'); return; }
  if (newUsername.length < 3)    { showToast('Username too short (min 3 chars)', 'error'); return; }

  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/auth/change-username`, {
      method: 'POST', headers: h, body: JSON.stringify({ newUsername, password }),
    });
    const d = await r.json();
    if (!r.ok) { showToast(d.error || 'Failed', 'error'); return; }
    showToast(`Username changed to '${newUsername}'. Logging out…`, 'success');
    // Local fallback: update stored creds
    const creds = JSON.parse(localStorage.getItem('lb_local_creds') || '{}');
    creds[newUsername] = password;
    delete creds[currentUser.username];
    localStorage.setItem('lb_local_creds', JSON.stringify(creds));
    setTimeout(() => doLogout(), 2000);
  } catch {
    // Offline — update local credentials store
    const creds = JSON.parse(localStorage.getItem('lb_local_creds') || '{}');
    const curPass = creds[currentUser.username] || '';
    if (password !== curPass && curPass) { showToast('Password incorrect', 'error'); return; }
    creds[newUsername] = password || creds[currentUser.username];
    delete creds[currentUser.username];
    localStorage.setItem('lb_local_creds', JSON.stringify(creds));
    showToast(`Username changed to '${newUsername}'. Logging out…`, 'success');
    setTimeout(() => doLogout(), 2000);
  }
}

async function changePassword() {
  const cur     = document.getElementById('prof-cur-pass')?.value;
  const newPass = document.getElementById('prof-new-pass')?.value;
  const confirm = document.getElementById('prof-confirm-pass')?.value;
  if (!cur || !newPass || !confirm) { showToast('Fill all password fields', 'error'); return; }
  if (newPass !== confirm)           { showToast('Passwords do not match', 'error'); return; }
  if (newPass.length < 8)            { showToast('Min. 8 characters', 'error'); return; }

  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/auth/change-password`, {
      method: 'POST', headers: h, body: JSON.stringify({ currentPassword: cur, newPassword: newPass }),
    });
    const d = await r.json();
    if (!r.ok) { showToast(d.error || 'Failed', 'error'); return; }
    showToast('Password changed! Logging out…', 'success');
    setTimeout(() => doLogout(), 2000);
  } catch {
    // Offline — update local credentials store
    const creds = JSON.parse(localStorage.getItem('lb_local_creds') || '{}');
    if (creds[currentUser.username] && creds[currentUser.username] !== cur) {
      showToast('Current password incorrect', 'error'); return;
    }
    creds[currentUser.username] = newPass;
    localStorage.setItem('lb_local_creds', JSON.stringify(creds));
    showToast('Password changed! Logging out…', 'success');
    setTimeout(() => doLogout(), 2000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION — Manager $99/month (Shopify-style)
// ══════════════════════════════════════════════════════════════════════════════
let _subStatus = null;

async function checkSubscriptionStatus() {
  try {
    const h = authToken && authToken !== 'local' ? { Authorization: `Bearer ${authToken}` } : {};
    const r = await fetch(`${API}/subscription/status`, { headers: h });
    if (r.ok) {
      _subStatus = await r.json();
      updateSubscriptionGate();
    }
  } catch {
    // Check localStorage for demo activation
    const demoSub = localStorage.getItem('lb_demo_sub');
    if (demoSub) {
      const sub = JSON.parse(demoSub);
      if (new Date(sub.expires) > new Date()) {
        _subStatus = { active: true, plan: 'manager', demo: true, periodEnd: sub.expires };
        updateSubscriptionGate();
      }
    }
  }
}

function updateSubscriptionGate() {
  if (!_subStatus) return;
  const isActive = _subStatus.active;
  const isOwner  = currentUser?.role === 'owner';
  // Update subscription badge in sidebar
  const subNav = document.getElementById('nav-subscription');
  if (subNav) {
    subNav.innerHTML = isActive
      ? '💎 Subscription <span class="pill pill-green" style="font-size:.55rem;margin-left:.4rem">ACTIVE</span>'
      : '💎 Subscription <span class="pill pill-red" style="font-size:.55rem;margin-left:.4rem">INACTIVE</span>';
  }
}

async function renderSubscription() {
  if (currentUser?.role === 'owner') {
    document.getElementById('subStatusBanner').innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(46,98,76,.25),rgba(76,175,135,.15));border:1px solid var(--accent);border-radius:14px;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:1rem">
        <div style="font-size:2rem">👑</div>
        <div><div style="font-weight:700;font-size:1rem">Owner Account — Full Lifetime Access</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">You have unrestricted access to all features. No subscription needed.</div></div>
      </div>`;
    document.getElementById('subActionBtn').disabled = true;
    document.getElementById('subActionBtn').textContent = 'Owner Access — No Subscription Needed';
    document.getElementById('subDetails').innerHTML = '<div style="padding:1rem;font-size:.85rem;color:var(--muted)">Owners have permanent full access.</div>';
    return;
  }

  let status = _subStatus;
  if (!status) {
    await checkSubscriptionStatus();
    status = _subStatus;
  }

  const isActive = status?.active;
  const banner   = document.getElementById('subStatusBanner');
  const btn      = document.getElementById('subActionBtn');
  const detEl    = document.getElementById('subDetails');

  if (isActive) {
    banner.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(46,98,76,.3),rgba(76,175,135,.2));border:1px solid rgba(76,175,135,.5);border-radius:14px;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:1rem">
        <div style="font-size:2rem">✅</div>
        <div style="flex:1"><div style="font-weight:700;font-size:1rem;color:#4caf87">Manager Plan — ACTIVE</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">Full admin access unlocked. Next billing: ${status.periodEnd ? new Date(status.periodEnd).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : 'N/A'}</div></div>
        <button class="btn btn-danger btn-sm" onclick="cancelSubscription()">Cancel Plan</button>
      </div>`;
    btn.textContent = '✅ Currently Active — Manage Subscription';
    btn.disabled = true;
    btn.style.opacity = '.6';
    detEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:.5rem 0">
        <div><div style="font-size:.7rem;color:var(--muted)">Plan</div><div style="font-weight:600">Manager Monthly</div></div>
        <div><div style="font-size:.7rem;color:var(--muted)">Amount</div><div style="font-weight:600;color:var(--accent2)">$99/month</div></div>
        <div><div style="font-size:.7rem;color:var(--muted)">Status</div><div><span class="pill pill-green">Active</span></div></div>
        <div><div style="font-size:.7rem;color:var(--muted)">Next Billing</div><div style="font-weight:600">${status.periodEnd ? new Date(status.periodEnd).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'N/A'}</div></div>
      </div>
      ${status.demo ? '<div style="font-size:.7rem;color:var(--muted);margin-top:.75rem;padding:.5rem;background:rgba(255,209,102,.1);border-radius:8px;border:1px solid rgba(255,209,102,.2)">⚠️ Demo mode — connect Stripe keys for real billing</div>' : ''}`;
  } else {
    banner.innerHTML = `
      <div style="background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.3);border-radius:14px;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:1rem">
        <div style="font-size:2rem">⚠️</div>
        <div><div style="font-weight:700;font-size:1rem;color:var(--danger)">No Active Subscription</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">Subscribe to unlock full manager admin access for $99/month.</div></div>
      </div>`;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.textContent = 'Subscribe Now — $99/month';
    detEl.innerHTML = '<div style="padding:1rem;font-size:.85rem;color:var(--muted)">No active subscription. Click Subscribe Now to get started with a 7-day free trial.</div>';
  }
}

async function handleSubscription() {
  if (currentUser?.role === 'owner') return;
  const btn = document.getElementById('subActionBtn');
  btn.textContent = 'Redirecting to Stripe…';
  btn.disabled = true;
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/subscription/create-checkout`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ successUrl: `${location.origin}/admin.html?subscription=success`, cancelUrl: `${location.origin}/admin.html?subscription=cancelled` }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Checkout failed');

    if (d.demo) {
      // Demo: activate locally
      const expires = new Date(); expires.setMonth(expires.getMonth() + 1);
      localStorage.setItem('lb_demo_sub', JSON.stringify({ active: true, expires: expires.toISOString() }));
      _subStatus = { active: true, plan: 'manager', demo: true, periodEnd: expires.toISOString() };
      updateSubscriptionGate();
      renderSubscription();
      showToast('🎉 Demo subscription activated! (No Stripe key configured)', 'success');
      return;
    }

    if (d.url) {
      window.location.href = d.url;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (err) {
    showToast(`Subscription error: ${err.message}`, 'error');
    btn.textContent = 'Subscribe Now — $1,999/month';
    btn.disabled = false;
  }
}

async function cancelSubscription() {
  if (!confirm('Cancel your subscription? Access continues until end of billing period.')) return;
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/subscription/cancel`, { method: 'POST', headers: h });
    const d = await r.json();
    showToast(d.message || 'Subscription cancellation requested', 'info');
    localStorage.removeItem('lb_demo_sub');
    _subStatus = null;
    await checkSubscriptionStatus();
    renderSubscription();
  } catch {
    showToast('Cancellation failed. Try again.', 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGISTICS — Carrier API Integration
// ══════════════════════════════════════════════════════════════════════════════
const CARRIER_DEFS = {
  dhl:     { name:'DHL Express',       icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFCC00" stroke-width="2"><path d="M5 21h14a2 2 0 0 0 2-2V7.5L14.5 2H5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>', color:'#FFCC00', fields:[{id:'apiKey',label:'DHL API Key',type:'password'},{id:'accountNumber',label:'Account Number',type:'text'}] },
  fedex:   { name:'FedEx',             icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4D148C" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>', color:'#4D148C', fields:[{id:'apiKey',label:'API Key',type:'password'},{id:'apiSecret',label:'API Secret',type:'password'},{id:'accountNumber',label:'Account Number',type:'text'}] },
  ups:     { name:'UPS',               icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#351C15" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>', color:'#351C15', fields:[{id:'clientId',label:'Client ID',type:'text'},{id:'clientSecret',label:'Client Secret',type:'password'},{id:'accountNumber',label:'Account Number',type:'text'}] },
  ship24:  { name:'Ship24 (Universal)',icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0066FF" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>', color:'#0066FF', fields:[{id:'apiKey',label:'Ship24 API Key',type:'password'}] },
  shippo:  { name:'Shippo',            icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>', color:'#8B5CF6', fields:[{id:'apiKey',label:'Shippo API Key',type:'password'}] },
  auspost: { name:'Australia Post',    icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DA291C" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>', color:'#DA291C', fields:[{id:'apiKey',label:'Australia Post API Key',type:'password'}] },
  nabil:   { name:'Nabil Bank Logistics',icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CC0000" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>', color:'#CC0000', fields:[{id:'merchantId',label:'Merchant ID',type:'text'},{id:'apiKey',label:'API Key',type:'password'},{id:'secretKey',label:'Secret Key',type:'password'}] },
};
let _logisticsConfigs = {};
let _currentCarrierId = null;

async function renderLogistics() {
  await loadLogisticsConfig();
  const container = document.getElementById('logisticsCarriers');
  if (!container) return;
  container.innerHTML = Object.entries(CARRIER_DEFS).map(([id, c]) => {
    const cfg = _logisticsConfigs[id];
    const connected = !!cfg;
    return `
    <div class="carrier-card ${connected ? 'carrier-connected' : ''}">
      <div class="carrier-card-top">
        <div class="carrier-icon">${c.icon}</div>
        <div class="carrier-info">
          <div class="carrier-name">${c.name}</div>
          <div class="carrier-status">
            ${connected
              ? `<span class="pill pill-green" style="font-size:.6rem">CONNECTED</span>${cfg.isLive ? '<span class="pill pill-blue" style="font-size:.6rem;margin-left:.3rem">LIVE</span>' : '<span class="pill pill-yellow" style="font-size:.6rem;margin-left:.3rem">TEST</span>'}`
              : '<span class="pill pill-grey" style="font-size:.6rem">NOT CONNECTED</span>'}
          </div>
        </div>
        <div class="carrier-actions">
          <button class="btn ${connected?'btn-ghost':'btn-primary'} btn-sm" onclick="openCarrierModal('${id}')">${connected?'⚙ Configure':'Connect'}</button>
          ${connected?`<button class="btn btn-danger btn-sm" onclick="disconnectCarrier('${id}')">✕</button>`:''}
        </div>
      </div>
      ${connected ? `<div class="carrier-meta">Account: <code>${cfg.accountNumber||'—'}</code> · Last updated: ${cfg.lastUpdated ? new Date(cfg.lastUpdated).toLocaleDateString():'—'}</div>` : `<div class="carrier-meta">Click Connect to add your ${c.name} API credentials</div>`}
    </div>`;
  }).join('');
}

async function loadLogisticsConfig() {
  try {
    const h = authToken && authToken !== 'local' ? { Authorization: `Bearer ${authToken}` } : {};
    const r = await fetch(`${API}/logistics/config`, { headers: h });
    if (r.ok) {
      const d = await r.json();
      _logisticsConfigs = {};
      (d.configs || []).forEach(c => { _logisticsConfigs[c.carrierId] = c; });
      return;
    }
  } catch {}
  // Local fallback
  _logisticsConfigs = JSON.parse(localStorage.getItem('lb_logistics_cfg') || '{}');
}

function openCarrierModal(carrierId) {
  _currentCarrierId = carrierId;
  const c   = CARRIER_DEFS[carrierId];
  const cfg = _logisticsConfigs[carrierId] || {};
  document.getElementById('modalCarrierTitle').textContent = `${c.icon} Configure ${c.name}`;
  document.getElementById('modalCarrierBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:rgba(255,255,255,.04);border-radius:10px;margin-bottom:1.25rem">
      <div style="font-size:2.5rem">${c.icon}</div>
      <div>
        <div style="font-weight:700">${c.name}</div>
        <a href="#" style="font-size:.7rem;color:var(--accent2)" onclick="window.open('https://developer.dhl.com','_blank')">View API Documentation ↗</a>
      </div>
    </div>
    ${c.fields.map(f => `
      <div class="form-row">
        <label class="form-label">${f.label}</label>
        <input class="form-input carrier-field" id="cf-${f.id}" type="${f.type}" placeholder="${f.type === 'password' ? '••••••••••' : f.label}" autocomplete="off"/>
      </div>`).join('')}
    <div class="form-row">
      <label class="form-label">Mode</label>
      <div style="display:flex;gap:1rem;margin-top:.35rem">
        <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.82rem">
          <input type="radio" name="carrier-mode" id="cf-mode-test" value="test" checked> Test / Sandbox
        </label>
        <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.82rem">
          <input type="radio" name="carrier-mode" id="cf-mode-live" value="live"> 🔴 Live
        </label>
      </div>
    </div>
    <div style="font-size:.72rem;color:var(--muted);margin-top:.75rem;padding:.75rem;background:rgba(255,209,102,.08);border-radius:8px;border-left:3px solid rgba(255,209,102,.4)">
      💡 Keys are encrypted before storage. You can switch between Test and Live mode at any time.
    </div>`;
  openModal('modalCarrier');
}

async function saveCarrierConfig() {
  const id = _currentCarrierId;
  if (!id) return;
  const c = CARRIER_DEFS[id];
  const body = { isLive: document.getElementById('cf-mode-live')?.checked };
  c.fields.forEach(f => { body[f.id] = document.getElementById(`cf-${f.id}`)?.value.trim(); });
  // Validate
  for (const f of c.fields) {
    if (!body[f.id]) { showToast(`${f.label} is required`, 'error'); return; }
  }
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/logistics/config/${id}`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { showToast(d.error || 'Save failed', 'error'); return; }
    // Local fallback save
    _logisticsConfigs[id] = { carrierId: id, carrierName: c.name, accountNumber: body.accountNumber, isLive: body.isLive, isActive: true, lastUpdated: new Date().toISOString() };
    localStorage.setItem('lb_logistics_cfg', JSON.stringify(_logisticsConfigs));
    closeModal('modalCarrier');
    renderLogistics();
    showToast(`${c.icon} ${c.name} connected successfully!`, 'success');
  } catch {
    // Save locally
    _logisticsConfigs[id] = { carrierId: id, carrierName: c.name, accountNumber: body.accountNumber, isLive: body.isLive, isActive: true, lastUpdated: new Date().toISOString() };
    localStorage.setItem('lb_logistics_cfg', JSON.stringify(_logisticsConfigs));
    closeModal('modalCarrier');
    renderLogistics();
    showToast(`${c.icon} ${c.name} saved locally`, 'success');
  }
}

async function disconnectCarrier(id) {
  if (!confirm(`Disconnect ${CARRIER_DEFS[id]?.name}?`)) return;
  try {
    const h = authToken && authToken !== 'local' ? { Authorization: `Bearer ${authToken}` } : {};
    await fetch(`${API}/logistics/config/${id}`, { method: 'DELETE', headers: h });
  } catch {}
  delete _logisticsConfigs[id];
  localStorage.setItem('lb_logistics_cfg', JSON.stringify(_logisticsConfigs));
  renderLogistics();
  showToast(`${CARRIER_DEFS[id]?.name} disconnected`, 'info');
}

function openTrackModal() { openModal('modalTrack'); document.getElementById('trackResult').innerHTML = ''; }

async function doTrackShipment() {
  const num    = document.getElementById('trackNumInput')?.value.trim();
  const cid    = document.getElementById('trackCarrierSelect')?.value || 'dhl';
  const result = document.getElementById('trackResult');
  if (!num) { showToast('Enter tracking number', 'error'); return; }
  result.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)"><div style="font-size:2rem;animation:spin 1s linear infinite">⏳</div><div style="margin-top:.5rem">Tracking shipment…</div></div>';
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/logistics/track`, { method: 'POST', headers: h, body: JSON.stringify({ trackingNumber: num, carrierId: cid }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Tracking failed');
    const t = d.tracking;
    const statusColor = { in_transit: 'pill-blue', delivered: 'pill-green', exception: 'pill-red', pending: 'pill-yellow' }[t.status] || 'pill-grey';
    result.innerHTML = `
      <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:1rem;margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem">
          <div>
            <div style="font-weight:700;font-size:1rem">${t.number}</div>
            <div style="color:var(--muted);font-size:.75rem">${t.carrier}${t.demo ? ' · <span style="color:#f0c040">Demo data</span>' : ''}</div>
          </div>
          <span class="pill ${statusColor}">${t.status.replace(/_/g,' ')}</span>
        </div>
        <div style="margin-top:.75rem;font-size:.8rem;color:var(--muted)">📍 ${t.location || '—'}</div>
        ${t.estimatedDelivery ? `<div style="font-size:.78rem;color:var(--accent2);margin-top:.25rem">📅 Est. delivery: ${new Date(t.estimatedDelivery).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>` : ''}
      </div>
      <div style="font-size:.75rem;color:var(--muted);font-weight:600;margin-bottom:.5rem">TRACKING HISTORY</div>
      ${(t.events || []).map(ev => `
        <div style="display:flex;gap:.75rem;padding:.6rem 0;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="width:2px;background:var(--accent);border-radius:2px;min-height:30px;margin-top:.2rem"></div>
          <div>
            <div style="font-size:.8rem;font-weight:500">${ev.description}</div>
            <div style="font-size:.7rem;color:var(--muted)">${ev.location || ''} · ${ev.time ? new Date(ev.time).toLocaleString() : ''}</div>
          </div>
        </div>`).join('')}`;
  } catch (err) {
    result.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${err.message}</p></div>`;
  }
}

async function loadRecentShipments() {
  const el = document.getElementById('recentShipments');
  if (!el) return;
  // Pull shipped orders
  const shipped = (window.allOrders || []).filter(o => o.tracking || o.tracking_number).slice(0, 10);
  if (!shipped.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No shipments with tracking numbers yet.</p></div>';
    return;
  }
  el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Carrier</th><th>Tracking</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${shipped.map(o => `<tr>
      <td class="mono" style="color:var(--accent2)">${o.id}</td>
      <td>${o.customer?.fname||'—'} ${o.customer?.lname||''}</td>
      <td>${o.carrier||'DHL'}</td>
      <td class="mono">${o.tracking||o.tracking_number||'—'}</td>
      <td>${typeof pill==='function'?pill(o.status):`<span class="pill">${o.status}</span>`}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="quickTrack('${o.tracking||o.tracking_number||''}','${o.carrier?.toLowerCase()||'dhl'}')">Track</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function quickTrack(num, carrier) {
  openModal('modalTrack');
  document.getElementById('trackNumInput').value = num;
  document.getElementById('trackCarrierSelect').value = carrier;
  doTrackShipment();
}

// ══════════════════════════════════════════════════════════════════════════════
// SOCIAL MEDIA — Facebook, Instagram, TikTok
// ══════════════════════════════════════════════════════════════════════════════
const SOCIAL_DEFS = {
  facebook:  { name:'Facebook',  icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>', color:'#1877F2', gradFrom:'#1877F2', gradTo:'#0A4DA8', fields:[{id:'appId',label:'App ID',type:'text'},{id:'appSecret',label:'App Secret',type:'password'},{id:'accessToken',label:'Page Access Token',type:'password'},{id:'pageId',label:'Page ID',type:'text'},{id:'pageName',label:'Page Name',type:'text'},{id:'pixelId',label:'Pixel ID (optional)',type:'text'}] },
  instagram: { name:'Instagram', icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>', color:'#E1306C', gradFrom:'#E1306C', gradTo:'#833AB4', fields:[{id:'appId',label:'App ID',type:'text'},{id:'appSecret',label:'App Secret',type:'password'},{id:'accessToken',label:'Access Token',type:'password'},{id:'username',label:'Instagram Username',type:'text'}] },
  tiktok:    { name:'TikTok',    icon:'<svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M12.53.02C13.84 0 15.14.01 16.44 0a7.68 7.68 0 0 0 4.18 5.61v3.47c-1.39-.12-2.72-.54-3.92-1.22v9.55a6.47 6.47 0 1 1-9.98-5.38v3.66a2.82 2.82 0 1 0 2.82 2.82V.02z"/></svg>', color:'#010101', gradFrom:'#010101', gradTo:'#FF0050', fields:[{id:'appId',label:'App Key',type:'text'},{id:'appSecret',label:'App Secret',type:'password'},{id:'accessToken',label:'Access Token',type:'password'},{id:'username',label:'TikTok Username',type:'text'}] },
};
let _socialConnections = {};
let _currentPlatform = null;

async function renderSocial() {
  await loadSocialConnections();
  renderSocialPlatforms();
}

async function loadSocialConnections() {
  try {
    const h = authToken && authToken !== 'local' ? { Authorization: `Bearer ${authToken}` } : {};
    const r = await fetch(`${API}/social/connections`, { headers: h });
    if (r.ok) {
      const d = await r.json();
      _socialConnections = {};
      (d.connections || []).forEach(c => { _socialConnections[c.platform] = c; });
      return;
    }
  } catch {}
  _socialConnections = JSON.parse(localStorage.getItem('lb_social_cfg') || '{}');
}

function renderSocialPlatforms() {
  const container = document.getElementById('socialPlatforms');
  if (!container) return;
  container.innerHTML = Object.entries(SOCIAL_DEFS).map(([pid, p]) => {
    const conn = _socialConnections[pid];
    return `
    <div class="social-card">
      <div class="social-card-header" style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo})">
        <div class="social-card-icon">${p.icon}</div>
        <div class="social-card-name">${p.name}</div>
        ${conn ? '<div class="social-connected-badge">✓ Connected</div>' : ''}
      </div>
      <div class="social-card-body">
        ${conn ? `
          <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">${conn.pageName || conn.username || 'Connected'}</div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="viewSocialAnalytics('${pid}')">📊 Analytics</button>
            <button class="btn btn-ghost btn-sm" onclick="syncCatalog('${pid}')">🔄 Sync Catalog</button>
            <button class="btn btn-danger btn-sm" onclick="disconnectSocial('${pid}')">Disconnect</button>
          </div>
          ${conn.catalogSynced ? '<div style="font-size:.65rem;color:var(--accent2);margin-top:.5rem">✅ Catalog synced ' + (conn.lastSynced ? new Date(conn.lastSynced).toLocaleDateString() : '') + '</div>' : ''}
        ` : `
          <div style="font-size:.75rem;color:var(--muted);margin-bottom:.75rem">Connect your ${p.name} store to sync products and manage posts.</div>
          <button class="btn btn-primary btn-sm" onclick="openSocialConnect('${pid}')">+ Connect ${p.name}</button>
        `}
      </div>
    </div>`;
  }).join('');

  // Update analytics section
  const connected = Object.keys(_socialConnections);
  if (connected.length) {
    renderSocialAnalyticsCards(connected[0]);
  }
}

function openSocialConnect(platform) {
  _currentPlatform = platform;
  const p = SOCIAL_DEFS[platform];
  document.getElementById('modalSocialTitle').textContent = `${p.icon} Connect ${p.name}`;
  document.getElementById('modalSocialBody').innerHTML = `
    <div style="border-radius:12px;overflow:hidden;margin-bottom:1.25rem">
      <div style="background:linear-gradient(135deg,${p.gradFrom},${p.gradTo});padding:1.25rem;display:flex;align-items:center;gap:1rem">
        <div style="font-size:2.5rem">${p.icon}</div>
        <div><div style="font-weight:700;font-size:1.1rem;color:#fff">${p.name}</div>
        <div style="font-size:.72rem;color:rgba(255,255,255,.7)">Enter your ${p.name} developer credentials</div></div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:.75rem;margin-bottom:1rem;font-size:.72rem;color:var(--muted)">
      💡 Get your API keys from <a href="https://developers.facebook.com/apps" target="_blank" style="color:var(--accent2)">Facebook Developer Portal</a>
    </div>
    ${p.fields.map(f => `<div class="form-row"><label class="form-label">${f.label}</label><input class="form-input social-field" id="sf-${f.id}" type="${f.type}" placeholder="${f.type === 'password' ? '••••••' : f.label}" autocomplete="off"/></div>`).join('')}`;
  openModal('modalSocialConnect');
}

async function saveSocialConnect() {
  const pid = _currentPlatform;
  if (!pid) return;
  const p = SOCIAL_DEFS[pid];
  const body = { platform: pid };
  p.fields.forEach(f => { body[f.id] = document.getElementById(`sf-${f.id}`)?.value.trim(); });

  // Validate required non-optional fields
  const required = p.fields.filter(f => !f.label.includes('optional'));
  for (const f of required) {
    if (!body[f.id]) { showToast(`${f.label} is required`, 'error'); return; }
  }

  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/social/connect`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { showToast(d.error || 'Connection failed', 'error'); return; }
  } catch {}

  // Local save
  _socialConnections[pid] = { platform: pid, platformName: p.name, pageName: body.pageName || body.username, isActive: true, connectedAt: new Date().toISOString() };
  localStorage.setItem('lb_social_cfg', JSON.stringify(_socialConnections));
  closeModal('modalSocialConnect');
  renderSocialPlatforms();
  showToast(`${p.icon} ${p.name} connected!`, 'success');
}

async function disconnectSocial(pid) {
  if (!confirm(`Disconnect ${SOCIAL_DEFS[pid]?.name}?`)) return;
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    await fetch(`${API}/social/disconnect`, { method: 'POST', headers: h, body: JSON.stringify({ platform: pid }) });
  } catch {}
  delete _socialConnections[pid];
  localStorage.setItem('lb_social_cfg', JSON.stringify(_socialConnections));
  renderSocialPlatforms();
  showToast(`${SOCIAL_DEFS[pid]?.name} disconnected`, 'info');
}

async function syncCatalog(pid) {
  showToast(`Syncing catalog to ${SOCIAL_DEFS[pid]?.name}…`, 'info');
  try {
    const h = { 'Content-Type': 'application/json' };
    if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
    const r = await fetch(`${API}/social/sync-catalog`, { method: 'POST', headers: h, body: JSON.stringify({ platform: pid }) });
    const d = await r.json();
    if (_socialConnections[pid]) {
      _socialConnections[pid].catalogSynced = true;
      _socialConnections[pid].lastSynced = new Date().toISOString();
      localStorage.setItem('lb_social_cfg', JSON.stringify(_socialConnections));
    }
    renderSocialPlatforms();
    showToast(d.message || `Catalog synced!`, 'success');
  } catch {
    showToast('Sync failed. Check your API connection.', 'error');
  }
}

async function viewSocialAnalytics(pid) {
  const p = SOCIAL_DEFS[pid];
  document.getElementById('modalSocialAnalyticsTitle').textContent = `${p.icon} ${p.name} Analytics`;
  document.getElementById('modalSocialAnalyticsBody').innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Loading analytics…</div>';
  openModal('modalSocialAnalytics');
  try {
    const h = authToken && authToken !== 'local' ? { Authorization: `Bearer ${authToken}` } : {};
    const r = await fetch(`${API}/social/analytics/${pid}`, { headers: h });
    const d = await r.json();
    document.getElementById('modalSocialAnalyticsBody').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem">
        ${[['Followers',fmt2(d.followers),'👥'],['Likes',fmt2(d.likes),'❤️'],['Reach',fmt2(d.reach),'📡'],
           ['Impressions',fmt2(d.impressions),'👁'],['Link Clicks',fmt2(d.clicks),'🔗'],['Orders from Social',d.ordersFromSocial,'📦']].map(([lbl,val,ico])=>`
          <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:1rem;text-align:center">
            <div style="font-size:1.5rem">${ico}</div>
            <div style="font-size:1.2rem;font-weight:700;margin:.3rem 0">${val}</div>
            <div style="font-size:.68rem;color:var(--muted)">${lbl}</div>
          </div>`).join('')}
      </div>
      <div style="font-size:.75rem;color:var(--muted);font-weight:600;margin-bottom:.75rem">TOP POSTS</div>
      ${(d.topPosts||[]).map(post=>`
        <div style="display:flex;justify-content:space-between;padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.8rem">
          <div style="flex:1;color:var(--text)">${post.caption}</div>
          <div style="text-align:right;min-width:120px">
            <div style="color:var(--accent2)">❤️ ${fmt2(post.likes)}</div>
            <div style="color:var(--muted);font-size:.7rem">Reach: ${fmt2(post.reach)}</div>
          </div>
        </div>`).join('')}`;
  } catch {
    document.getElementById('modalSocialAnalyticsBody').innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Analytics unavailable. Check API connection.</p></div>';
  }
}

function renderSocialAnalyticsCards(pid) {
  const el = document.getElementById('socialAnalytics');
  if (!el || !pid) return;
  const p = SOCIAL_DEFS[pid] || {};
  const conn = _socialConnections[pid];
  if (!conn) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📱</div><p>Connect a channel to see analytics</p></div>';
    return;
  }
  el.innerHTML = `<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:.75rem">${
    Object.keys(_socialConnections).map(p2 => `<button class="btn ${p2===pid?'btn-primary':'btn-ghost'} btn-sm" onclick="renderSocialAnalyticsCards('${p2}')">${SOCIAL_DEFS[p2]?.icon} ${SOCIAL_DEFS[p2]?.name}</button>`).join('')
  }</div>
  <div style="text-align:center;padding:1.5rem;color:var(--muted)">
    <div style="font-size:2rem">${p.icon||'📊'}</div>
    <div style="margin:.5rem 0;font-size:.85rem">Click "📊 Analytics" on the platform card to view detailed stats</div>
    <button class="btn btn-ghost btn-sm" onclick="viewSocialAnalytics('${pid}')">View ${p.name} Analytics →</button>
  </div>`;
}

function openPublishModal() {
  const connected = Object.keys(_socialConnections);
  if (!connected.length) { showToast('Connect a social platform first', 'error'); return; }
  document.getElementById('publishPlatformPicker').innerHTML = connected.map(pid => {
    const p = SOCIAL_DEFS[pid];
    return `<label class="platform-pick-btn" id="pick-${pid}">
      <input type="checkbox" value="${pid}" style="display:none" onchange="togglePlatformPick('${pid}',this.checked)">
      <span class="platform-pick-inner">${p.icon} ${p.name}</span>
    </label>`;
  }).join('');
  document.getElementById('publishMessage').value = '';
  document.getElementById('publishImage').value = '';
  openModal('modalPublish');
}

function togglePlatformPick(pid, checked) {
  document.getElementById(`pick-${pid}`)?.classList.toggle('selected', checked);
}

async function doPublishPost() {
  const message = document.getElementById('publishMessage')?.value.trim();
  const imageUrl = document.getElementById('publishImage')?.value.trim();
  if (!message) { showToast('Write a message', 'error'); return; }
  const selected = [...document.querySelectorAll('#publishPlatformPicker input:checked')].map(i => i.value);
  if (!selected.length) { showToast('Select at least one platform', 'error'); return; }

  let successCount = 0;
  for (const pid of selected) {
    try {
      const h = { 'Content-Type': 'application/json' };
      if (authToken && authToken !== 'local') h.Authorization = `Bearer ${authToken}`;
      const r = await fetch(`${API}/social/publish-post`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ platform: pid, message, imageUrl }),
      });
      const d = await r.json();
      if (d.success || r.ok) successCount++;
    } catch {}
  }

  closeModal('modalPublish');
  // Add to posts UI
  const postsEl = document.getElementById('socialPosts');
  if (postsEl) {
    const existing = postsEl.innerHTML.includes('empty-state') ? '' : postsEl.innerHTML;
    postsEl.innerHTML = `<div style="padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.06)">
      <div style="font-size:.75rem;color:var(--muted)">${selected.map(p=>SOCIAL_DEFS[p]?.icon).join(' ')} · Just now</div>
      <div style="font-size:.85rem;margin-top:.25rem">${message.substring(0,120)}${message.length>120?'…':''}</div>
    </div>` + existing;
  }
  showToast(`Post published to ${successCount} platform${successCount!==1?'s':''}! 🎉`, 'success');
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmt2(n) {
  n = parseInt(n || 0);
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
  return n.toString();
}

// Override showToast to use the new premium stacking toast UI
window.showToast = function(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.innerHTML = `<div>${icons[type] || '🔔'}</div><div style="flex:1">${msg}</div>`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px) translateX(20px)';
    setTimeout(() => t.remove(), 300);
  }, 4000);
};
