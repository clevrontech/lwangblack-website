import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Truck, MapPin, Search } from 'lucide-react';

export default function Logistics() {
  const [zones, setZones] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [trackInput, setTrackInput] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [z, c] = await Promise.all([
          apiFetch('/logistics/zones').catch(() => ({ zones: [] })),
          apiFetch('/logistics/carriers').catch(() => ({ carriers: [] })),
        ]);
        setZones(z.zones || []);
        setCarriers(c.carriers || []);
      } catch (err) {
        console.error('Logistics load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const track = async (e) => {
    e.preventDefault();
    if (!trackInput.trim()) return;
    try {
      const data = await apiFetch('/logistics/track', {
        method: 'POST',
        body: { trackingNumber: trackInput.trim() },
      });
      setTrackResult(data.tracking);
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-zinc-500">Loading logistics...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logistics</h1>

      {/* Track shipment */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
          <Search size={14} /> Track Shipment
        </h3>
        <form onSubmit={track} className="flex gap-2">
          <input
            type="text"
            placeholder="Enter tracking number..."
            value={trackInput}
            onChange={e => setTrackInput(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
          />
          <button type="submit" className="px-4 py-2 bg-amber-500 text-zinc-950 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors">
            Track
          </button>
        </form>

        {trackResult && (
          <div className="mt-4 bg-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Truck size={20} className="text-amber-500" />
              <div>
                <p className="font-medium">{trackResult.carrier} — {trackResult.number}</p>
                <p className="text-sm text-zinc-400">Status: <span className="text-amber-400">{trackResult.status}</span></p>
              </div>
              {trackResult.demo && <span className="ml-auto text-xs bg-zinc-700 px-2 py-1 rounded">Demo</span>}
            </div>
            <p className="text-sm text-zinc-400">{trackResult.description}</p>
            {trackResult.events?.length > 0 && (
              <div className="mt-3 space-y-2">
                {trackResult.events.map((ev, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <span className="text-zinc-500 min-w-[120px]">{new Date(ev.time).toLocaleString()}</span>
                    <span className="text-zinc-300">{ev.description}</span>
                    {ev.location && <span className="text-zinc-500">{ev.location}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delivery Zones */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
          <MapPin size={16} className="text-amber-500" />
          <h3 className="text-sm font-medium text-zinc-400">Delivery Zones</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Zone</th>
                <th className="px-4 py-3 text-left">Country</th>
                <th className="px-4 py-3 text-right">Shipping Cost</th>
                <th className="px-4 py-3 text-right">Free Above</th>
                <th className="px-4 py-3 text-left">Est. Delivery</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(z => (
                <tr key={z.id || z.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium">{z.name}</td>
                  <td className="px-4 py-3 text-xs">{z.country}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {parseFloat(z.shipping_cost) === 0 ? <span className="text-green-400">FREE</span> : `${z.currency} ${z.shipping_cost}`}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-400">
                    {z.free_above ? `${z.currency} ${z.free_above}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{z.estimated_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Carriers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
          <Truck size={16} className="text-amber-500" />
          <h3 className="text-sm font-medium text-zinc-400">Available Carriers</h3>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {carriers.map(c => (
            <div key={c.id} className="bg-zinc-800 rounded-lg p-3 flex items-center gap-3">
              <div>
                <p className="font-medium text-sm">{c.name}</p>
                <p className="text-xs text-zinc-500">
                  {c.global ? 'Global' : ''}{c.nepal ? 'Nepal' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
