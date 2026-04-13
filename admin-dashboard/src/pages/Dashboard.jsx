import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../lib/currency';
import {
  ShoppingCart, DollarSign, Package, Users, TrendingUp, TrendingDown,
  AlertTriangle, ArrowRight, Clock, CheckCircle
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const STATUS_COLORS = {
  pending:   { bg: 'bg-yellow-500/10', text: 'text-yellow-400',  dot: '#f59e0b' },
  paid:      { bg: 'bg-blue-500/10',   text: 'text-blue-400',    dot: '#3b82f6' },
  shipped:   { bg: 'bg-purple-500/10', text: 'text-purple-400',  dot: '#8b5cf6' },
  delivered: { bg: 'bg-green-500/10',  text: 'text-green-400',   dot: '#10b981' },
  cancelled: { bg: 'bg-zinc-700/50',   text: 'text-zinc-400',    dot: '#71717a' },
  refunded:  { bg: 'bg-red-500/10',    text: 'text-red-400',     dot: '#ef4444' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function KPICard({ label, value, sub, icon: Icon, color, change, up }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-zinc-100">{value}</p>
          {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-xs mt-1 ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {change}% vs last week
            </div>
          )}
        </div>
        <div className={`p-2 rounded-lg ${color} bg-opacity-10`} style={{ background: 'rgba(255,255,255,0.05)' }}>
          <Icon size={20} className={color} />
        </div>
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: '#18181b', border: '1px solid #27272a', borderRadius: 8, color: '#fff', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { fmtTotal, fmtOrder, currencyLabel } = useCurrencyFormatter(user);
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [orderData, productData] = await Promise.all([
          apiFetch('/orders?limit=200'),
          apiFetch('/products').catch(() => ({ products: [] })),
        ]);

        const all = orderData.orders || [];
        setRecentOrders(all.slice(0, 8));

        const now = new Date();
        const weekAgo   = new Date(now - 7  * 86400000);
        const twoWkAgo  = new Date(now - 14 * 86400000);

        const active    = o => o.status !== 'cancelled' && o.status !== 'refunded';
        const thisWeek  = all.filter(o => new Date(o.date) >= weekAgo);
        const prevWeek  = all.filter(o => new Date(o.date) >= twoWkAgo && new Date(o.date) < weekAgo);

        const revenue     = all.filter(active).reduce((s, o) => s + (o.total || 0), 0);
        const wkRevenue   = thisWeek.filter(active).reduce((s, o) => s + (o.total || 0), 0);
        const prevRevenue = prevWeek.filter(active).reduce((s, o) => s + (o.total || 0), 0);
        const revChange   = prevRevenue > 0 ? (((wkRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : null;

        const wkOrders   = thisWeek.length;
        const prevOrders = prevWeek.length;
        const ordChange  = prevOrders > 0 ? (((wkOrders - prevOrders) / prevOrders) * 100).toFixed(1) : null;

        const products = productData.products || [];
        const lowStock = products.filter(p => (p.stock || 0) < 10);

        // Daily sales for last 14 days
        const dailyMap = {};
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now - i * 86400000);
          const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          dailyMap[key] = { revenue: 0, orders: 0 };
        }
        all.filter(active).forEach(o => {
          const d = new Date(o.date);
          const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (dailyMap[key]) {
            dailyMap[key].revenue += o.total || 0;
            dailyMap[key].orders  += 1;
          }
        });

        const statusCounts = {};
        all.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

        // Payment method breakdown
        const pmCounts = {};
        all.forEach(o => {
          const pm = o.payment?.method || o.paymentMethod || 'unknown';
          pmCounts[pm] = (pmCounts[pm] || 0) + 1;
        });

        // Customer count (unique emails)
        const emails = new Set(all.map(o => o.customer?.email).filter(Boolean));

        setStats({
          totalOrders: all.length,
          wkOrders, ordChange: ordChange !== null ? parseFloat(ordChange) : null,
          revenue: revenue.toFixed(2),
          wkRevenue: wkRevenue.toFixed(2),
          revChange: revChange !== null ? parseFloat(revChange) : null,
          totalProducts: products.length,
          lowStock,
          customers: emails.size,
          statusCounts,
          dailySales: Object.entries(dailyMap).map(([name, v]) => ({
            name, revenue: +v.revenue.toFixed(2), orders: v.orders
          })),
          statusPie: Object.entries(statusCounts).map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1), value,
            color: STATUS_COLORS[name]?.dot || '#71717a'
          })),
          pmPie: Object.entries(pmCounts).map(([name, value]) => ({
            name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value
          })),
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-white/5 rounded-lg w-40 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!stats) return (
    <div className="flex items-center gap-2 text-red-400 p-4">
      <AlertTriangle size={16} /> Failed to load dashboard.
    </div>
  );

  const PM_COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ec4899','#ef4444'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Overview</h1>
        <span className="text-xs text-zinc-500">Last 7 days</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label={`Revenue (${currencyLabel})`} value={fmtTotal(Number(stats.revenue))}
          sub={`${fmtTotal(Number(stats.wkRevenue))} this week`}
          icon={DollarSign} color="text-white"
          change={stats.revChange} up={stats.revChange >= 0} />
        <KPICard label="Orders" value={stats.totalOrders}
          sub={`${stats.wkOrders} this week`}
          icon={ShoppingCart} color="text-white/70"
          change={stats.ordChange} up={stats.ordChange >= 0} />
        <KPICard label="Customers" value={stats.customers}
          icon={Users} color="text-white/70" />
        <KPICard label="Products" value={stats.totalProducts}
          sub={stats.lowStock.length > 0 ? `${stats.lowStock.length} low stock` : 'All in stock'}
          icon={Package} color="text-white/70" />
      </div>

      {/* Low stock alert */}
      {stats.lowStock.length > 0 && (
        <div className="bg-white/10 border border-white/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-white flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300 mb-1.5">Low stock alert — {stats.lowStock.length} product{stats.lowStock.length > 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-2">
              {stats.lowStock.map(p => (
                <span key={p.id} className="text-xs bg-white/10 text-amber-300 border border-white/20 px-2 py-0.5 rounded">
                  {p.name}: {p.stock || 0} left
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Revenue — last 14 days</h3>
          <span className="text-xs text-zinc-500 font-mono">${Number(stats.wkRevenue).toLocaleString()} this week</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={stats.dailySales} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.25}/>
                <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="name" tick={{ fill:'#71717a', fontSize:11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'#71717a', fontSize:11 }} axisLine={false} tickLine={false} />
            <Tooltip {...CHART_TOOLTIP_STYLE} formatter={v => [`$${v.toLocaleString()}`, 'Revenue']} />
            <Area type="monotone" dataKey="revenue" stroke="#ffffff" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r:4, fill:'#f59e0b' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders by day */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-4">Orders by day</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.dailySales.slice(-7)} margin={{ top: 0, right: 0, bottom: 0, left: -24 }}>
              <XAxis dataKey="name" tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#71717a', fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={v => [v, 'Orders']} />
              <Bar dataKey="orders" fill="#3b82f6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Order status breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">Order status</h3>
          <div className="space-y-2">
            {stats.statusPie.map(({ name, value, color }) => {
              const pct = stats.totalOrders > 0 ? Math.round((value / stats.totalOrders) * 100) : 0;
              return (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-xs text-zinc-400 flex-1">{name}</span>
                  <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-xs text-zinc-300 w-6 text-right">{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment methods */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">Payment methods</h3>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={stats.pmPie} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" paddingAngle={2}>
                {stats.pmPie.map((_, i) => <Cell key={i} fill={PM_COLORS[i % PM_COLORS.length]} />)}
              </Pie>
              <Tooltip {...CHART_TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {stats.pmPie.map(({ name, value }, i) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PM_COLORS[i % PM_COLORS.length] }} />
                <span className="text-zinc-400 flex-1">{name}</span>
                <span className="text-zinc-300">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
          <h3 className="text-sm font-medium">Recent orders</h3>
          <Link to="/orders" className="text-xs text-white hover:text-amber-300 flex items-center gap-1 transition-colors">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800/60">
                <th className="px-5 py-3 text-left text-xs text-zinc-500 font-medium uppercase tracking-wide">Order</th>
                <th className="px-5 py-3 text-left text-xs text-zinc-500 font-medium uppercase tracking-wide">Customer</th>
                <th className="px-5 py-3 text-left text-xs text-zinc-500 font-medium uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs text-zinc-500 font-medium uppercase tracking-wide">Payment</th>
                <th className="px-5 py-3 text-right text-xs text-zinc-500 font-medium uppercase tracking-wide">Total</th>
                <th className="px-5 py-3 text-left text-xs text-zinc-500 font-medium uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {recentOrders.map(o => (
                <tr key={o.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-white">{o.id}</td>
                  <td className="px-5 py-3">
                    <div className="text-sm">{o.customer?.fname} {o.customer?.lname}</div>
                    <div className="text-xs text-zinc-500">{o.customer?.email}</div>
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-5 py-3 text-xs text-zinc-400 capitalize">
                    {(o.payment?.method || o.paymentMethod || '—').replace(/_/g,' ')}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm font-medium">
                    {o.symbol}{o.total?.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-500">
                    {new Date(o.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentOrders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
              <Clock size={32} className="mb-2" />
              <p className="text-sm">No orders yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
