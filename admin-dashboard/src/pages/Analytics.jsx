import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { TrendingUp, DollarSign, ShoppingCart, Users, Package } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const TOOLTIP = {
  contentStyle: { background:'#18181b', border:'1px solid #27272a', borderRadius:8, color:'#fff', fontSize:12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};
const COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ec4899','#ef4444','#14b8a6'];

const DATE_RANGES = [
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function Analytics() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    apiFetch('/orders?limit=1000')
      .then(d => setOrders(d.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-zinc-800 rounded-lg w-32 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-zinc-800 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  const now = new Date();
  const cutoff = new Date(now - range * 86400000);
  const prevCutoff = new Date(now - range * 2 * 86400000);

  const active = o => o.status !== 'cancelled' && o.status !== 'refunded';
  const inRange = orders.filter(o => new Date(o.date) >= cutoff);
  const prevRange = orders.filter(o => new Date(o.date) >= prevCutoff && new Date(o.date) < cutoff);

  const revenue     = inRange.filter(active).reduce((s, o) => s + (o.total || 0), 0);
  const prevRevenue = prevRange.filter(active).reduce((s, o) => s + (o.total || 0), 0);
  const revPct  = prevRevenue > 0 ? (((revenue - prevRevenue)/prevRevenue)*100).toFixed(1) : null;

  const totalOrders = inRange.length;
  const prevOrders  = prevRange.length;
  const ordPct  = prevOrders > 0 ? (((totalOrders - prevOrders)/prevOrders)*100).toFixed(1) : null;

  const aov = totalOrders > 0 ? revenue / inRange.filter(active).length : 0;

  const emails = new Set(inRange.map(o => o.customer?.email).filter(Boolean));
  const prevEmails = new Set(prevRange.map(o => o.customer?.email).filter(Boolean));

  // Daily timeline
  const dayMap = {};
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    dayMap[key] = { revenue: 0, orders: 0 };
  }
  inRange.filter(active).forEach(o => {
    const key = new Date(o.date).toLocaleDateString('en-US', { month:'short', day:'numeric' });
    if (dayMap[key]) { dayMap[key].revenue += o.total || 0; dayMap[key].orders += 1; }
  });
  const timeline = Object.entries(dayMap).map(([name, v]) => ({
    name, revenue: +v.revenue.toFixed(2), orders: v.orders
  }));

  // Country breakdown
  const countryMap = {};
  inRange.forEach(o => {
    const c = o.customer?.country || o.country || 'Unknown';
    if (!countryMap[c]) countryMap[c] = { orders: 0, revenue: 0 };
    countryMap[c].orders  += 1;
    countryMap[c].revenue += o.total || 0;
  });
  const countryData = Object.entries(countryMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 8)
    .map(([name, v]) => ({ name, ...v, revenue: +v.revenue.toFixed(2) }));

  // Payment method breakdown
  const pmMap = {};
  inRange.forEach(o => {
    const pm = (o.payment?.method || o.paymentMethod || 'unknown').replace(/_/g,' ');
    pmMap[pm] = (pmMap[pm] || 0) + 1;
  });
  const pmData = Object.entries(pmMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name: name.replace(/\b\w/g, c => c.toUpperCase()), value }));

  // Product popularity from order items
  const prodMap = {};
  inRange.forEach(o => {
    (o.items || []).forEach(item => {
      const n = item.name || 'Unknown';
      if (!prodMap[n]) prodMap[n] = { qty: 0, revenue: 0 };
      const qty = item.qty || item.quantity || 1;
      prodMap[n].qty     += qty;
      prodMap[n].revenue += (item.price || 0) * qty;
    });
  });
  const topProducts = Object.entries(prodMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([name, v]) => ({ name, ...v, revenue: +v.revenue.toFixed(2) }));

  const KPI = ({ label, value, sub, icon: Icon, color, change }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
          {change !== null && change !== undefined && (
            <p className={`text-xs mt-1 ${parseFloat(change) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {parseFloat(change) >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs prev period
            </p>
          )}
        </div>
        <div className="p-2 rounded-lg bg-white/5">
          <Icon size={18} className={color} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="flex rounded-lg overflow-hidden border border-zinc-800 text-xs">
          {DATE_RANGES.map(({ label, days }) => (
            <button key={days} onClick={() => setRange(days)}
              className={`px-3 py-1.5 transition-colors ${range === days ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Revenue" value={`$${revenue.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`}
          icon={DollarSign} color="text-white" change={revPct} />
        <KPI label="Orders" value={totalOrders} sub={`${inRange.filter(o=>o.status==='cancelled').length} cancelled`}
          icon={ShoppingCart} color="text-blue-400" change={ordPct} />
        <KPI label="Avg. order value" value={`$${aov.toFixed(2)}`}
          icon={TrendingUp} color="text-purple-400" />
        <KPI label="Customers" value={emails.size}
          sub={`${prevEmails.size} prev period`}
          icon={Users} color="text-green-400" />
      </div>

      {/* Revenue chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-4">Revenue over time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={timeline} margin={{ top:4, right:8, bottom:0, left:-16 }}>
            <defs>
              <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e2e8f0" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#e2e8f0" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="name" tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false}
              interval={range <= 7 ? 0 : range <= 30 ? 4 : 9} />
            <YAxis tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false} />
            <Tooltip {...TOOLTIP} formatter={v => [`$${v.toLocaleString()}`, 'Revenue']} />
            <Area type="monotone" dataKey="revenue" stroke="#e2e8f0" strokeWidth={2} fill="url(#aGrad)" dot={false} activeDot={{ r:4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders timeline */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-4">Orders per day</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timeline} margin={{ top:0, right:0, bottom:0, left:-24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false}
                interval={range <= 7 ? 0 : range <= 30 ? 4 : 9} />
              <YAxis tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...TOOLTIP} formatter={v => [v, 'Orders']} />
              <Bar dataKey="orders" fill="#3b82f6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment methods */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-4">Payment methods</h3>
          <div className="flex gap-4 items-center">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={pmData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={2}>
                  {pmData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {pmData.map(({ name, value }, i) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-zinc-400 flex-1">{name}</span>
                  <span className="text-zinc-300 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium">Top products by revenue</h3>
          </div>
          {topProducts.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">
              <Package size={20} className="mr-2" /> No sales data yet
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {topProducts.map(({ name, qty, revenue }, i) => (
                <div key={name} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs font-bold text-zinc-600 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-zinc-500">{qty} sold</p>
                  </div>
                  <span className="font-mono text-sm font-medium text-white">${revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Country revenue */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium">Revenue by country</h3>
          </div>
          {countryData.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">No data yet</div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {countryData.map(({ name, orders, revenue }, i) => {
                const maxRev = countryData[0].revenue;
                return (
                  <div key={name} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs font-bold text-zinc-600 w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{name}</span>
                        <span className="text-xs text-zinc-500">{orders} orders</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-800">
                        <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${(revenue/maxRev)*100}%` }} />
                      </div>
                    </div>
                    <span className="font-mono text-sm font-medium text-white w-20 text-right">${revenue.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
