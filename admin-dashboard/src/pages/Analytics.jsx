import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useAdminRealtime } from '../hooks/useAdminRealtime';
import { TrendingUp, DollarSign, ShoppingCart, Users, Package, Radio, Globe } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const TOOLTIP = {
  contentStyle: { background:'#18181b', border:'1px solid #27272a', borderRadius:8, color:'#fff', fontSize:12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};
const DATE_RANGES = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [summary, setSummary] = useState(null);
  const [revenueRows, setRevenueRows] = useState([]);
  const [byRegion, setByRegion] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [ipLog, setIpLog] = useState([]);
  const [ipByCountry, setIpByCountry] = useState([]);
  const [live, setLive] = useState(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const days = range;
      const [sum, rev, fun, top, ips, rt] = await Promise.all([
        apiFetch('/analytics/summary').catch(() => null),
        apiFetch(`/analytics/revenue?days=${days}`).catch(() => null),
        apiFetch('/analytics/funnel').catch(() => null),
        apiFetch('/analytics/top-products').catch(() => null),
        apiFetch('/analytics/ip-log').catch(() => null),
        apiFetch('/analytics/realtime').catch(() => null),
      ]);
      if (sum) setSummary(sum);
      if (rev?.revenue) setRevenueRows(rev.revenue);
      if (rev?.byRegion) setByRegion(rev.byRegion);
      if (fun?.funnel) setFunnel(fun.funnel);
      if (top?.products) setTopProducts(top.products);
      if (ips?.log) setIpLog(ips.log);
      if (ips?.byCountry) setIpByCountry(ips.byCountry);
      if (rt) setLive(rt);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load, tick]);

  useAdminRealtime(
    (msg) => {
      if (!msg?.type) return;
      if (
        msg.type === 'order:new' ||
        msg.type === 'order:updated' ||
        msg.type === 'store:order:new' ||
        msg.type === 'inventory:update' ||
        msg.type === 'product:stock_updated'
      ) {
        setTick((t) => t + 1);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('Lwang Black', {
              body:
                msg.type === 'inventory:update'
                  ? 'Inventory update'
                  : `Order activity: ${msg.type.replace(/_/g, ' ')}`,
            });
          } catch (_) {}
        }
      }
    },
    { enabled: !!user }
  );

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const t = window.setTimeout(() => {
      Notification.requestPermission().catch(() => {});
    }, 2000);
    return () => window.clearTimeout(t);
  }, []);

  if (loading && !summary && !revenueRows.length) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-zinc-800 rounded-lg w-32 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-zinc-800 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const timelineMap = {};
  const now = new Date();
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().split('T')[0];
    timelineMap[key] = { revenue: 0, orders: 0, label: d.toLocaleDateString('en-US', { month:'short', day: 'numeric' }) };
  }
  (revenueRows || []).forEach((row) => {
    const key = typeof row.date === 'string' ? row.date.split('T')[0] : row.date;
    if (timelineMap[key]) {
      timelineMap[key].revenue += parseFloat(row.daily_total) || 0;
      timelineMap[key].orders += parseInt(row.order_count, 10) || 0;
    }
  });
  const timeline = Object.entries(timelineMap).map(([iso, v]) => ({
    name: v.label,
    revenue: +v.revenue.toFixed(2),
    orders: v.orders,
    _iso: iso,
  }));

  const totalRev = timeline.reduce((s, x) => s + x.revenue, 0);
  const totalOrd = timeline.reduce((s, x) => s + x.orders, 0);
  const aov = totalOrd > 0 ? totalRev / totalOrd : 0;

  const KPI = ({ label, value, sub, icon: Icon, color }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg bg-white/5">
          <Icon size={18} className={color} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Analytics</h1>
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              <Radio size={12} className="text-emerald-400" /> Live · {live.pendingOrders ?? 0} pending
            </span>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-zinc-800 text-xs">
          {DATE_RANGES.map(({ label, days }) => (
            <button key={days} type="button" onClick={() => setRange(days)}
              className={`px-3 py-1.5 transition-colors ${range === days ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Revenue (range)" value={`$${totalRev.toLocaleString('en',{ minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={summary ? `All-time: $${Number(summary.totalRevenue || 0).toLocaleString()}` : null}
          icon={DollarSign} color="text-white" />
        <KPI label="Orders (range)" value={totalOrd}
          sub={summary ? `Today: ${summary.todayOrders ?? 0}` : null}
          icon={ShoppingCart} color="text-blue-400" />
        <KPI label="Avg. order value" value={`$${aov.toFixed(2)}`}
          icon={TrendingUp} color="text-purple-400" />
        <KPI label="Summary (all)" value={summary?.totalOrders ?? '—'}
          sub={summary ? `${summary.pendingOrders ?? 0} pending fulfilment` : null}
          icon={Users} color="text-green-400" />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-4">Revenue over time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={timeline} margin={{ top:4, right:8, bottom:0, left:-16 }}>
            <defs>
              <linearGradient id="aGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e2e8f0" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#e2e8f0" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false}
              interval={range <= 7 ? 0 : range <= 30 ? 4 : 9} />
            <YAxis tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP} formatter={(v) => [`$${Number(v).toLocaleString()}`, 'Revenue']} />
            <Area type="monotone" dataKey="revenue" stroke="#e2e8f0" strokeWidth={2} fill="url(#aGrad2)" dot={false} activeDot={{ r:4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-4">Orders per day</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timeline} margin={{ top:0, right:0, bottom:0, left:-24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false}
                interval={range <= 7 ? 0 : range <= 30 ? 4 : 9} />
              <YAxis tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...TOOLTIP} formatter={(v) => [v, 'Orders']} />
              <Bar dataKey="orders" fill="#3b82f6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-4">Visitor funnel (est.)</h3>
          <div className="space-y-2">
            {(funnel || []).map((step) => (
              <div key={step.label} className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">{step.label}</span>
                <span className="text-zinc-200 font-mono">{step.count} <span className="text-zinc-500">({step.pct}%)</span></span>
              </div>
            ))}
            {!funnel?.length && <p className="text-zinc-600 text-sm">No funnel data</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <Package size={14} className="text-zinc-500" />
            <h3 className="text-sm font-medium">Top products (revenue)</h3>
          </div>
          {!topProducts.length ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">No sales data yet</div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {topProducts.map((row, i) => (
                <div key={row.name || i} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs font-bold text-zinc-600 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    <p className="text-xs text-zinc-500">{row.total_qty} sold</p>
                  </div>
                  <span className="font-mono text-sm font-medium text-white">
                    ${Number(row.total_revenue || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <Globe size={14} className="text-zinc-500" />
            <h3 className="text-sm font-medium">Revenue by region (API)</h3>
          </div>
          {!byRegion.length ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">No regional breakdown</div>
          ) : (
            <div className="divide-y divide-zinc-800/60 max-h-64 overflow-y-auto">
              {byRegion.map((r, i) => (
                <div key={r.country || i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-zinc-300">{r.country}</span>
                  <span className="font-mono text-zinc-400">
                    ${Number(r.total_revenue || 0).toLocaleString()} <span className="text-zinc-600">({r.total_orders})</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-medium">Recent visitor log (customer journeys)</h3>
          <p className="text-xs text-zinc-500 mt-1">Last 50 page views — from storefront analytics beacon</p>
        </div>
        <div className="overflow-x-auto max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 font-medium">Page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {(ipLog || []).slice(0, 50).map((row) => (
                <tr key={row.id || `${row.ip}-${row.created_at}`} className="text-zinc-300">
                  <td className="px-4 py-2 font-mono text-zinc-500 whitespace-nowrap">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2">{row.country || '—'}</td>
                  <td className="px-4 py-2 truncate max-w-[200px]">{row.page || '/'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ipByCountry?.length > 0 && (
          <div className="px-4 py-3 border-t border-zinc-800 flex flex-wrap gap-2 text-xs text-zinc-500">
            Top countries: {ipByCountry.slice(0, 8).map((x) => `${x.country} (${x.count})`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}
