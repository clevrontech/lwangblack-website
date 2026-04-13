import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Mail, MessageSquare, Send, Users, TrendingUp, CheckCircle } from 'lucide-react';

const TEMPLATES = [
  { id: 'abandoned_cart', label: 'Abandoned cart recovery', icon: '🛒', desc: 'Re-engage customers who left without completing their purchase.' },
  { id: 'welcome',        label: 'Welcome new customers',    icon: '👋', desc: 'Send a welcome email to newly registered customers.' },
  { id: 'order_followup', label: 'Post-purchase follow-up', icon: '⭐', desc: 'Ask for a review 7 days after order delivery.' },
  { id: 'discount_blast', label: 'Promotional discount',    icon: '🎁', desc: 'Send a discount code to your entire customer list.' },
  { id: 'restock',        label: 'Back in stock alert',     icon: '📦', desc: 'Notify customers when a sold-out product is restocked.' },
];

function CampaignCard({ template, onSend }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await onSend(template.id);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch {}
    finally { setSending(false); }
  };

  return (
    <div className="bg-[#111] border border-white/8 rounded-xl p-4 flex items-start gap-4 hover:border-white/15 transition-colors">
      <div className="text-2xl flex-shrink-0 mt-0.5">{template.icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-white">{template.label}</p>
        <p className="text-xs text-white/40 mt-0.5">{template.desc}</p>
      </div>
      <button
        onClick={send}
        disabled={sending}
        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          sent ? 'bg-white/10 text-green-400' : 'bg-white text-black hover:bg-white/90'
        } disabled:opacity-50`}
      >
        {sent ? <><CheckCircle size={12}/> Sent</> : sending ? 'Sending…' : <><Send size={12}/> Send</>}
      </button>
    </div>
  );
}

export default function Marketing() {
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ type: 'email', subject: '', body: '', segment: 'all' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    apiFetch('/orders?limit=500')
      .then(d => {
        const orders = d.orders || [];
        const emails = new Set(orders.map(o => o.customer?.email).filter(Boolean));
        const revenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0);
        setStats({ customers: emails.size, totalOrders: orders.length, revenue });
      })
      .catch(() => setStats({ customers: 0, totalOrders: 0, revenue: 0 }));
  }, []);

  const sendCampaign = async (templateId) => {
    const res = await apiFetch('/notifications/send-email', {
      method: 'POST',
      body: {
        template: templateId,
        segment: 'all',
        subject: `Lwang Black — ${templateId.replace(/_/g,' ')}`,
      },
    }).catch(e => { alert(e.message); throw e; });
    return res;
  };

  const sendCustom = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.body) return alert('Subject and body are required.');
    setSending(true);
    try {
      await apiFetch(form.type === 'email' ? '/notifications/send-email' : '/notifications/send-sms', {
        method: 'POST',
        body: form.type === 'email'
          ? { subject: form.subject, html: form.body, segment: form.segment }
          : { body: form.body, segment: form.segment },
      });
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      setForm(p => ({ ...p, subject: '', body: '' }));
    } catch (err) { alert(err.message); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Marketing</h1>
        <p className="text-sm text-white/40 mt-1">Campaigns, email automation, and customer engagement.</p>
      </div>

      {/* Audience stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Email audience', value: stats.customers, icon: Users },
            { label: 'Total orders', value: stats.totalOrders, icon: TrendingUp },
            { label: 'Total revenue', value: `$${stats.revenue.toFixed(0)}`, icon: Mail },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-[#111] border border-white/8 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40">{label}</p>
                  <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <Icon size={20} className="text-white/30" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automation templates */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Automations</h2>
        <div className="space-y-2">
          {TEMPLATES.map(t => <CampaignCard key={t.id} template={t} onSend={sendCampaign} />)}
        </div>
      </div>

      {/* Custom campaign */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Custom campaign</h2>
        <form onSubmit={sendCustom} className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
          <div className="flex gap-2">
            {[{id:'email',label:'Email',icon:Mail},{id:'sms',label:'SMS',icon:MessageSquare}].map(({id,label,icon:Icon}) => (
              <button key={id} type="button" onClick={() => setForm(p=>({...p,type:id}))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${form.type===id ? 'bg-white text-black' : 'bg-white/8 text-white/50 hover:text-white'}`}>
                <Icon size={12}/>{label}
              </button>
            ))}
            <select value={form.segment} onChange={e => setForm(p=>({...p,segment:e.target.value}))}
              className="ml-auto bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none">
              <option value="all">All customers</option>
              <option value="nepal">Nepal only</option>
              <option value="international">International</option>
            </select>
          </div>
          {form.type === 'email' && (
            <input placeholder="Subject line" value={form.subject} onChange={e => setForm(p=>({...p,subject:e.target.value}))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30" />
          )}
          <textarea placeholder="Message body" value={form.body} onChange={e => setForm(p=>({...p,body:e.target.value}))} rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30 resize-none" />
          <button type="submit" disabled={sending}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${sent ? 'bg-white/10 text-green-400' : 'bg-white text-black hover:bg-white/90'} disabled:opacity-50`}>
            {sent ? <><CheckCircle size={14}/> Sent!</> : sending ? 'Sending…' : <><Send size={14}/> Send campaign</>}
          </button>
        </form>
      </div>
    </div>
  );
}
