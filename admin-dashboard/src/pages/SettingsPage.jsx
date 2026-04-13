import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Save, Eye, EyeOff, CheckCircle, XCircle, AlertTriangle,
  Store, CreditCard, Truck, Bell, Shield, User, Lock, AtSign, RefreshCw, ExternalLink,
  ChevronDown, ChevronRight
} from 'lucide-react';

// ── Real brand logo URLs (official sources, no AI icons) ─────────────────────
const LOGOS = {
  stripe:     'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
  paypal:     'https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg',
  khalti:     'https://khalti.com/favicon.ico',
  esewa:      'https://esewa.com.np/common/images/esewa_logo.png',
  nabil:      'https://www.google.com/s2/favicons?domain=nabilbank.com&sz=64',
  visa:       'https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg',
  mastercard: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg',
  amex:       'https://upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_%282018%29.svg',
  applepay:   'https://upload.wikimedia.org/wikipedia/commons/b/b0/Apple_Pay_logo.svg',
  googlepay:  'https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg',
  afterpay:   'https://upload.wikimedia.org/wikipedia/commons/4/41/Afterpay_logo_2020.svg',
  chitchats:  'https://chitchats.com/favicon.ico',
  auspost:    'https://auspost.com.au/favicon.ico',
  nzpost:     'https://www.nzpost.co.nz/favicon.ico',
  japanpost:  'https://www.post.japanpost.jp/favicon.ico',
  pathao:     'https://pathao.com/favicon.ico',
  sendgrid:   'https://sendgrid.com/favicon.ico',
  twilio:     'https://www.twilio.com/favicon.ico',
};

// ── Nav items ──────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'store',      label: 'Store details',       icon: Store },
  { id: 'account',    label: 'Account',              icon: User },
  { id: 'payments',   label: 'Payments',             icon: CreditCard },
  { id: 'shipping',   label: 'Shipping & logistics', icon: Truck },
  { id: 'notifications', label: 'Notifications',    icon: Bell },
  { id: 'security',   label: 'Security & team',     icon: Shield },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusPill({ active }) {
  return active
    ? <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-400"><CheckCircle size={10} /> Active</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white/8 text-white/50"><XCircle size={10} /> Not configured</span>;
}

function SecretInput({ label, value, onChange, placeholder, hint }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">{label}</label>
      {hint && !value && (
        <p className="text-xs text-white/40 mb-1">Current: <span className="font-mono text-white/50">{hint}</span></p>
      )}
      <div className="flex">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={hint ? `Leave blank to keep current (${hint})` : placeholder}
          className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-white/30"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="px-3 bg-white/8 border border-l-0 border-white/10 rounded-r-lg text-white/50 hover:text-zinc-100"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, type = 'text', readOnly }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
      />
    </div>
  );
}

function ModeToggle({ label, value, onChange }) {
  const isLive = value === 'live';
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-white/80">{label}</span>
      <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-medium">
        <button
          onClick={() => onChange('test')}
          className={`px-3 py-1.5 transition-colors ${!isLive ? 'bg-amber-500 text-black' : 'bg-white/5 text-white/50 hover:text-zinc-100'}`}
        >
          Test
        </button>
        <button
          onClick={() => onChange('live')}
          className={`px-3 py-1.5 transition-colors ${isLive ? 'bg-green-500 text-black' : 'bg-white/5 text-white/50 hover:text-zinc-100'}`}
        >
          Live
        </button>
      </div>
    </div>
  );
}

function GatewayCard({ logo, name, description, status, children, docUrl }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/8 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-white/5/40 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="w-24 h-10 flex items-center justify-center bg-white rounded-lg p-1.5 flex-shrink-0">
          <img src={logo} alt={name} className="max-h-full max-w-full object-contain" onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
          <span style={{display:'none'}} className="text-black text-xs font-bold">{name}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{name}</span>
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-white/40 hover:text-white/60">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusPill active={status} />
          {open ? <ChevronDown size={16} className="text-white/40" /> : <ChevronRight size={16} className="text-white/40" />}
        </div>
      </div>
      {open && (
        <div className="border-t border-white/8 p-4 space-y-4 bg-[#111]/50">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState('store');
  const [settings, setSettings] = useState({});
  const [gatewayStatus, setGatewayStatus] = useState({});
  const [pending, setPending] = useState({}); // unsaved field values
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      const [sData, gData] = await Promise.all([
        apiFetch('/settings'),
        apiFetch('/settings/gateway-status').catch(() => ({ status: {} })),
      ]);
      const s = {};
      Object.entries(sData.settings || {}).forEach(([k, v]) => { s[k] = v; });
      setSettings(s);
      setGatewayStatus(gData.status || {});
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (entries) => {
    setSaving(true);
    try {
      // Filter out blank entries (don't overwrite with empty)
      const toSave = Object.fromEntries(
        Object.entries(entries).filter(([, v]) => v !== '' && v !== undefined)
      );
      if (!Object.keys(toSave).length) { setSaving(false); return; }
      await apiFetch('/settings', { method: 'PUT', body: toSave });
      setSettings(prev => ({ ...prev, ...toSave }));
      setPending(prev => {
        const next = { ...prev };
        Object.keys(toSave).forEach(k => delete next[k]);
        return next;
      });
      setSavedKey(Object.keys(toSave).join(','));
      setTimeout(() => setSavedKey(''), 2500);
      await load(); // Refresh gateway status
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key) => pending[key] !== undefined ? pending[key] : (settings[key] || '');
  const setField = (key, val) => setPending(prev => ({ ...prev, [key]: val }));

  const SaveBtn = ({ keys, label }) => (
    <button
      onClick={() => saveSettings(Object.fromEntries(keys.map(k => [k, field(k)])))}
      disabled={saving}
      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
    >
      {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
      {label || 'Save'}
    </button>
  );

  if (loadError) return (
    <div className="flex items-center gap-2 text-red-400 p-4">
      <AlertTriangle size={16} /> Failed to load settings: {loadError}
    </div>
  );

  return (
    <div className="flex gap-6 max-w-6xl">
      {/* Settings nav */}
      <aside className="w-52 flex-shrink-0">
        <nav className="space-y-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                section === id
                  ? 'bg-white/5 text-zinc-100 font-medium'
                  : 'text-white/50 hover:text-zinc-100 hover:bg-white/5/50'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Settings content */}
      <div className="flex-1 min-w-0 space-y-6">
        {savedKey && (
          <div className="flex items-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 text-sm">
            <CheckCircle size={14} /> Settings saved successfully.
          </div>
        )}

        {/* ── Store Details ─────────────────────────────────────────────── */}
        {section === 'store' && (
          <>
            <div>
              <h2 className="text-lg font-semibold mb-1">Store details</h2>
              <p className="text-sm text-white/40">Basic information about your Lwang Black store.</p>
            </div>

            <div className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-white/80 border-b border-white/8 pb-2">General</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Store name" value={field('store_name')} onChange={v => setField('store_name', v)} placeholder="Lwang Black" />
                <TextInput label="Support email" value={field('support_email')} onChange={v => setField('support_email', v)} placeholder="support@lwangblack.co" type="email" />
                <TextInput label="WhatsApp number" value={field('whatsapp')} onChange={v => setField('whatsapp', v)} placeholder="+977 9800000000" />
                <TextInput label="Website URL" value={field('site_url')} onChange={v => setField('site_url', v)} placeholder="https://lwangblack.co" />
              </div>
              <SaveBtn keys={['store_name','support_email','whatsapp','site_url']} />
            </div>

            <div className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-white/80 border-b border-white/8 pb-2">Regional</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Default currency" value={field('default_currency')} onChange={v => setField('default_currency', v)} placeholder="USD" />
                <TextInput label="Timezone" value={field('timezone')} onChange={v => setField('timezone', v)} placeholder="Asia/Kathmandu" />
              </div>
              <SaveBtn keys={['default_currency','timezone']} />
            </div>

            {/* Quick account link */}
            <div className="bg-white/3 border border-white/8 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setSection('account')}>
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {(user?.username?.[0]||'A').toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{user?.name || user?.username}</p>
                <p className="text-xs text-white/40 capitalize">{user?.role} · {user?.email || 'No email'}</p>
              </div>
              <button className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1">
                <User size={13}/> Manage account →
              </button>
            </div>
          </>
        )}

        {/* ── Account ─────────────────────────────────────────────────── */}
        {section === 'account' && (
          <>
            <div>
              <h2 className="text-lg font-semibold mb-1">Account</h2>
              <p className="text-sm text-white/40">Update your profile, change your username, and reset your password.</p>
            </div>
            <ProfileForm user={user} />
            <UsernameForm />
            <PasswordForm />
          </>
        )}

        {/* ── Payments ──────────────────────────────────────────────────── */}
        {section === 'payments' && (
          <>
            <div>
              <h2 className="text-lg font-semibold mb-1">Payments</h2>
              <p className="text-sm text-white/40">Configure payment providers. Keys are stored securely in the database and used immediately — no server restart required.</p>
            </div>

            {/* Accepted card brands (informational) */}
            <div className="bg-[#111] border border-white/8 rounded-xl p-4">
              <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Accepted payment methods</p>
              <div className="flex flex-wrap gap-2 items-center">
                {[
                  { key:'visa',       label:'Visa' },
                  { key:'mastercard', label:'Mastercard' },
                  { key:'amex',       label:'Amex' },
                  { key:'applepay',   label:'Apple Pay' },
                  { key:'googlepay',  label:'Google Pay' },
                  { key:'afterpay',   label:'Afterpay' },
                  { key:'paypal',     label:'PayPal' },
                  { key:'khalti',     label:'Khalti' },
                  { key:'esewa',      label:'eSewa' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 h-9">
                    <img src={LOGOS[key]} alt={label} className="h-5 w-auto object-contain"
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }} />
                    <span style={{display:'none'}} className="text-black text-xs font-semibold">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stripe */}
            <GatewayCard
              logo={LOGOS.stripe}
              name="Stripe"
              description="Accept Visa, Mastercard, AMEX, Apple Pay, Google Pay, and Afterpay globally."
              status={gatewayStatus.stripe?.enabled}
              docUrl="https://dashboard.stripe.com/apikeys"
            >
              <ModeToggle label="Mode" value={field('stripe_mode') || gatewayStatus.stripe?.mode || 'test'} onChange={v => setField('stripe_mode', v)} />
              <SecretInput
                label="Secret key"
                value={pending.stripe_secret_key || ''}
                onChange={v => setField('stripe_secret_key', v)}
                placeholder="sk_live_..."
                hint={gatewayStatus.stripe?.secretKeyHint}
              />
              <TextInput
                label="Publishable key"
                value={field('stripe_publishable_key')}
                onChange={v => setField('stripe_publishable_key', v)}
                placeholder="pk_live_..."
              />
              <SecretInput
                label="Webhook signing secret"
                value={pending.stripe_webhook_secret || ''}
                onChange={v => setField('stripe_webhook_secret', v)}
                placeholder="whsec_..."
                hint={gatewayStatus.stripe?.hasWebhook ? '••••••••' : ''}
              />
              <div className="bg-white/5/60 rounded-lg p-3 text-xs text-white/50 space-y-1">
                <p>Webhook endpoint: <span className="font-mono text-white/60">/api/payments/stripe-webhook</span></p>
                <p>Events to listen for: <span className="font-mono">checkout.session.completed</span>, <span className="font-mono">payment_intent.payment_failed</span></p>
              </div>
              <SaveBtn keys={['stripe_secret_key','stripe_publishable_key','stripe_webhook_secret','stripe_mode']} label="Save Stripe settings" />
            </GatewayCard>

            {/* PayPal */}
            <GatewayCard
              logo={LOGOS.paypal}
              name="PayPal"
              description="Accept PayPal payments worldwide with buyer protection."
              status={gatewayStatus.paypal?.enabled}
              docUrl="https://developer.paypal.com/api/rest/"
            >
              <ModeToggle label="Mode" value={field('paypal_mode') || gatewayStatus.paypal?.mode || 'sandbox'} onChange={v => setField('paypal_mode', v)} />
              <TextInput
                label="Client ID"
                value={field('paypal_client_id')}
                onChange={v => setField('paypal_client_id', v)}
                placeholder="AaBbCcDd..."
              />
              <SecretInput
                label="Client Secret"
                value={pending.paypal_client_secret || ''}
                onChange={v => setField('paypal_client_secret', v)}
                placeholder="EeFfGgHh..."
                hint={gatewayStatus.paypal?.hasSecret ? '••••••••' : ''}
              />
              <SaveBtn keys={['paypal_client_id','paypal_client_secret','paypal_mode']} label="Save PayPal settings" />
            </GatewayCard>

            {/* Khalti (Nepal) */}
            <GatewayCard
              logo={LOGOS.khalti}
              name="Khalti"
              description="Nepal digital wallet. Accepts Khalti balance, eSewa, bank transfers."
              status={gatewayStatus.khalti?.enabled}
              docUrl="https://khalti.com/api/v2/"
            >
              <ModeToggle label="Mode" value={field('khalti_mode') || gatewayStatus.khalti?.mode || 'test'} onChange={v => setField('khalti_mode', v)} />
              <SecretInput
                label="Live Secret Key"
                value={pending.khalti_secret_key || ''}
                onChange={v => setField('khalti_secret_key', v)}
                placeholder="live_secret_key_..."
                hint={gatewayStatus.khalti?.keyHint}
              />
              <SaveBtn keys={['khalti_secret_key','khalti_mode']} label="Save Khalti settings" />
            </GatewayCard>

            {/* eSewa (Nepal) */}
            <GatewayCard
              logo={LOGOS.esewa}
              name="eSewa"
              description="Nepal's leading digital wallet and payment gateway."
              status={gatewayStatus.esewa?.enabled}
              docUrl="https://developer.esewa.com.np/"
            >
              <ModeToggle label="Mode" value={field('esewa_mode') || gatewayStatus.esewa?.mode || 'test'} onChange={v => setField('esewa_mode', v)} />
              <TextInput
                label="Merchant ID (Product Code)"
                value={field('esewa_merchant_id')}
                onChange={v => setField('esewa_merchant_id', v)}
                placeholder="EPAYTEST"
              />
              <SecretInput
                label="Secret Key"
                value={pending.esewa_secret_key || ''}
                onChange={v => setField('esewa_secret_key', v)}
                placeholder="8gBm/:&EnhH.1/q"
                hint={gatewayStatus.esewa?.hasSecret ? '••••••••' : ''}
              />
              <SaveBtn keys={['esewa_merchant_id','esewa_secret_key','esewa_mode']} label="Save eSewa settings" />
            </GatewayCard>

            {/* Nabil Bank (Nepal) */}
            <GatewayCard
              logo={LOGOS.nabil}
              name="Nabil Bank"
              description="Nepal's Nabil Bank hosted payment gateway for card and direct bank payments."
              status={gatewayStatus.nabil?.enabled}
              docUrl="https://www.nabilbank.com"
            >
              <ModeToggle label="Mode" value={field('nabil_mode') || gatewayStatus.nabil?.mode || 'test'} onChange={v => setField('nabil_mode', v)} />
              <TextInput
                label="Merchant ID"
                value={field('nabil_merchant_id')}
                onChange={v => setField('nabil_merchant_id', v)}
                placeholder="NB_MERCHANT_ID"
              />
              <SecretInput
                label="Secret Key"
                value={pending.nabil_secret_key || ''}
                onChange={v => setField('nabil_secret_key', v)}
                placeholder="nabil_secret_..."
                hint={gatewayStatus.nabil?.hasSecret ? '••••••••' : ''}
              />
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
                <p className="font-medium mb-1">Bank details for manual transfers</p>
                <p>Bank: Nabil Bank Ltd. · Beneficiary: LWANG BLACK PRODUCTS PVT.LTD</p>
                <p>Account: <span className="font-mono font-bold">15301017500402</span></p>
              </div>
              <SaveBtn keys={['nabil_merchant_id','nabil_secret_key','nabil_mode']} label="Save Nabil Bank settings" />
            </GatewayCard>
          </>
        )}

        {/* ── Shipping & Logistics ───────────────────────────────────────── */}
        {section === 'shipping' && (
          <>
            <div>
              <h2 className="text-lg font-semibold mb-1">Shipping & logistics</h2>
              <p className="text-sm text-white/40">Configure shipping carriers. Keys are used live for rate calculation, label generation, and tracking.</p>
            </div>

            {/* Canada */}
            <GatewayCard
              logo={LOGOS.chitchats}
              name="Chit Chats (Canada)"
              description="Canada logistics provider for all CA shipments."
              status={gatewayStatus.chitchats?.enabled}
              docUrl="https://chitchats.com/"
            >
              <SecretInput
                label="API Key"
                value={pending.chitchats_api_key || ''}
                onChange={v => setField('chitchats_api_key', v)}
                placeholder="chitchats_api_key"
                hint={gatewayStatus.chitchats?.keyHint}
              />
              <SaveBtn keys={['chitchats_api_key']} label="Save Chit Chats settings" />
            </GatewayCard>

            {/* Australia + International */}
            <GatewayCard
              logo={LOGOS.auspost}
              name="Australia Post (AU + International)"
              description="Primary carrier for Australia and all other international countries."
              status={gatewayStatus.auspost?.enabled}
              docUrl="https://auspost.com.au/"
            >
              <SecretInput
                label="API Key"
                value={pending.auspost_api_key || ''}
                onChange={v => setField('auspost_api_key', v)}
                placeholder="auspost_api_key"
                hint={gatewayStatus.auspost?.keyHint}
              />
              <SaveBtn keys={['auspost_api_key']} label="Save Australia Post settings" />
            </GatewayCard>

            {/* New Zealand */}
            <GatewayCard
              logo={LOGOS.nzpost}
              name="NZ Post (New Zealand)"
              description="Dedicated carrier for New Zealand shipments."
              status={gatewayStatus.nzpost?.enabled}
              docUrl="https://www.nzpost.co.nz/"
            >
              <SecretInput
                label="API Key"
                value={pending.nzpost_api_key || ''}
                onChange={v => setField('nzpost_api_key', v)}
                placeholder="nzpost_api_key"
                hint={gatewayStatus.nzpost?.keyHint}
              />
              <SaveBtn keys={['nzpost_api_key']} label="Save NZ Post settings" />
            </GatewayCard>

            {/* Japan */}
            <GatewayCard
              logo={LOGOS.japanpost}
              name="Japan Post (Japan)"
              description="Dedicated carrier for Japan shipments."
              status={gatewayStatus.japanpost?.enabled}
              docUrl="https://www.post.japanpost.jp/"
            >
              <SecretInput
                label="API Key"
                value={pending.japanpost_api_key || ''}
                onChange={v => setField('japanpost_api_key', v)}
                placeholder="japanpost_api_key"
                hint={gatewayStatus.japanpost?.keyHint}
              />
              <SaveBtn keys={['japanpost_api_key']} label="Save Japan Post settings" />
            </GatewayCard>

            {/* Nepal */}
            <GatewayCard
              logo={LOGOS.pathao}
              name="Pathao (Nepal)"
              description="Dedicated logistics provider for Nepal shipments."
              status={gatewayStatus.pathao?.enabled}
              docUrl="https://pathao.com/np/"
            >
              <SecretInput
                label="API Key"
                value={pending.pathao_api_key || ''}
                onChange={v => setField('pathao_api_key', v)}
                placeholder="pathao_api_key"
                hint={gatewayStatus.pathao?.keyHint}
              />
              <SaveBtn keys={['pathao_api_key']} label="Save Pathao settings" />
            </GatewayCard>
          </>
        )}

        {/* ── Notifications ─────────────────────────────────────────────── */}
        {section === 'notifications' && (
          <>
            <div>
              <h2 className="text-lg font-semibold mb-1">Notifications</h2>
              <p className="text-sm text-white/40">Configure email and SMS providers for order confirmations, shipping updates, and refund notices.</p>
            </div>

            {/* SendGrid */}
            <GatewayCard
              logo={LOGOS.sendgrid}
              name="SendGrid"
              description="Transactional email for order confirmations, invoices, and shipping updates."
              status={gatewayStatus.sendgrid?.enabled}
              docUrl="https://app.sendgrid.com/settings/api_keys"
            >
              <SecretInput
                label="API Key"
                value={pending.sendgrid_api_key || ''}
                onChange={v => setField('sendgrid_api_key', v)}
                placeholder="SG...."
                hint={gatewayStatus.sendgrid?.hasKey ? '••••••••' : ''}
              />
              <TextInput
                label="From email address"
                value={field('sendgrid_from_email') || gatewayStatus.sendgrid?.fromEmail || ''}
                onChange={v => setField('sendgrid_from_email', v)}
                placeholder="orders@lwangblack.co"
                type="email"
              />
              <TextInput
                label="From name"
                value={field('sendgrid_from_name')}
                onChange={v => setField('sendgrid_from_name', v)}
                placeholder="Lwang Black"
              />
              <SaveBtn keys={['sendgrid_api_key','sendgrid_from_email','sendgrid_from_name']} label="Save SendGrid settings" />
            </GatewayCard>

            {/* Twilio */}
            <GatewayCard
              logo={LOGOS.twilio}
              name="Twilio SMS"
              description="SMS order notifications and shipping updates sent directly to customers."
              status={gatewayStatus.twilio?.enabled}
              docUrl="https://console.twilio.com/"
            >
              <TextInput label="Account SID" value={field('twilio_account_sid')} onChange={v => setField('twilio_account_sid', v)} placeholder="ACxxxxxxxx" />
              <SecretInput
                label="Auth Token"
                value={pending.twilio_auth_token || ''}
                onChange={v => setField('twilio_auth_token', v)}
                placeholder="twilio_auth_token"
                hint={gatewayStatus.twilio?.hasToken ? '••••••••' : ''}
              />
              <TextInput
                label="From phone number"
                value={field('twilio_phone') || gatewayStatus.twilio?.fromPhone || ''}
                onChange={v => setField('twilio_phone', v)}
                placeholder="+15551234567"
              />
              <SaveBtn keys={['twilio_account_sid','twilio_auth_token','twilio_phone']} label="Save Twilio settings" />
            </GatewayCard>
          </>
        )}

        {/* ── Security & Team ───────────────────────────────────────────── */}
        {section === 'security' && (
          <>
            <div>
              <h2 className="text-lg font-semibold mb-1">Security & team</h2>
              <p className="text-sm text-white/40">Manage staff accounts, subscriptions, and session security.</p>
            </div>

            {/* Quick links to account settings */}
            <div className="bg-white/3 border border-white/8 rounded-xl divide-y divide-white/6">
              {[
                { icon: AtSign, label: 'Change username', desc: 'Update your login username', action: () => setSection('account') },
                { icon: Lock,   label: 'Change password', desc: 'Update your password',       action: () => setSection('account') },
                { icon: User,   label: 'Edit profile',    desc: 'Update your name and email', action: () => setSection('account') },
              ].map(({ icon: Icon, label, desc, action }) => (
                <button key={label} onClick={action}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left">
                  <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-white/60" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-white/40">{desc}</p>
                  </div>
                  <span className="text-white/25 text-xs">→</span>
                </button>
              ))}
            </div>

            {/* Owner-only: manage manager subscriptions */}
            {user?.role === 'owner' && <TeamSubscriptions />}

            <DangerZone />
          </>
        )}
      </div>
    </div>
  );
}

// ── ProfileForm ──────────────────────────────────────────────────────────────
function ProfileForm({ user }) {
  const { verify } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '' });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true); setStatus('');
    try {
      const data = await apiFetch('/auth/update-profile', { method: 'POST', body: form });
      setStatus('Profile updated successfully.');
      await verify();
    } catch (err) { setStatus('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-white/8">
        <User size={15} className="text-white/50"/>
        <h3 className="text-sm font-semibold">Profile</h3>
        <span className="ml-auto text-xs text-white/30 capitalize">{user?.role}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/50 block mb-1">Display name</label>
          <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))}
            placeholder={user?.username}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
        </div>
        <div>
          <label className="text-xs text-white/50 block mb-1">Email address</label>
          <input type="email" value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))}
            placeholder="admin@lwangblack.com"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
        </div>
        <div>
          <label className="text-xs text-white/50 block mb-1">Phone</label>
          <input value={form.phone} onChange={e => setForm(p=>({...p,phone:e.target.value}))}
            placeholder="+977 9800000000"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
        </div>
        <div>
          <label className="text-xs text-white/50 block mb-1">Username (read-only)</label>
          <input value={user?.username || ''} disabled
            className="w-full bg-white/3 border border-white/6 rounded-lg px-3 py-2 text-sm text-white/40 cursor-not-allowed" />
        </div>
      </div>

      {status && (
        <p className={`text-xs px-3 py-2 rounded-lg ${status.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-green-400'}`}>
          {status}
        </p>
      )}
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors">
        <Save size={14}/> {saving ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
}

// ── UsernameForm ─────────────────────────────────────────────────────────────
function UsernameForm() {
  const [newUsername, setNewUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!newUsername.trim() || !password) return setStatus('Error: Both fields are required.');
    if (newUsername.length < 3) return setStatus('Error: Username must be at least 3 characters.');
    setSaving(true); setStatus('');
    try {
      await apiFetch('/auth/change-username', { method: 'POST', body: { newUsername: newUsername.trim(), password } });
      setStatus('Username changed! You will be logged out to re-login with your new username.');
      setTimeout(() => { localStorage.clear(); window.location.href = '/login'; }, 2500);
    } catch (err) { setStatus('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-white/8">
        <AtSign size={15} className="text-white/50"/>
        <h3 className="text-sm font-semibold">Change username</h3>
      </div>
      <p className="text-xs text-white/40">After changing your username you will be logged out and must sign in with the new username.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/50 block mb-1">New username</label>
          <input value={newUsername} onChange={e => setNewUsername(e.target.value)}
            placeholder="new_username"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
        </div>
        <div>
          <label className="text-xs text-white/50 block mb-1">Current password (to confirm)</label>
          <div className="flex">
            <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter your current password"
              className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
            <button type="button" onClick={() => setShow(!show)}
              className="px-3 bg-white/5 border border-l-0 border-white/10 rounded-r-lg text-white/40 hover:text-white transition-colors">
              {show ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
          </div>
        </div>
      </div>
      {status && (
        <p className={`text-xs px-3 py-2 rounded-lg ${status.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-green-400'}`}>
          {status}
        </p>
      )}
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors">
        <AtSign size={14}/> {saving ? 'Saving…' : 'Change username'}
      </button>
    </div>
  );
}

// ── PasswordForm ─────────────────────────────────────────────────────────────
function PasswordForm() {
  const [form, setForm] = useState({ current: '', newPw: '', confirm: '' });
  const [show, setShow] = useState({ current: false, newPw: false, confirm: false });
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({...p, [k]: v}));
  const tog = (k) => setShow(p => ({...p, [k]: !p[k]}));

  const strength = (pw) => {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  };
  const pwStrength = strength(form.newPw);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][pwStrength];
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-400', 'bg-green-400'][pwStrength];

  const save = async () => {
    if (!form.current || !form.newPw || !form.confirm) return setStatus('Error: All fields are required.');
    if (form.newPw.length < 8) return setStatus('Error: New password must be at least 8 characters.');
    if (form.newPw !== form.confirm) return setStatus('Error: New passwords do not match.');
    setSaving(true); setStatus('');
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: { currentPassword: form.current, newPassword: form.newPw } });
      setStatus('Password changed successfully! Please log in again.');
      setForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => { localStorage.clear(); window.location.href = '/login'; }, 2500);
    } catch (err) { setStatus('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const PwInput = ({ field, label, placeholder }) => (
    <div>
      <label className="text-xs text-white/50 block mb-1">{label}</label>
      <div className="flex">
        <input
          type={show[field] ? 'text' : 'password'}
          value={form[field]}
          onChange={e => set(field, e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-white/5 border border-white/10 rounded-l-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        />
        <button type="button" onClick={() => tog(field)}
          className="px-3 bg-white/5 border border-l-0 border-white/10 rounded-r-lg text-white/40 hover:text-white transition-colors">
          {show[field] ? <EyeOff size={14}/> : <Eye size={14}/>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-white/8">
        <Lock size={15} className="text-white/50"/>
        <h3 className="text-sm font-semibold">Change password</h3>
      </div>

      <PwInput field="current"  label="Current password" placeholder="Enter your current password" />
      <PwInput field="newPw"    label="New password" placeholder="Min. 8 characters" />

      {/* Password strength meter */}
      {form.newPw.length > 0 && (
        <div>
          <div className="flex gap-1 mb-1">
            {[1,2,3,4].map(i => (
              <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= pwStrength ? strengthColor : 'bg-white/10'}`}/>
            ))}
          </div>
          <p className="text-[10px] text-white/40">{strengthLabel} password</p>
        </div>
      )}

      <PwInput field="confirm"  label="Confirm new password" placeholder="Repeat new password" />

      {/* Validation checklist */}
      {form.newPw.length > 0 && (
        <ul className="space-y-1">
          {[
            { ok: form.newPw.length >= 8,           text: 'At least 8 characters' },
            { ok: /[A-Z]/.test(form.newPw),          text: 'One uppercase letter' },
            { ok: /[0-9]/.test(form.newPw),          text: 'One number' },
            { ok: form.newPw === form.confirm && form.confirm.length > 0, text: 'Passwords match' },
          ].map(({ ok, text }) => (
            <li key={text} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-400' : 'text-white/30'}`}>
              {ok ? <CheckCircle size={11}/> : <div className="w-[11px] h-[11px] rounded-full border border-white/20"/>}
              {text}
            </li>
          ))}
        </ul>
      )}

      {status && (
        <p className={`text-xs px-3 py-2 rounded-lg ${status.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-green-400'}`}>
          {status}
        </p>
      )}
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors">
        <Lock size={14}/> {saving ? 'Updating…' : 'Update password'}
      </button>
    </div>
  );
}

// ── TeamSubscriptions (owner only) ───────────────────────────────────────────
function TeamSubscriptions() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [granting, setGranting] = useState('');
  const [revoking, setRevoking] = useState('');
  const [msg, setMsg]           = useState('');

  const load = () => {
    setLoading(true);
    apiFetch('/subscription/all')
      .then(d => setManagers(d.managers || []))
      .catch(() => setManagers([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const grant = async (userId, days = 30) => {
    setGranting(userId);
    try {
      const d = await apiFetch('/subscription/grant', { method: 'POST', body: { userId, days } });
      setMsg(`✓ ${d.message}`);
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setGranting(''); }
  };

  const revoke = async (userId) => {
    if (!window.confirm('Revoke this manager\'s access immediately?')) return;
    setRevoking(userId);
    try {
      const d = await apiFetch('/subscription/revoke', { method: 'POST', body: { userId } });
      setMsg(`✓ ${d.message}`);
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setRevoking(''); }
  };

  return (
    <div className="bg-[#111] border border-white/8 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Team subscriptions</h3>
          <p className="text-xs text-white/40 mt-0.5">Grant or revoke manager dashboard access. Payment: $99/month per manager.</p>
        </div>
        <button onClick={load} className="p-1.5 hover:bg-white/8 rounded-lg text-white/40 hover:text-white transition-colors">
          <RefreshCw size={14}/>
        </button>
      </div>

      {msg && (
        <div className={`px-5 py-3 text-xs border-b border-white/8 ${msg.startsWith('Error') ? 'text-red-400 bg-red-500/5' : 'text-green-400 bg-green-500/5'}`}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="px-5 py-8 text-center text-white/30 text-sm">Loading managers…</div>
      ) : (
        <div className="divide-y divide-white/5">
          {managers.map(m => {
            const { active, expires, daysLeft } = m.subscription;
            return (
              <div key={m.id} className="px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(m.username?.[0] || 'M').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.name || m.username}</p>
                  <p className="text-xs text-white/40">{m.email || m.username} · {m.country || 'Global'}</p>
                </div>
                <div className="text-right flex-shrink-0 mr-3">
                  {active ? (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white font-medium">Active</span>
                      <p className="text-[10px] text-white/30 mt-1">{daysLeft}d left · expires {new Date(expires).toLocaleDateString()}</p>
                    </>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30">Inactive</span>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => grant(m.id, 30)}
                    disabled={granting === m.id}
                    title="Grant 30 days access"
                    className="text-xs px-3 py-1.5 rounded-lg bg-white text-black font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors"
                  >
                    {granting === m.id ? '…' : active ? 'Extend 30d' : 'Grant 30d'}
                  </button>
                  {active && (
                    <button
                      onClick={() => revoke(m.id)}
                      disabled={revoking === m.id}
                      title="Revoke access"
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                    >
                      {revoking === m.id ? '…' : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {managers.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-white/30">No manager accounts found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Danger Zone ───────────────────────────────────────────────────────────────
function DangerZone() {
  const [confirm, setConfirm] = useState('');
  const [result, setResult] = useState('');

  const dangerAction = async (endpoint, label) => {
    if (!window.confirm(`Are you sure you want to ${label}? This cannot be undone.`)) return;
    try {
      const data = await apiFetch(`/settings/danger/${endpoint}`, { method: 'POST' });
      setResult(data.message || 'Done');
    } catch (err) {
      setResult('Error: ' + err.message);
    }
  };

  return (
    <div className="bg-[#111] border border-red-500/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-red-400">
        <AlertTriangle size={16} />
        <h3 className="text-sm font-semibold">Danger zone</h3>
      </div>
      <p className="text-xs text-white/40">These actions are irreversible. Proceed with extreme caution.</p>

      {result && (
        <div className="bg-white/5 rounded-lg p-2.5 text-xs text-white/80 font-mono">{result}</div>
      )}

      <div className="space-y-3">
        {[
          { label: 'Force logout all users', key: 'force-logout', color: 'text-white/60' },
          { label: 'Clear all orders', key: 'clear-orders', color: 'text-red-400' },
          { label: 'Clear all customers', key: 'clear-customers', color: 'text-red-400' },
          { label: 'Reset settings to defaults', key: 'reset', color: 'text-red-400' },
        ].map(({ label, key, color }) => (
          <div key={key} className="flex items-center justify-between py-2 border-b border-white/8">
            <span className={`text-sm ${color}`}>{label}</span>
            <button
              onClick={() => dangerAction(key, label.toLowerCase())}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {label}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
