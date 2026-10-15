import { procName, isPending } from '../algorithm/ricartAgrawala.js';
import { PROCESS_STATES as PS } from '../algorithm/constants.js';
import { STATE_META, requestStatusOf, formatWait } from '../state/selectors.js';

/** Details for the selected process (derived entirely from simulator state). */
export default function ProcessDetails({ sim, selectedId }) {
  const p = sim.processes[selectedId - 1];
  if (!p) return null;
  const meta = STATE_META[p.state];
  const required = sim.n - 1;
  const hasRequest = p.reqTs !== null && (isPending(p) || p.state === PS.IN_CRITICAL_SECTION || p.state === PS.RELEASING);
  const repliesNow = isPending(p) || p.state === PS.IN_CRITICAL_SECTION ? p.replies.length : 0;

  const rows = [
    ['Process ID', procName(p.id)],
    ['Logical Clock', p.clock],
    ['Request Timestamp', hasRequest ? `${p.reqTs}  (priority key ${p.reqTs}, ${p.id})` : '—'],
    ['Request Status', requestStatusOf(p)],
    ['Replies Received', `${repliesNow} / ${required}`],
    ['Replies Required', required],
    ['Deferred Replies', p.deferred.length],
    ['Times in CS', p.entries],
    ['Average Wait', p.entries === 0 ? '—' : formatWait(p.totalWait / p.entries)],
    ['Last Wait', p.lastWait === null ? '—' : `${p.lastWait} ticks`],
    ['Messages Sent', p.sent],
    ['Messages Received', p.received],
    ['Requests Made', p.requestsMade],
  ];

  return (
    <section className="card" aria-labelledby="details-title">
      <header className="card-header">
        <div>
          <h2 id="details-title">Process Details · {procName(p.id)}</h2>
          <p className="muted small">{meta.description}</p>
        </div>
        <span className={`state-chip chip-${meta.tone}`}>{meta.label}</span>
      </header>

      <dl className="details-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="details-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="details-block">
        <dt>Deferred Replies</dt>
        <dd>
          {p.deferred.length === 0
            ? 'None'
            : p.deferred.map((id) => (
                <span key={id} className="chip chip-waiting">{procName(id)}</span>
              ))}
        </dd>
      </div>
      <div className="details-block">
        <dt>Replies Collected From</dt>
        <dd>
          {p.replies.length === 0
            ? 'None yet'
            : p.replies.map((id) => <span key={id} className="chip chip-reply">{procName(id)}</span>)}
        </dd>
      </div>
      {p.lastRelease && (
        <div className="details-block">
          <dt>Last RELEASE notice received</dt>
          <dd>From {procName(p.lastRelease.from)} (ts {p.lastRelease.ts})</dd>
        </div>
      )}
    </section>
  );
}
