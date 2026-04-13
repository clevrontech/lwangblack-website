import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import {
  Search, Plus, Package, AlertTriangle, Pencil, Trash2,
  X, Save, Image, ArrowUpDown, ChevronDown
} from 'lucide-react';

function StockBadge({ stock }) {
  if (stock <= 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Out of stock</span>;
  if (stock < 10) return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{stock} left</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">{stock} in stock</span>;
}

const EMPTY_PRODUCT = { name: '', description: '', price: '', stock: '', category: '', image: '', weight: '', sku: '' };

function ProductModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState(product || EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);
  const isEdit = !!product?.id;

  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.name || !form.price) return alert('Name and price are required.');
    setSaving(true);
    try {
      const body = { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) || 0 };
      const result = isEdit
        ? await apiFetch(`/products/${product.id}`, { method: 'PUT', body })
        : await apiFetch('/products', { method: 'POST', body });
      onSaved(result.product || { ...body, id: result.id || Date.now() });
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
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h2 className="font-semibold">{isEdit ? 'Edit product' : 'Add product'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Image preview */}
          <div className="flex gap-4 items-start">
            <div className="w-20 h-20 bg-zinc-800 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center">
              {form.image
                ? <img src={form.image} alt="" className="w-full h-full object-cover" />
                : <Image size={24} className="text-zinc-600" />}
            </div>
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Image URL</label>
              <input
                value={form.image}
                onChange={e => setF('image', e.target.value)}
                placeholder="https://..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Product name *</label>
            <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Lwang Black Espresso 250g"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={3}
              placeholder="Product description..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Price (USD) *</label>
              <input type="number" value={form.price} onChange={e => setF('price', e.target.value)} placeholder="0.00" min="0" step="0.01"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Stock quantity</label>
              <input type="number" value={form.stock} onChange={e => setF('stock', e.target.value)} placeholder="0" min="0"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Category</label>
              <input value={form.category} onChange={e => setF('category', e.target.value)} placeholder="Coffee, Merch..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">SKU</label>
              <input value={form.sku} onChange={e => setF('sku', e.target.value)} placeholder="LB-ESP-250"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Weight (g)</label>
              <input type="number" value={form.weight} onChange={e => setF('weight', e.target.value)} placeholder="250"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-zinc-800">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50">
            <Save size={14} /> {isEdit ? 'Save changes' : 'Add product'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [modal, setModal] = useState(null); // null | {} (new) | product (edit)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/products');
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let list = [...products];
    if (stockFilter === 'low') list = list.filter(p => (p.stock||0) > 0 && (p.stock||0) < 10);
    if (stockFilter === 'out') list = list.filter(p => (p.stock||0) <= 0);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortBy === 'name') return (a.name||'').localeCompare(b.name||'');
      if (sortBy === 'price_desc') return (b.price||0)-(a.price||0);
      if (sortBy === 'price_asc')  return (a.price||0)-(b.price||0);
      if (sortBy === 'stock_desc') return (b.stock||0)-(a.stock||0);
      return 0;
    });
    setFiltered(list);
  }, [products, search, stockFilter, sortBy]);

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete this product?')) return;
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
  };

  const lowStock = products.filter(p => (p.stock||0) > 0 && (p.stock||0) < 10);
  const outOfStock = products.filter(p => (p.stock||0) <= 0);

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Products</h1>
          <button
            onClick={() => setModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus size={16} /> Add product
          </button>
        </div>

        {/* Stock alerts */}
        {(lowStock.length > 0 || outOfStock.length > 0) && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3 text-sm">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            <span className="text-amber-300">
              {outOfStock.length > 0 && `${outOfStock.length} out of stock`}
              {outOfStock.length > 0 && lowStock.length > 0 && ' · '}
              {lowStock.length > 0 && `${lowStock.length} low stock`}
            </span>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-700" />
          </div>
          <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
            <option value="all">All stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
            <option value="name">Name A–Z</option>
            <option value="price_desc">Price high–low</option>
            <option value="price_asc">Price low–high</option>
            <option value="stock_desc">Most stock</option>
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-48 bg-zinc-800/60 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(p => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors group">
                <div className="aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {p.image
                    ? <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <Package size={32} className="text-zinc-600" />}
                </div>
                <div className="p-3 space-y-1.5">
                  <p className="font-medium text-sm leading-tight line-clamp-2">{p.name}</p>
                  {p.category && <p className="text-xs text-zinc-500">{p.category}</p>}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-amber-400">${(p.price||0).toFixed(2)}</span>
                    <StockBadge stock={p.stock || 0} />
                  </div>
                  <div className="flex gap-1.5 pt-1">
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
    </>
  );
}
