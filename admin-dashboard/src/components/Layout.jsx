import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

// ── Pixel-perfect SVG icons ───────────────────────────────────────────────────
const I = {
  Home:          () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h4v-4h2v4h4a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg>,
  Orders:        () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path fillRule="evenodd" d="M4 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H4zm1 2h10v10H5V5zm2 2a1 1 0 000 2h6a1 1 0 000-2H7zm0 4a1 1 0 000 2h4a1 1 0 000-2H7z" clipRule="evenodd"/></svg>,
  Products:      () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z"/></svg>,
  Customers:     () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>,
  Marketing:     () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>,
  Discounts:     () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>,
  Analytics:     () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd"/></svg>,
  Finance:       () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/></svg>,
  Logistics:     () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm7 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM3 4a1 1 0 00-1 1v8a1 1 0 001 1h.05a2.5 2.5 0 014.9 0H11a2.5 2.5 0 014.9 0H17a1 1 0 001-1V8l-3-4H3V4z"/></svg>,
  Notifications: () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 002-2H8a2 2 0 002 2z"/></svg>,
  Settings:      () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>,
  Logout:        () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-[17px] h-[17px]"><path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd"/></svg>,
  Menu:          () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/></svg>,
  Close:         () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>,
  Crown:         () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>,
  Shield:        () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>,
  Check:         () => <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>,
};

const NAV_SECTIONS = [
  {
    items: [
      { to: '/',          icon: I.Home,      label: 'Home',      end: true },
      { to: '/orders',    icon: I.Orders,    label: 'Orders' },
      { to: '/products',  icon: I.Products,  label: 'Products' },
      { to: '/customers', icon: I.Customers, label: 'Customers' },
    ],
  },
  {
    label: 'Store',
    items: [
      { to: '/marketing', icon: I.Marketing, label: 'Marketing' },
      { to: '/discounts', icon: I.Discounts, label: 'Discounts' },
      { to: '/finance',   icon: I.Finance,   label: 'Finance' },
      { to: '/analytics', icon: I.Analytics, label: 'Analytics' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/logistics',     icon: I.Logistics,     label: 'Logistics' },
      { to: '/notifications', icon: I.Notifications, label: 'Notifications' },
    ],
  },
];

// ── Main Layout ───────────────────────────────────────────────────────────────
export default function Layout() {
  const { user, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Subscription state ─────────────────────────────────────────────────────
  const [subStatus, setSubStatus] = useState(null);   // null = loading
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  const isOwner = user?.role === 'owner';

  // ── Check subscription (skip for owners) ──────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (isOwner) { setSubStatus({ active: true, plan: 'owner' }); setSubLoading(false); return; }

    // Check for Stripe redirect with session_id in URL
    const params = new URLSearchParams(window.location.search);
    const subSession = params.get('sub_session');
    const cancelled  = params.get('sub_cancelled');

    if (cancelled) {
      // Clean URL, show paywall
      window.history.replaceState({}, '', window.location.pathname);
      setSubStatus({ active: false });
      setSubLoading(false);
      return;
    }

    if (subSession) {
      // Verify payment with backend
      window.history.replaceState({}, '', window.location.pathname);
      apiFetch(`/subscription/verify?session_id=${encodeURIComponent(subSession)}`)
        .then(data => { setSubStatus({ active: true, ...data }); setSubLoading(false); })
        .catch(err => {
          setSubError(err.message || 'Payment verification failed. Please contact the owner.');
          setSubStatus({ active: false });
          setSubLoading(false);
        });
      return;
    }

    // Normal status check
    apiFetch('/subscription/status')
      .then(data => { setSubStatus(data); setSubLoading(false); })
      .catch(() => { setSubStatus({ active: false }); setSubLoading(false); });
  }, [user, isOwner]);

  // ── Subscribe: create Stripe Checkout and redirect ─────────────────────────
  const handleSubscribe = async () => {
    setSubscribing(true);
    setSubError('');
    try {
      const data = await apiFetch('/subscription/create-checkout', { method: 'POST', body: {} });
      if (data.url) {
        window.location.href = data.url; // redirect to Stripe Checkout
      } else {
        setSubError(data.error || 'Failed to create checkout session.');
        setSubscribing(false);
      }
    } catch (err) {
      setSubError(err.message || 'Failed to start checkout. Please try again.');
      setSubscribing(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading || (user && !isOwner && subLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-3">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-white/30">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // ── Subscription paywall — full screen, no bypass ─────────────────────────
  if (!isOwner && subStatus && !subStatus.active) {
    return <SubscriptionPaywall user={user} onSubscribe={handleSubscribe} subscribing={subscribing} error={subError} onLogout={logout} />;
  }

  // ── Sidebar nav content ───────────────────────────────────────────────────
  const SidebarContent = () => (
    <>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-[18px] border-b border-white/8">
        <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          <span className="text-black text-[10px] font-black tracking-tight">LB</span>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white leading-none">Lwang Black</p>
          <p className="text-[10px] text-white/40 mt-0.5">Admin</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-3 pt-3 border-t border-white/6' : ''}>
            {section.label && (
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/25">
                {section.label}
              </p>
            )}
            {section.items.map(({ to, icon: Icon, label, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors mb-0.5 ${
                    isActive ? 'bg-white text-black font-semibold' : 'text-white/60 hover:text-white hover:bg-white/8'
                  }`
                }
              >
                <Icon />{label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Settings + user */}
      <div className="px-2 pb-2 border-t border-white/8 pt-2">
        <NavLink to="/settings" onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors mb-1 ${
              isActive ? 'bg-white text-black font-semibold' : 'text-white/60 hover:text-white hover:bg-white/8'
            }`
          }
        >
          <I.Settings />Settings
        </NavLink>

        {/* Subscription badge for non-owners */}
        {!isOwner && subStatus?.active && subStatus?.daysLeft !== undefined && (
          <div className="mx-1 mb-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 flex items-center gap-2">
            <I.Shield />
            <div>
              <p className="text-[10px] font-medium text-white/70">Active plan</p>
              <p className="text-[9px] text-white/35">{subStatus.daysLeft}d remaining</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2.5 px-3 py-2 mt-0.5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {(user.username?.[0] || 'A').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate text-white/80">{user.name || user.username}</p>
            <p className="text-[10px] text-white/35 truncate capitalize flex items-center gap-1">
              {isOwner && <><I.Crown /> </>}{user.role}
              {user.country === 'NP' && ' · NPR'}
            </p>
          </div>
          <button onClick={logout} title="Logout" className="p-1 text-white/30 hover:text-red-400 transition-colors">
            <I.Logout />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-black text-white flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/70 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[220px] bg-[#0a0a0a] border-r border-white/8 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="lg:hidden bg-[#0a0a0a] border-b border-white/8 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white/50 hover:text-white transition-colors">
            {sidebarOpen ? <I.Close /> : <I.Menu />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-white flex items-center justify-center">
              <span className="text-black text-[9px] font-black">LB</span>
            </div>
            <span className="font-bold text-sm">Lwang Black</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 bg-[#0f0f0f]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ── SubscriptionPaywall — full-screen, hard gate ──────────────────────────────
function SubscriptionPaywall({ user, onSubscribe, subscribing, error, onLogout }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-12 text-white">
      {/* Logo */}
      <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-6">
        <span className="text-black text-[15px] font-black">LB</span>
      </div>

      <div className="w-full max-w-md">
        {/* Card */}
        <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0d0d0d]">
          {/* Top banner */}
          <div className="bg-white/5 border-b border-white/8 px-6 py-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/8">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-white"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
            </div>
            <div>
              <p className="text-sm font-semibold">Manager access required</p>
              <p className="text-xs text-white/40">Logged in as <span className="text-white/60 font-mono">{user.username}</span></p>
            </div>
          </div>

          {/* Pricing */}
          <div className="px-6 py-6 border-b border-white/8">
            <div className="flex items-end gap-2 mb-1">
              <span className="text-4xl font-bold">$99</span>
              <span className="text-white/40 text-sm pb-1.5">/ month</span>
            </div>
            <p className="text-xs text-white/40">
              One-time $99 payment per billing cycle. Gives 30 days of full dashboard access.
              Payment goes directly to the Lwang Black store owner.
            </p>
          </div>

          {/* Features */}
          <div className="px-6 py-5 border-b border-white/8">
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">What's included</p>
            <ul className="space-y-2.5">
              {[
                'Full Orders management — view, fulfill, refund',
                'Products catalog — add, edit, manage stock',
                'Customers — profiles, order history',
                'Analytics — revenue charts, KPIs',
                'Finance — transactions, CSV export',
                'Marketing — campaigns, discounts',
                'Logistics — tracking, zones',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-white/10 flex items-center justify-center">
                    <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="px-6 pt-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="px-6 py-5">
            <button
              onClick={onSubscribe}
              disabled={subscribing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 disabled:opacity-60 transition-colors"
            >
              {subscribing ? (
                <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Processing…</>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clipRule="evenodd"/></svg>
                  Subscribe — $99 / month
                </>
              )}
            </button>
            <p className="text-center text-[10px] text-white/25 mt-2.5">
              Secure payment via Stripe. You'll be redirected to complete checkout.
            </p>
          </div>
        </div>

        {/* Log out link */}
        <div className="mt-4 text-center">
          <button onClick={onLogout} className="text-xs text-white/30 hover:text-white/60 transition-colors">
            ← Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
