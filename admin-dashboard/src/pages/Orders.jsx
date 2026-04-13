import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCurrencyFormatter } from '../lib/currency';
import {
  Search, Filter, ChevronDown, X, Package, Truck, CheckCircle,
  Clock, XCircle, RotateCcw, ArrowUpDown, ExternalLink, Copy, ChevronRight
} from 'lucide-react';

const STATUS_CONFIG = {
  pending:   { bg: 'bg-yellow-500/10', text: 'text-yellow-400',  border: 'border-yellow-500/20', dot: '#f59e0b', label: 'Pending' },
  paid:      { bg: 'bg-blue-500/10',   text: 'text-blue-400',    border: 'border-blue-500/20',   dot: '#3b82f6', label: 'Paid' },
  shipped:   { bg: 'bg-purple-500/10', text: 'text-purple-400',  border: 'border-purple-500/20', dot: '#8b5cf6', label: 'Shipped' },
  delivered: { bg: 'bg-green-500/10',  text: 'text-green-400',   border: 'border-green-500/20',  dot: '#10b981', label: 'Delivered' },
  cancelled: { bg: 'bg-zinc-700/50',   text: 'text-zinc-400',    border: 'border-zinc-700',      dot: '#71717a', label: 'Cancelled' },
  refunded:  { bg: 'bg-red-500/10',    text: 'text-red-400',     border: 'border-red-500/20',    dot: '#ef4444', label: 'Refunded' },
};

const ALL_STATUSES = ['pending','paid','shipped','delivered','cancelled','refunded'];

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// ── Order detail side panel ──────────────────────────────────────────────────
function OrderDetail({ order, onClose, onStatusChange }) {
  const [updating, setUpdating] = useState(false);
  const [trackingInput, setTrackingInput] = useState(order.tracking || '');
  const [noteInput, setNoteInput] = useState('');
  const [timeline, setTimeline] = useState(order.timeline || []);

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await apiFetch(`/orders/${order.id}`, {
        method: 'PATCH',
        body: { status: newStatus, tracking: trackingInput || undefined },
      });
      onStatusChange(order.id, newStatus);
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const saveTracking = async () => {
    setUpdating(true);
    try {
      await apiFetch(`/orders/${order.id}`, {
        method: 'PATCH',
        body: { tracking: trackingInput },
      });
      onStatusChange(order.id, order.status, trackingInput);
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const nextActions = {
    pending:   [{ label: 'Mark as paid',     status: 'paid',      icon: CheckCircle }],
    paid:      [{ label: 'Mark as shipped',  status: 'shipped',   icon: Truck }],
    shipped:   [{ label: 'Mark as delivered',status: 'delivered', icon: Package }],
    delivered: [],
    cancelled: [],
    refunded:  [],
  };
  const actions = nextActions[order.status] || [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm">{order.id}</h2>
              <button onClick={() => copyText(order.id)} className="text-zinc-600 hover:text-zinc-300"><Copy size={12} /></button>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{new Date(order.date).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status + actions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Status</span>
              <StatusBadge status={order.status} />
            </div>
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map(({ label, status, icon: Icon }) => (
                  <button
                    key={status}
                    onClick={() => updateStatus(status)}
                    disabled={updating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Icon size={13} /> {label}
                  </button>
                ))}
                {order.status !== 'cancelled' && order.status !== 'refunded' && order.status !== 'delivered' && (
                  <button
                    onClick={() => updateStatus('cancelled')}
                    disabled={updating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors disabled:opacity-50"
                  >
                    <XCircle size={13} /> Cancel
                  </button>
                )}
                {order.status === 'paid' && (
                  <button
                    onClick={() => updateStatus('refunded')}
                    disabled={updating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={13} /> Refund
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tracking */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Tracking</p>
            <div className="flex gap-2">
              <input
                value={trackingInput}
                onChange={e => setTrackingInput(e.target.value)}
                placeholder="Enter tracking number"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
              />
              <button
                onClick={saveTracking}
                disabled={updating}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          {/* Customer */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Customer</p>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium">{order.customer?.fname} {order.customer?.lname}</p>
              <p className="text-zinc-400">{order.customer?.email}</p>
              {order.customer?.phone && <p className="text-zinc-400">{order.customer.phone}</p>}
              {order.customer?.address && (
                <div className="text-xs text-zinc-500 mt-2 border-t border-zinc-800 pt-2">
                  <p>{order.customer.address}</p>
                  <p>{order.customer.city}{order.customer.state ? `, ${order.customer.state}` : ''} {order.customer.zip}</p>
                  <p>{order.customer.country}</p>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Items ({(order.items || []).length})</p>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 bg-zinc-800 rounded-lg flex-shrink-0 overflow-hidden">
                    {item.image
                      ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      : <Package size={16} className="text-zinc-600 m-auto mt-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.variant && <p className="text-xs text-zinc-500">{item.variant}</p>}
                    <p className="text-xs text-zinc-500">Qty: {item.qty || item.quantity}</p>
                  </div>
                  <p className="text-sm font-mono flex-shrink-0">{order.symbol}{((item.price || 0) * (item.qty || item.quantity || 1)).toFixed(2)}</p>
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="px-4 py-3 border-t border-zinc-800 space-y-1.5 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>{order.symbol}{(order.subtotal || 0).toFixed(2)}</span>
              </div>
              {(order.shipping || 0) > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>Shipping</span>
                  <span>{order.symbol}{(order.shipping || 0).toFixed(2)}</span>
                </div>
              )}
              {(order.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Discount</span>
                  <span>−{order.symbol}{(order.discountAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-zinc-800 pt-1.5 mt-1">
                <span>Total</span>
                <span>{order.symbol}{(order.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment info */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Payment</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-zinc-500">Method</span>
              <span className="capitalize">{(order.payment?.method || order.paymentMethod || '—').replace(/_/g,' ')}</span>
              <span className="text-zinc-500">Currency</span>
              <span>{order.currency || 'USD'}</span>
              {order.payment?.transactionId && (
                <>
                  <span className="text-zinc-500">Transaction</span>
                  <span className="font-mono text-xs truncate">{order.payment.transactionId}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Orders page ───────────────────────────────────────────────────────────────
export default function Orders() {
  const { user } = useAuth();
  const { fmtOrder } = useCurrencyFormatter(user);
  const [orders, setOrders] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/orders?limit=500');
      setOrders(data.orders || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter + sort
  useEffect(() => {
    let list = [...orders];
    if (statusFilter !== 'all') list = list.filter(o => o.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.id?.toLowerCase().includes(q) ||
        `${o.customer?.fname} ${o.customer?.lname}`.toLowerCase().includes(q) ||
        o.customer?.email?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'date_desc') return new Date(b.date) - new Date(a.date);
      if (sortBy === 'date_asc')  return new Date(a.date) - new Date(b.date);
      if (sortBy === 'total_desc') return (b.total || 0) - (a.total || 0);
      if (sortBy === 'total_asc')  return (a.total || 0) - (b.total || 0);
      return 0;
    });
    setFiltered(list);
    setPage(1);
  }, [orders, search, statusFilter, sortBy]);

  const handleStatusChange = (orderId, newStatus, newTracking) => {
    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, status: newStatus, ...(newTracking ? { tracking: newTracking } : {}) }
      : o
    ));
    if (selected?.id === orderId) {
      setSelected(prev => ({ ...prev, status: newStatus, ...(newTracking ? { tracking: newTracking } : {}) }));
    }
  };

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageOrders = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const statusCounts = {};
  orders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Orders</h1>
          <span className="text-sm text-zinc-500">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {[{ key:'all', label:'All' }, ...ALL_STATUSES.map(s => ({ key:s, label: STATUS_CONFIG[s].label }))].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === key
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              {label}
              {key !== 'all' && statusCounts[key] > 0 && (
                <span className="ml-1.5 text-zinc-600">{statusCounts[key]}</span>
              )}
              {key === 'all' && (
                <span className="ml-1.5 text-zinc-600">{orders.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search orders, customers..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-700"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="total_desc">Highest total</option>
            <option value="total_asc">Lowest total</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-14 bg-zinc-800/60 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-medium">Order</th>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Payment</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {pageOrders.map(o => (
                    <tr
                      key={o.id}
                      className="hover:bg-zinc-800/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(o)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-white">{o.id}</span>
                        {o.tracking && <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate max-w-32">{o.tracking}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.customer?.fname} {o.customer?.lname}</div>
                        <div className="text-xs text-zinc-500">{o.customer?.email}</div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-zinc-400 capitalize text-xs">
                        {(o.payment?.method || o.paymentMethod || '—').replace(/_/g,' ')}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {fmtOrder(o)}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        {new Date(o.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                  <Package size={32} className="mb-2" />
                  <p className="text-sm">No orders found</p>
                  {search && <p className="text-xs mt-1">Try adjusting your search or filter</p>}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-xs text-zinc-400">
                <span>Showing {((page-1)*PER_PAGE)+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p-1))}
                    disabled={page === 1}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30"
                  >Prev</button>
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-2.5 py-1 rounded ${page === p ? 'bg-amber-500 text-black font-semibold' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                      >{p}</button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p+1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30"
                  >Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Order detail panel */}
      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </>
  );
}
