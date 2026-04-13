import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { Plus, Trash2, Copy, X, Save, CheckCircle, Tag } from 'lucide-react';

const EMPTY = { code: '', type: 'percent', value: '', minOrder: '', maxUses: '', expiresAt: '', active: true };

function DiscountModal({ discount, onClose, onSaved }) {
  const [form, setForm] = useState(discount || EMPTY);
  const [saving, setSaving] = useState(false);
  const isEdit = !!discount?.id;
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const code = 'LB' + Array.from({length: 6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    set('code', code);
  };

  const save = async () => {
    if (!form.code || !form.value) return alert('Code and value are required.');
    setSaving(true);
    try {
      const body = {
        code: form.code.toUpperCase().trim(),
        type: form.type,
        value: parseFloat(form.value),
        minOrder: form.minOrder ? parseFloat(form.minOrder) : null,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        expiresAt: form.expiresAt || null,
        active: form.active,
      };
      const res = isEdit
        ? await apiFetch(`/discounts/${discount.id}`, { method: 'PUT', body })
        : await apiFetch('/discounts', { method: 'POST', body });
      onSaved(res.discount || { ...body, id: res.id || Date.now(), uses: 0 });
      onClose();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-[#111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="font-semibold">{isEdit ? 'Edit discount' : 'Create discount'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/8 rounded-lg text-white/40 hover:text-white"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 block mb-1">Discount code</label>
            <div className="flex gap-2">
              <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="SAVE20" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-white/30" />
              <button onClick={generateCode} className="px-3 py-2 bg-white/8 border border-white/10 rounded-lg text-xs text-white/60 hover:text-white">Generate</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 block mb-1">Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30">
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount</option>
                <option value="free_shipping">Free shipping</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">{form.type === 'percent' ? 'Discount %' : form.type === 'free_shipping' ? 'N/A' : 'Amount off'}</label>
              <input type="number" value={form.value} onChange={e => set('value', e.target.value)}
                disabled={form.type === 'free_shipping'} min="0" step="0.01"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30 disabled:opacity-30" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Min. order value</label>
              <input type="number" value={form.minOrder} onChange={e => set('minOrder', e.target.value)} min="0" placeholder="None"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Max uses</label>
              <input type="number" value={form.maxUses} onChange={e => set('maxUses', e.target.value)} min="1" placeholder="Unlimited"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Expiry date</label>
              <input type="date" value={form.expiresAt} onChange={e => set('expiresAt', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="w-4 h-4 accent-white" />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-white/8">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-white/8 text-white/60 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50">
            <Save size={14}/> {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/discounts').catch(() => ({ discounts: [] }));
      setDiscounts(data.discounts || []);
    } catch { setDiscounts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm('Delete this discount code?')) return;
    try { await apiFetch(`/discounts/${id}`, { method: 'DELETE' }); setDiscounts(p => p.filter(d => d.id !== id)); }
    catch (e) { alert(e.message); }
  };

  const copy = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 1500);
  };

  const handleSaved = (d) => {
    setDiscounts(prev => prev.find(x => x.id === d.id) ? prev.map(x => x.id === d.id ? d : x) : [d, ...prev]);
  };

  const now = new Date();

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Discounts</h1>
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black font-semibold text-sm rounded-lg hover:bg-white/90 transition-colors">
            <Plus size={16}/> Create discount
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse"/>)}</div>
        ) : (
          <div className="bg-[#111] border border-white/8 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-white/40 text-xs uppercase tracking-wide">
                  <th className="px-5 py-3 text-left font-medium">Code</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Value</th>
                  <th className="px-5 py-3 text-left font-medium">Uses</th>
                  <th className="px-5 py-3 text-left font-medium">Expires</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 w-20"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {discounts.map(d => {
                  const expired = d.expiresAt && new Date(d.expiresAt) < now;
                  const exhausted = d.maxUses && d.uses >= d.maxUses;
                  const active = d.active && !expired && !exhausted;
                  return (
                    <tr key={d.id} className="hover:bg-white/3 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{d.code}</span>
                          <button onClick={() => copy(d.code)} className="text-white/30 hover:text-white/70 transition-colors">
                            {copied === d.code ? <CheckCircle size={12} className="text-green-400"/> : <Copy size={12}/>}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-white/50 capitalize">{d.type?.replace('_',' ')}</td>
                      <td className="px-5 py-3 font-mono">
                        {d.type === 'percent' ? `${d.value}%` : d.type === 'free_shipping' ? 'Free ship' : `$${d.value}`}
                      </td>
                      <td className="px-5 py-3 text-white/50">{d.uses || 0}{d.maxUses ? `/${d.maxUses}` : ''}</td>
                      <td className="px-5 py-3 text-white/50 text-xs">
                        {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? 'bg-white/10 text-white' : 'bg-white/5 text-white/30'}`}>
                          {expired ? 'Expired' : exhausted ? 'Exhausted' : active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setModal(d)} className="p-1.5 hover:bg-white/8 rounded text-white/40 hover:text-white transition-colors text-xs">Edit</button>
                          <button onClick={() => del(d.id)} className="p-1.5 hover:bg-red-500/10 rounded text-white/30 hover:text-red-400 transition-colors"><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {discounts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 text-white/30">
                <Tag size={32} className="mb-2"/>
                <p className="text-sm">No discount codes yet</p>
                <button onClick={() => setModal({})} className="mt-2 text-xs text-white/50 hover:text-white">+ Create your first discount</button>
              </div>
            )}
          </div>
        )}
      </div>
      {modal !== null && <DiscountModal discount={modal?.id ? modal : null} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </>
  );
}
