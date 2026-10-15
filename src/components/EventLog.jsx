import { useEffect, useMemo, useRef } from 'react';
import { Trash2 } from 'lucide-react';

const KIND_LABEL = {
  system: 'SYS', request: 'REQ', reply: 'REP', release: 'REL', defer: 'DEF',
  enter: 'CS+', exit: 'CS−', demo: 'DEMO', error: 'ERR', violation: 'VIOL',
};

/**
 * Simulation Timeline: the event log filtered to local events (entries without a msgType).
 * Message sends and receipts are shown in the Message Log instead.
 */
export default function EventLog({ sim, limit, onLimitChange, onClear, limitOptions }) {
  const events = useMemo(() => sim.log.filter((e) => !e.msgType), [sim.log]);
  const visible = events.slice(-limit);
  const scrollRef = useRef(null);

  // Keep the newest entry in view; the effect only touches the log container, not the page.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, limit]);

  return (
    <section className="card" aria-labelledby="log-title" id="event-log">
      <header className="card-header">
        <div>
          <h2 id="log-title">Simulation Timeline</h2>
          <p className="muted small">
            {events.length} events kept ({visible.length} shown). Oldest entries are discarded beyond the cap.
          </p>
        </div>
        <div className="log-tools">
          <label className="inline-field">
            <span>Show last</span>
            <select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
              {limitOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-small" onClick={onClear} disabled={sim.log.length === 0}>
            <Trash2 size={14} aria-hidden="true" /> Clear Log
          </button>
        </div>
      </header>

      <div className="log-scroll" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions">
        {visible.length === 0 && <p className="muted empty">No events yet. Start the simulation or request the critical section.</p>}
        {visible.map((e) => (
          <div key={e.id} className={`log-entry kind-${e.kind}`}>
            <span className="log-time">[{e.wall}]</span>
            <span className="log-tick">t={e.sim}</span>
            <span className={`log-kind kind-badge-${e.kind}`}>{KIND_LABEL[e.kind] ?? e.kind}</span>
            <span className="log-text">{e.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
