import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';
import {
  Search, Plus, Package, AlertTriangle, Pencil, Trash2, X, Save, Image as ImageIcon,
  BarChart2, RefreshCw, TrendingDown, AlertOctagon, CheckCircle, Layers, Hash,
  UploadCloud, Link as LinkIcon,
} from 'lucide-react';

// ── Stock badge ───────────────────────────────────────────────────────────────
function StockBadge({ stock, threshold = 10 }) {
  if (stock <= 0)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Out of stock</span>;
  if (stock < threshold)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{stock} left</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{stock} in stock</span>;
}

// ── Drag-and-drop image uploader ──────────────────────────────────────────────
function ImageUploader({ value, onChange }) {
  const [dragging, setDragging]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [tab, setTab]               = useState('upload'); // 'upload' | 'url'
  const [urlInput, setUrlInput]     = useState(value || '');
  const [error, setError]           = useState('');
  const inputRef = useRef(null);

  // Keep url input in sync when value changes externally
  useEffect(() => { if (tab === 'url') setUrlInput(value || ''); }, [value, tab]);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please drop an image file.'); return; }
    if (file.size > 8 * 1024 * 1024)    { setError('Image must be under 8 MB.');   return; }
    setError('');
    setUploading(true);

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    onChange(localUrl);

    try {
      const form = new FormData();
      form.append('image', file);
      const data = await apiFetch('/upload/image', { method: 'POST', body: form });
      onChange(data.url); // replace local blob with server URL
    } catch (err) {
      setError(err.message);
      onChange(''); // reset on failure
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const onPickFile = (e) => handleFile(e.target.files[0]);

  const applyUrl = () => {
    setError('');
    onChange(urlInput.trim());
  };

  const clear = () => {
    onChange('');
    setUrlInput('');
    setError('');
  };

  return (
    <div className="space-y-2">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 text-xs">
        <button type="button" onClick={() => setTab('upload')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition-colors
            ${tab === 'upload' ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
          <UploadCloud size={12} /> Upload file
        </button>
        <button type="button" onClick={() => setTab('url')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition-colors
            ${tab === 'url' ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
          <LinkIcon size={12} /> Paste URL
        </button>
        {value && (
          <button type="button" onClick={clear}
            className="ml-auto flex items-center gap-1 px-2 py-1.5 text-xs text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10">
            <X size={11} /> Remove
          </button>
        )}
      </div>

      {tab === 'upload' ? (
        <>
          {/* Drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none
              ${dragging ? 'border-amber-500 bg-amber-500/10 scale-[1.01]' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/40'}
              ${uploading ? 'pointer-events-none opacity-70' : ''}
              ${value ? 'h-36' : 'h-40'}`}>

            {value ? (
              /* Preview */
              <>
                <img src={value} alt="Product preview"
                  className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-40" />
                <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                  <UploadCloud size={20} className="text-amber-400" />
                  <p className="text-xs text-zinc-300 font-medium">Drop or click to replace</p>
                </div>
              </>
            ) : uploading ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw size={22} className="text-amber-400 animate-spin" />
                <p className="text-xs text-zinc-400">Uploading…</p>
              </div>
            ) : (
              <>
                <UploadCloud size={28} className={`transition-colors ${dragging ? 'text-amber-400' : 'text-zinc-500'}`} />
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300">Drag & drop an image here</p>
                  <p className="text-xs text-zinc-500 mt-0.5">or <span className="text-amber-400 underline">click to browse</span></p>
                  <p className="text-xs text-zinc-600 mt-1">JPEG · PNG · WebP · GIF · AVIF — max 8 MB</p>
                </div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        </>
      ) : (
        /* URL tab */
        <div className="flex gap-2">
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyUrl()}
            placeholder="https://example.com/image.jpg"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
          />
          <button type="button" onClick={applyUrl}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm rounded-lg font-medium">
            Apply
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle size={11} /> {error}
        </p>
      )}

      {/* Image preview strip (shown in both tabs when a value exists) */}
      {value && (
        <div className="flex items-center gap-3 bg-zinc-800/60 rounded-xl p-2.5">
          <img src={value} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0 border border-zinc-700" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-300 truncate">{value.startsWith('/uploads/') ? value.split('/').pop() : 'External URL'}</p>
            <p className="text-xs text-zinc-500 truncate">{value}</p>
          </div>
          <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
        </div>
      )}
    </div>
  );
}

// ── Product modal ─────────────────────────────────────────────────────────────
const EMPTY = { name: '', description: '', price: '', stock: '', category: '', image: '', weight: '', sku: '', low_stock_threshold: '10' };

function ProductModal({ product, onClose, onSaved }) {
  const [form, setForm]   = useState(product
    ? { ...EMPTY, ...product, price: product.price ?? '', stock: product.stock ?? '', low_stock_threshold: product.low_stock_threshold || '10' }
    : EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!product?.id;

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { alert('Product name is required.'); return; }
    if (!form.price)       { alert('Price is required.'); return; }
    setSaving(true);
    try {
      const usdPrice = parseFloat(form.price) || 0;
      // Build multi-currency prices object from the USD base price
      const prices = {
        AU: { amount: +(usdPrice * 1.54).toFixed(2), currency: 'AUD', symbol: 'A$', display: `A$${(usdPrice * 1.54).toFixed(2)}` },
        US: { amount: usdPrice, currency: 'USD', symbol: '$', display: `$${usdPrice.toFixed(2)}` },
        GB: { amount: +(usdPrice * 0.79).toFixed(2), currency: 'GBP', symbol: '£', display: `£${(usdPrice * 0.79).toFixed(2)}` },
        NP: { amount: +(usdPrice * 135).toFixed(0), currency: 'NPR', symbol: 'Rs', display: `Rs ${(usdPrice * 135).toFixed(0)}` },
        CA: { amount: +(usdPrice * 1.38).toFixed(2), currency: 'CAD', symbol: 'CA$', display: `CA$${(usdPrice * 1.38).toFixed(2)}` },
        NZ: { amount: +(usdPrice * 1.66).toFixed(2), currency: 'NZD', symbol: 'NZ$', display: `NZ$${(usdPrice * 1.66).toFixed(2)}` },
        JP: { amount: +(usdPrice * 150).toFixed(0), currency: 'JPY', symbol: '¥', display: `¥${(usdPrice * 150).toFixed(0)}` },
        CN: { amount: +(usdPrice * 7.2).toFixed(2), currency: 'CNY', symbol: '¥', display: `¥${(usdPrice * 7.2).toFixed(2)}` },
        DEFAULT: { amount: usdPrice, currency: 'USD', symbol: '$', display: `$${usdPrice.toFixed(2)}` },
      };

      const body = {
        name: form.name,
        description: form.description,
        image: form.image,
        category: form.category || 'coffee',
        prices,
        stock:               parseInt(form.stock) || 0,
        low_stock_threshold: parseInt(form.low_stock_threshold) || 10,
        weight_g:            form.weight ? parseFloat(form.weight) : undefined,
        sku:                 form.sku || undefined,
        allowed_regions:     'ALL',
        badge:               form.badge || null,
        // keep price as convenience field for display in admin
        price: usdPrice,
      };
      const result = isEdit
        ? await apiFetch(`/products/${product.id}`, { method: 'PUT', body })
        : await apiFetch('/products', { method: 'POST', body });
      onSaved(result.product || { ...body, id: result.id || result.productId || String(Date.now()) });
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="font-semibold">{isEdit ? 'Edit product' : 'Add product'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Image upload */}
          <div>
            <label className="block text-xs text-zinc-400 mb-2 font-medium">Product image</label>
            <ImageUploader value={form.image} onChange={v => setF('image', v)} />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Product name *</label>
            <input value={form.name} onChange={e => setF('name', e.target.value)}
              placeholder="Lwang Black Espresso 250g"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={3}
              placeholder="Product description..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" />
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Price (USD) *</label>
              <input type="number" value={form.price} onChange={e => setF('price', e.target.value)}
                placeholder="0.00" min="0" step="0.01"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Stock quantity</label>
              <input type="number" value={form.stock} onChange={e => setF('stock', e.target.value)}
                placeholder="0" min="0"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Low-stock alert at</label>
              <input type="number" value={form.low_stock_threshold} onChange={e => setF('low_stock_threshold', e.target.value)}
                placeholder="10" min="1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Category</label>
              <input value={form.category} onChange={e => setF('category', e.target.value)}
                placeholder="Coffee, Merch..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">SKU</label>
              <input value={form.sku} onChange={e => setF('sku', e.target.value)}
                placeholder="LB-ESP-250"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Weight (g)</label>
              <input type="number" value={form.weight} onChange={e => setF('weight', e.target.value)}
                placeholder="250"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-zinc-800 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50">
            <Save size={14} /> {isEdit ? 'Save changes' : 'Add product'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock adjust modal ────────────────────────────────────────────────────────
function StockModal({ product, onClose, onUpdated }) {
  const [mode, setMode]     = useState('set');
  const [value, setValue]   = useState(String(product.stock || 0));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = mode === 'set'
    ? Math.max(0, parseInt(value) || 0)
    : Math.max(0, (product.stock || 0) + (parseInt(value) || 0));

  const apply = async () => {
    setSaving(true);
    try {
      const body = mode === 'set'
        ? { set: parseInt(value), reason }
        : { adjustment: parseInt(value), reason };
      const res = await apiFetch(`/products/${product.id}/stock`, { method: 'PATCH', body });
      onUpdated(product.id, res.stock);
      onClose();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-sm">Adjust Stock</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[220px]">{product.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400"><X size={15} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Current:</span>
            <span className="font-mono font-medium text-zinc-200">{product.stock || 0}</span>
            <span className="text-zinc-600">→</span>
            <span className={`font-mono font-medium ${preview <= 0 ? 'text-red-400' : preview < (product.low_stock_threshold || 10) ? 'text-amber-400' : 'text-green-400'}`}>
              {preview}
            </span>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            {['set', 'adjust'].map(m => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setValue(m === 'set' ? String(product.stock || 0) : '0'); }}
                className={`flex-1 py-2 text-xs font-medium transition-colors
                  ${mode === m ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                {m === 'set' ? 'Set exact' : 'Adjust ±'}
              </button>
            ))}
          </div>
          <input type="number" value={value} onChange={e => setValue(e.target.value)}
            placeholder={mode === 'adjust' ? '+10 or -5' : 'New quantity'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg">Cancel</button>
            <button onClick={apply} disabled={saving}
              className="flex-1 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 text-black rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inventory summary tiles ───────────────────────────────────────────────────
function InventorySummary({ products }) {
  const total      = products.length;
  const outOfStock = products.filter(p => (p.stock || 0) <= 0).length;
  const lowStock   = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.low_stock_threshold || 10)).length;
  const inStock    = total - outOfStock - lowStock;

  const Tile = ({ icon, label, val, cls }) => (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-zinc-800 ${cls}`}>{icon}</div>
      <div><p className="text-xl font-bold">{val}</p><p className="text-xs text-zinc-500">{label}</p></div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Tile icon={<Layers size={16} />}       label="Total Products" val={total}      cls="text-zinc-300" />
      <Tile icon={<CheckCircle size={16} />}  label="In Stock"       val={inStock}    cls="text-green-400" />
      <Tile icon={<TrendingDown size={16} />} label="Low Stock"      val={lowStock}   cls="text-amber-400" />
      <Tile icon={<AlertOctagon size={16} />} label="Out of Stock"   val={outOfStock} cls="text-red-400" />
    </div>
  );
}

// ── Alerts panel ──────────────────────────────────────────────────────────────
function AlertsPanel({ alerts, onResolve }) {
  if (!alerts.length) return null;
  return (
    <div className="bg-zinc-900 border border-amber-500/20 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-400" />
        <h3 className="text-sm font-medium text-amber-300">Inventory Alerts</h3>
        <span className="ml-auto text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
          {alerts.length} active
        </span>
      </div>
      <div className="divide-y divide-zinc-800">
        {alerts.slice(0, 10).map(a => (
          <div key={a.id || a.product_id} className="flex items-center gap-3 px-4 py-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.alert_type === 'out_of_stock' ? 'bg-red-500' : 'bg-amber-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.product_name}</p>
              <p className="text-xs text-zinc-500">
                {a.alert_type === 'out_of_stock'
                  ? 'Out of stock'
                  : `Low stock: ${a.current_qty ?? a.current_stock} remaining (threshold: ${a.threshold})`}
              </p>
            </div>
            <button onClick={() => onResolve(a.id || a.product_id)}
              className="flex-shrink-0 text-xs text-zinc-500 hover:text-green-400 flex items-center gap-1">
              <CheckCircle size={12} /> Resolve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Products component ───────────────────────────────────────────────────
export default function Products() {
  const [products, setProducts]       = useState([]);
  const [filtered, setFiltered]       = useState([]);
  const [alerts, setAlerts]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy]           = useState('name');
  const [modal, setModal]             = useState(null);
  const [stockModal, setStockModal]   = useState(null);
  const [view, setView]               = useState('grid');

  const load = useCallback(async () => {
    try {
      const [data, alertData] = await Promise.all([
        apiFetch('/products').catch(() => ({ products: [] })),
        apiFetch('/products/inventory/alerts').catch(() => ({ alerts: [] })),
      ]);
      setProducts(data.products || []);
      setAlerts(alertData.alerts || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let list = [...products];
    if (stockFilter === 'low')  list = list.filter(p => (p.stock||0) > 0 && (p.stock||0) < (p.low_stock_threshold||10));
    if (stockFilter === 'out')  list = list.filter(p => (p.stock||0) <= 0);
    if (stockFilter === 'good') list = list.filter(p => (p.stock||0) >= (p.low_stock_threshold||10));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === 'name')       return (a.name||'').localeCompare(b.name||'');
      if (sortBy === 'price_desc') return (b.price||0) - (a.price||0);
      if (sortBy === 'price_asc')  return (a.price||0) - (b.price||0);
      if (sortBy === 'stock_desc') return (b.stock||0) - (a.stock||0);
      if (sortBy === 'stock_asc')  return (a.stock||0) - (b.stock||0);
      return 0;
    });
    setFiltered(list);
  }, [products, search, stockFilter, sortBy]);

  const deleteProduct = async (id) => {
    if (!window.confirm('Archive this product? It will be hidden from the store.')) return;
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' });
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (err) { alert(err.message); }
  };

  const handleSaved = (product) => {
    setProducts(prev => {
      const exists = prev.find(p => p.id === product.id);
      return exists ? prev.map(p => p.id === product.id ? product : p) : [product, ...prev];
    });
    apiFetch('/products/inventory/alerts').then(d => setAlerts(d.alerts || [])).catch(() => {});
  };

  const handleStockUpdated = (productId, newStock) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, stock: newStock } : p));
    apiFetch('/products/inventory/alerts').then(d => setAlerts(d.alerts || [])).catch(() => {});
  };

  const resolveAlert = async (alertId) => {
    try {
      await apiFetch(`/products/inventory/alerts/${alertId}/resolve`, { method: 'PATCH' });
      setAlerts(prev => prev.filter(a => (a.id || a.product_id) !== alertId));
    } catch {}
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Products & Inventory</h1>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200" title="Refresh">
              <RefreshCw size={15} />
            </button>
            <button onClick={() => setView(v => v === 'grid' ? 'list' : 'grid')}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200" title="Toggle view">
              <BarChart2 size={15} />
            </button>
            <button onClick={() => setModal({})}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded-lg transition-colors">
              <Plus size={16} /> Add product
            </button>
          </div>
        </div>

        {!loading && products.length > 0 && <InventorySummary products={products} />}

        {alerts.length > 0 && <AlertsPanel alerts={alerts} onResolve={resolveAlert} />}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex-1 min-w-48 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, SKU, category..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-700" />
          </div>
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
            <option value="all">All stock</option>
            <option value="good">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
            <option value="name">Name A–Z</option>
            <option value="price_desc">Price high–low</option>
            <option value="price_asc">Price low–high</option>
            <option value="stock_desc">Most stock</option>
            <option value="stock_asc">Least stock</option>
          </select>
        </div>

        {/* Product list / grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-52 bg-zinc-800/60 rounded-xl animate-pulse" />)}
          </div>
        ) : view === 'list' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-zinc-800 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {p.image
                            ? <img src={p.image} alt="" className="w-full h-full object-cover" />
                            : <Package size={14} className="text-zinc-600" />}
                        </div>
                        <span className="font-medium line-clamp-1">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                      <div className="flex items-center gap-1"><Hash size={10} />{p.sku || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{p.category || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-amber-400">${(p.price||0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <StockBadge stock={p.stock || 0} threshold={p.low_stock_threshold || 10} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setStockModal(p)} title="Adjust stock"
                          className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-amber-400"><Layers size={13} /></button>
                        <button onClick={() => setModal(p)} title="Edit"
                          className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200"><Pencil size={13} /></button>
                        <button onClick={() => deleteProduct(p.id)} title="Archive"
                          className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-zinc-500"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(p => (
              <div key={p.id}
                className={`bg-zinc-900 border rounded-xl overflow-hidden hover:border-zinc-600 transition-colors group
                  ${(p.stock||0) <= 0 ? 'border-red-500/30' : (p.stock||0) < (p.low_stock_threshold||10) ? 'border-amber-500/30' : 'border-zinc-800'}`}>
                <div className="aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden relative">
                  {p.image
                    ? <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <Package size={32} className="text-zinc-600" />}
                  {(p.stock||0) <= 0 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-full border border-red-500/30">OUT OF STOCK</span>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <p className="font-medium text-sm leading-tight line-clamp-2">{p.name}</p>
                  {p.sku && <p className="text-xs text-zinc-600 font-mono flex items-center gap-1"><Hash size={9} />{p.sku}</p>}
                  {p.category && <p className="text-xs text-zinc-500">{p.category}</p>}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-amber-400">${(p.price||0).toFixed(2)}</span>
                    <StockBadge stock={p.stock||0} threshold={p.low_stock_threshold||10} />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button onClick={() => setStockModal(p)} title="Adjust stock"
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-amber-400"><Layers size={12} /></button>
                    <button onClick={() => setModal(p)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors">
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => deleteProduct(p.id)}
                      className="p-1.5 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-zinc-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
            <Package size={40} className="mb-3" />
            <p className="text-sm">{search ? 'No products found' : 'No products yet'}</p>
            {!search && (
              <button onClick={() => setModal({})} className="mt-3 text-xs text-amber-400 hover:text-amber-300">
                + Add your first product
              </button>
            )}
          </div>
        )}
      </div>

      {modal !== null && (
        <ProductModal
          product={modal && modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {stockModal && (
        <StockModal
          product={stockModal}
          onClose={() => setStockModal(null)}
          onUpdated={handleStockUpdated}
        />
      )}
    </>
  );
}
