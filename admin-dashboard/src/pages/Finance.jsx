import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../lib/currency';
import { DollarSign, TrendingUp, TrendingDown, Download, CreditCard, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const TOOLTIP = {
  contentStyle: { background:'#111', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'#fff', fontSize:12 },
  cursor: { fill: 'rgba(255,255,255,0.02)' },
};

const METHODS = {
  stripe: 'Stripe', card: 'Stripe', paypal: 'PayPal', khalti: 'Khalti',
  esewa: 'eSewa', nabil: 'Nabil Bank', nabil_bank: 'Nabil Bank',
  cod: 'Cash on Delivery', afterpay: 'Afterpay', apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export default function Finance() {
  const { user } = useAuth();
  const { fmtTotal, currencyLabel, NPR_RATE, isNepal } = useCurrencyFormatter(user);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    apiFetch('/orders?limit=1000')
      .then(d => setOrders(d.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const cutoff = new Date(now - range * 86400000);
  const prevCutoff = new Date(now - range * 2 * 86400000);

  const active = o => o.status !== 'cancelled' && o.status !== 'refunded';
  const inRange   = orders.filter(o => new Date(o.date) >= cutoff);
  const prevRange = orders.filter(o => new Date(o.date) >= prevCutoff && new Date(o.date) < cutoff);

  const revenue   = inRange.filter(active).reduce((s,o)=>s+(o.total||0),0);
  const prevRev   = prevRange.filter(active).reduce((s,o)=>s+(o.total||0),0);
  const refunds   = inRange.filter(o=>o.status==='refunded').reduce((s,o)=>s+(o.total||0),0);
  const net       = revenue - refunds;
  const pct = prevRev > 0 ? (((revenue-prevRev)/prevRev)*100).toFixed(1) : null;

  // Daily revenue
  const dayMap = {};
  for (let i = range-1; i >= 0; i--) {
    const d = new Date(now - i*86400000);
    const k = d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    dayMap[k] = 0;
  }
  inRange.filter(active).forEach(o => {
    const k = new Date(o.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
    if (dayMap[k] !== undefined) dayMap[k] += o.total||0;
  });
  const daily = Object.entries(dayMap).map(([name,v]) => ({ name, revenue: +v.toFixed(2) }));

  // Payment method breakdown
  const pmRev = {};
  inRange.filter(active).forEach(o => {
    const pm = METHODS[o.payment?.method||o.paymentMethod||'unknown'] || 'Other';
    if (!pmRev[pm]) pmRev[pm] = { revenue:0, count:0 };
    pmRev[pm].revenue += o.total||0;
    pmRev[pm].count   += 1;
  });
  const pmData = Object.entries(pmRev).sort((a,b)=>b[1].revenue-a[1].revenue);

  // Transaction log (recent paid orders)
  const transactions = [...inRange]
    .filter(active)
    .sort((a,b) => new Date(b.date)-new Date(a.date))
    .slice(0, 50);

  const exportCSV = () => {
    const rows = [['Order ID','Customer','Date','Payment Method','Currency','Amount','Status']];
    transactions.forEach(o => {
      rows.push([o.id, `${o.customer?.fname||''} ${o.customer?.lname||''}`.trim(), new Date(o.date).toLocaleDateString(),
        o.payment?.method||o.paymentMethod||'', o.currency||'USD', (o.total||0).toFixed(2), o.status]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
    a.download = `lwangblack-finance-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse"/>)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Finance</h1>
          <p className="text-xs text-white/40 mt-0.5">Revenue, payouts, and transaction history · {currencyLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
            {[7,30,90].map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`px-3 py-1.5 transition-colors ${range===d ? 'bg-white text-black font-semibold' : 'text-white/40 hover:text-white'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 border border-white/10 text-xs text-white/60 hover:text-white transition-colors">
            <Download size={13}/> Export CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Gross revenue', value: fmtTotal(revenue), icon: DollarSign, change: pct, up: parseFloat(pct)>=0 },
          { label: 'Net revenue', value: fmtTotal(net), icon: TrendingUp },
          { label: 'Refunds', value: fmtTotal(refunds), icon: RefreshCw, note: `${inRange.filter(o=>o.status==='refunded').length} orders` },
          { label: 'Avg. order', value: fmtTotal(inRange.filter(active).length>0 ? revenue/inRange.filter(active).length : 0), icon: CreditCard },
        ].map(({ label, value, icon: Icon, change, up, note }) => (
          <div key={label} className="bg-[#111] border border-white/8 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
                {note && <p className="text-xs text-white/30 mt-0.5">{note}</p>}
                {change !== null && change !== undefined && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${parseFloat(change)>=0?'text-white/60':'text-red-400'}`}>
                    {parseFloat(change)>=0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                    {Math.abs(change)}% vs prev period
                  </p>
                )}
              </div>
              <div className="p-2 bg-white/5 rounded-lg"><Icon size={16} className="text-white/40"/></div>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="bg-[#111] border border-white/8 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-4">Revenue over time</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={daily} margin={{top:4,right:8,bottom:0,left:-16}}>
            <defs>
              <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
            <XAxis dataKey="name" tick={{fill:'rgba(255,255,255,0.25)',fontSize:10}} axisLine={false} tickLine={false}
              interval={range<=7?0:range<=30?4:9}/>
            <YAxis tick={{fill:'rgba(255,255,255,0.25)',fontSize:10}} axisLine={false} tickLine={false}/>
            <Tooltip {...TOOLTIP} formatter={v=>[`$${v.toFixed(2)}`,'Revenue']}/>
            <Area type="monotone" dataKey="revenue" stroke="#ffffff" strokeWidth={1.5} fill="url(#finGrad)" dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment method breakdown */}
        <div className="bg-[#111] border border-white/8 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8">
            <h3 className="text-sm font-medium">Revenue by payment method</h3>
          </div>
          <div className="divide-y divide-white/5">
            {pmData.map(([name, { revenue: r, count }]) => {
              const pct2 = pmData[0] ? (r / pmData[0][1].revenue * 100) : 0;
              return (
                <div key={name} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">{name}</span>
                      <span className="text-xs text-white/40">{count} orders</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-white/40" style={{width:`${pct2}%`}}/>
                    </div>
                  </div>
                  <span className="font-mono text-sm w-24 text-right">{fmtTotal(r)}</span>
                </div>
              );
            })}
            {pmData.length === 0 && <div className="px-4 py-8 text-center text-sm text-white/30">No revenue data</div>}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-[#111] border border-white/8 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/8">
            <h3 className="text-sm font-medium">Recent transactions</h3>
          </div>
          <div className="overflow-y-auto max-h-72 divide-y divide-white/5">
            {transactions.slice(0,20).map(o => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-white/60 truncate">{o.id}</p>
                  <p className="text-xs text-white/30">{o.customer?.email}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-mono font-medium">{fmtTotal(o.total||0)}</p>
                  <p className="text-[10px] text-white/30">{new Date(o.date).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <div className="px-4 py-8 text-center text-sm text-white/30">No transactions yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
