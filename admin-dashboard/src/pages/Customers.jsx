import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { Search, Users, Mail, Phone, MapPin, ShoppingBag, X, ChevronRight } from 'lucide-react';

function CustomerDetail({ customer, orders, onClose }) {
  const total = orders.reduce((s, o) => s + (o.total || 0), 0);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
              {(customer.fname || customer.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold text-sm">{customer.fname} {customer.lname}</h2>
              <p className="text-xs text-zinc-500">{orders.length} orders · ${total.toFixed(2)} spent</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Contact info */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Contact</p>
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={13} className="text-zinc-500" />
                <a href={`mailto:${customer.email}`} className="text-amber-400 hover:underline">{customer.email}</a>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={13} className="text-zinc-500" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.country && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={13} className="text-zinc-500" />
                <span>{customer.city ? `${customer.city}, ` : ''}{customer.country}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <p className="text-xs text-zinc-500">Orders</p>
              <p className="text-xl font-bold mt-1">{orders.length}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
              <p className="text-xs text-zinc-500">Total spent</p>
              <p className="text-xl font-bold mt-1 text-amber-400">${total.toFixed(2)}</p>
            </div>
          </div>

          {/* Order history */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Order history</p>
            </div>
            {orders.length === 0 ? (
              <div className="p-4 text-xs text-zinc-600 text-center">No orders</div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {orders.map(o => (
                  <div key={o.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-xs font-mono text-amber-400">{o.id}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(o.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                      o.status === 'delivered' ? 'bg-green-500/10 text-green-400' :
                      o.status === 'shipped'   ? 'bg-purple-500/10 text-purple-400' :
                      o.status === 'paid'      ? 'bg-blue-500/10 text-blue-400' :
                      o.status === 'cancelled' ? 'bg-zinc-700 text-zinc-400' :
                      'bg-yellow-500/10 text-yellow-400'
                    }`}>{o.status}</span>
                    <span className="font-mono text-sm font-medium">{o.symbol}{(o.total||0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cData, oData] = await Promise.all([
        apiFetch('/customers').catch(() => ({ customers: [] })),
        apiFetch('/orders?limit=500').catch(() => ({ orders: [] })),
      ]);

      const orders = oData.orders || [];
      setAllOrders(orders);

      // Build customer list from explicit customers table + infer from orders
      const custMap = {};
      (cData.customers || []).forEach(c => {
        custMap[c.email || c.id] = c;
      });
      // Also infer customers from orders if not in customers table
      orders.forEach(o => {
        if (o.customer?.email && !custMap[o.customer.email]) {
          custMap[o.customer.email] = {
            id: o.customer.email,
            fname: o.customer.fname,
            lname: o.customer.lname,
            email: o.customer.email,
            phone: o.customer.phone,
            country: o.customer.country,
            city: o.customer.city,
          };
        }
      });

      setCustomers(Object.values(custMap));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getCustomerOrders = (email) => allOrders.filter(o => o.customer?.email === email);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${c.fname} ${c.lname}`.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Customers</h1>
          <span className="text-sm text-zinc-500">{customers.length} customer{customers.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customers by name, email, or phone..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-700" />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-zinc-800/60 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Customer</th>
                  <th className="px-5 py-3 text-left font-medium">Contact</th>
                  <th className="px-5 py-3 text-left font-medium">Location</th>
                  <th className="px-5 py-3 text-right font-medium">Orders</th>
                  <th className="px-5 py-3 text-right font-medium">Total spent</th>
                  <th className="px-5 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map(c => {
                  const orders = getCustomerOrders(c.email);
                  const total  = orders.reduce((s, o) => s + (o.total || 0), 0);
                  return (
                    <tr key={c.id || c.email}
                      className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(c)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                            {(c.fname || '?')[0].toUpperCase()}
                          </div>
                          <span className="font-medium">{c.fname} {c.lname}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        <div>{c.email}</div>
                        {c.phone && <div className="text-zinc-500">{c.phone}</div>}
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {c.city ? `${c.city}, ` : ''}{c.country || '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-zinc-300">{orders.length}</td>
                      <td className="px-5 py-3 text-right font-mono font-medium text-amber-400">${total.toFixed(2)}</td>
                      <td className="px-5 py-3 text-zinc-600"><ChevronRight size={14} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                <Users size={32} className="mb-2" />
                <p className="text-sm">{search ? 'No customers found' : 'No customers yet'}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <CustomerDetail
          customer={selected}
          orders={getCustomerOrders(selected.email)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
