import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { messageTypeMeta } from '../state/selectors.js';
import { MESSAGE_TYPES } from '../algorithm/constants.js';

const TYPE_FILTERS = ['ALL', MESSAGE_TYPES.REQUEST, MESSAGE_TYPES.REPLY, MESSAGE_TYPES.RELEASE];

/**
 * Every message the engine has sent (in flight and delivered), newest first, with
 * filters by type and process and a free-text search. Rows come from sim.messageLog only.
 */
export default function MessageLog({ sim, onClear }) {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [procFilter, setProcFilter] = useState('ALL');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...sim.messageLog].reverse().filter((m) => {
      if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;
      if (procFilter !== 'ALL' && m.from !== Number(procFilter) && m.to !== Number(procFilter)) return false;
      if (!q) return true;
      const hay = `P${m.from} P${m.to} ${m.type} ${m.ts} ${m.status} ${m.deferred ? 'deferred' : ''} ${m.sentAt}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sim.messageLog, typeFilter, procFilter, query]);

  const shown = rows.slice(0, 200);

  return (
    <section className="card" aria-labelledby="msglog-title" id="message-log">
      <header className="card-header">
        <div>
          <h2 id="msglog-title">Message Log</h2>
          <p className="muted small">
            Sent {sim.totals.sent} · Received {sim.totals.received}. Newest first; the log keeps the latest 300 messages.
          </p>
        </div>
        <button type="button" className="btn btn-small" onClick={onClear} disabled={sim.log.length === 0 && sim.messageLog.length === 0}>
          <Trash2 size={14} aria-hidden="true" /> Clear Log
        </button>
      </header>

      <div className="log-filters">
        <div className="segmented" role="group" aria-label="Filter by message type">
          {TYPE_FILTERS.map((t) => (
            <button key={t} type="button" aria-pressed={typeFilter === t} className={typeFilter === t ? 'is-active' : ''}
              onClick={() => setTypeFilter(t)}>
              {t === 'ALL' ? 'All' : t}
            </button>
          ))}
        </div>
        <label className="inline-field">
          <span>Process</span>
          <select value={procFilter} onChange={(e) => setProcFilter(e.target.value)}>
            <option value="ALL">All Processes</option>
            {sim.processes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="search-field">
          <Search size={14} aria-hidden="true" />
          <input type="search" placeholder="Search messages…" value={query}
            aria-label="Search messages" onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th><th>Sender</th><th>Receiver</th><th>Type</th><th>Clock</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={6} className="muted empty">
                {sim.messageLog.length === 0 ? 'No messages yet.' : 'No messages match these filters.'}
              </td></tr>
            )}
            {shown.map((m) => {
              const meta = messageTypeMeta(m.type);
              const inFlight = m.status === 'IN_FLIGHT';
              return (
                <tr key={m.id}>
                  <td>{m.wall} <span className="muted small">t={m.sentAt}</span></td>
                  <td>P{m.from}</td>
                  <td>P{m.to}</td>
                  <td>
                    <span className={`type-tag ${meta.className}`}>{meta.label}</span>
                    {m.deferred && <span className="chip chip-waiting tiny">deferred</span>}
                  </td>
                  <td>{m.ts}</td>
                  <td><span className={`status-tag ${inFlight ? 'is-flight' : 'is-delivered'}`}>{m.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <p className="hint">Showing the newest {shown.length} of {rows.length} matching messages.</p>
      )}
    </section>
  );
}
