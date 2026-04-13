import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Mail, MessageSquare, FileText } from 'lucide-react';

export default function Notifications() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendForm, setSendForm] = useState({ type: 'email', to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch('/notifications/log');
        setLog(data.notifications || []);
      } catch (err) {
        console.error('Notifications load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      if (sendForm.type === 'email') {
        await apiFetch('/notifications/send-email', {
          method: 'POST',
          body: { to: sendForm.to, subject: sendForm.subject, html: sendForm.body },
        });
      } else {
        await apiFetch('/notifications/send-sms', {
          method: 'POST',
          body: { to: sendForm.to, body: sendForm.body },
        });
      }
      alert('Sent!');
      setSendForm({ ...sendForm, to: '', subject: '', body: '' });
      const data = await apiFetch('/notifications/log');
      setLog(data.notifications || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>

      {/* Send form */}
      <form onSubmit={send} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-zinc-400">Send Notification</h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSendForm({ ...sendForm, type: 'email' })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sendForm.type === 'email' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
            <Mail size={12} /> Email
          </button>
          <button type="button" onClick={() => setSendForm({ ...sendForm, type: 'sms' })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sendForm.type === 'sms' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
            <MessageSquare size={12} /> SMS
          </button>
        </div>
        <input
          placeholder={sendForm.type === 'email' ? 'Recipient email' : 'Phone number (+977...)'}
          value={sendForm.to}
          onChange={e => setSendForm({ ...sendForm, to: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
          required
        />
        {sendForm.type === 'email' && (
          <input
            placeholder="Subject"
            value={sendForm.subject}
            onChange={e => setSendForm({ ...sendForm, subject: e.target.value })}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
            required
          />
        )}
        <textarea
          placeholder="Message body"
          value={sendForm.body}
          onChange={e => setSendForm({ ...sendForm, body: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 h-24"
          required
        />
        <button type="submit" disabled={sending}
          className="px-4 py-2 bg-amber-500 text-zinc-950 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors">
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {/* Log */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-400">Notification Log</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-zinc-500">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Recipient</th>
                  <th className="px-4 py-3 text-left">Subject</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Provider</th>
                  <th className="px-4 py-3 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {log.map(n => (
                  <tr key={n.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-4 py-3">
                      {n.type === 'email' ? <Mail size={14} className="text-blue-400" /> : <MessageSquare size={14} className="text-green-400" />}
                    </td>
                    <td className="px-4 py-3 text-xs">{n.recipient}</td>
                    <td className="px-4 py-3 text-xs truncate max-w-xs">{n.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${n.status === 'sent' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{n.provider}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{new Date(n.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!log.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No notifications yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
