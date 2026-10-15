import { STATE_META, formatWait, selectStats } from '../state/selectors.js';
import { MESSAGE_TYPES as MT } from '../algorithm/constants.js';

/** One horizontal bar chart drawn with plain CSS (no chart dependency). */
function BarChart({ title, data, format = (v) => v, emptyText = 'No data yet' }) {
  const max = Math.max(0, ...data.map((d) => d.value ?? 0));
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {max === 0 ? (
        <p className="muted small">{emptyText}</p>
      ) : (
        <ul className="bars" aria-label={title}>
          {data.map((d) => (
            <li key={d.label} className="bar-row">
              <span className="bar-label">{d.label}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${((d.value ?? 0) / max) * 100}%` }} />
              </span>
              <span className="bar-value">{d.value === null ? '—' : format(d.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Message-type distribution as one stacked bar with a legend. */
function TypeDistribution({ byType }) {
  const total = byType[MT.REQUEST] + byType[MT.REPLY] + byType[MT.RELEASE];
  const parts = [
    { key: MT.REQUEST, cls: 'seg-request' },
    { key: MT.REPLY, cls: 'seg-reply' },
    { key: MT.RELEASE, cls: 'seg-release' },
  ];
  return (
    <figure className="chart">
      <figcaption>Message-type distribution</figcaption>
      {total === 0 ? (
        <p className="muted small">No messages yet</p>
      ) : (
        <>
          <div className="stack-bar" role="img" aria-label={parts.map((p) => `${p.key} ${byType[p.key]}`).join(', ')}>
            {parts.map((p) => (
              <span key={p.key} className={p.cls} style={{ width: `${(byType[p.key] / total) * 100}%` }} />
            ))}
          </div>
          <ul className="legend-inline">
            {parts.map((p) => (
              <li key={p.key}>
                <span className={`swatch ${p.cls}`} aria-hidden="true" /> {p.key}: <strong>{byType[p.key]}</strong>
                <span className="muted"> ({Math.round((byType[p.key] / total) * 100)}%)</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}

/** Totals, per-type counts, and live charts. Every value is derived from simulator counters. */
export default function StatisticsPanel({ sim }) {
  const s = selectStats(sim);
  const procs = sim.processes;
  const fmtTicks = (v) => `${v.toFixed(1)}`;

  return (
    <section className="card" aria-labelledby="stats-title" id="statistics">
      <header className="card-header">
        <div>
          <h2 id="stats-title">Statistics</h2>
          <p className="muted small">Counters since the last reset. Waiting and CS time are measured in simulation ticks.</p>
        </div>
      </header>

      <div className="summary-strip">
        <div><span>Total messages</span><strong>{s.sent}</strong></div>
        <div><span>REQUEST</span><strong>{s.byType[MT.REQUEST]}</strong></div>
        <div><span>REPLY</span><strong>{s.byType[MT.REPLY]}</strong></div>
        <div><span>RELEASE</span><strong>{s.byType[MT.RELEASE]}</strong></div>
        <div><span>Messages received</span><strong>{s.received}</strong></div>
        <div><span>Total requests</span><strong>{s.requests}</strong></div>
        <div><span>CS entries</span><strong>{s.entries}</strong></div>
        <div><span>Avg waiting</span><strong>{formatWait(s.avgWait)}</strong></div>
        <div><span>Max waiting</span><strong>{s.entries === 0 ? '—' : `${s.maxWait} ticks`}</strong></div>
        <div><span>Avg CS time</span><strong>{s.avgCs === null ? '—' : `${s.avgCs.toFixed(1)} ticks`}</strong></div>
        <div><span>Deferred replies</span><strong>{s.deferred}</strong></div>
        <div><span>Violations</span><strong>{s.violations}</strong></div>
        <div><span>Messages per entry</span><strong>{s.perEntry === null ? '—' : s.perEntry.toFixed(1)}</strong></div>
        <div><span>Simulation tick</span><strong>{sim.simTime}</strong></div>
      </div>

      <div className="charts-grid">
        <BarChart title="Requests per process" data={procs.map((p) => ({ label: p.name, value: p.requestsMade }))} />
        <BarChart title="CS entries per process" data={procs.map((p) => ({ label: p.name, value: p.entries }))} />
        <BarChart title="Messages sent per process" data={procs.map((p) => ({ label: p.name, value: p.sent }))} />
        <BarChart
          title="Average wait per process (ticks)"
          data={procs.map((p) => ({ label: p.name, value: p.entries === 0 ? null : p.totalWait / p.entries }))}
          format={fmtTicks}
          emptyText="No CS entries yet"
        />
        <TypeDistribution byType={s.byType} />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Process</th><th>State</th><th>Clock</th><th>Requests</th><th>CS entries</th>
              <th>Avg wait</th><th>Last wait</th><th>Sent</th><th>Received</th><th>Deferred now</th>
            </tr>
          </thead>
          <tbody>
            {procs.map((p) => {
              const meta = STATE_META[p.state];
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td><span className={`state-chip chip-${meta.tone}`}>{meta.label}</span></td>
                  <td>{p.clock}</td>
                  <td>{p.requestsMade}</td>
                  <td>{p.entries}</td>
                  <td>{p.entries === 0 ? '—' : `${(p.totalWait / p.entries).toFixed(1)} ticks`}</td>
                  <td>{p.lastWait === null ? '—' : `${p.lastWait} ticks`}</td>
                  <td>{p.sent}</td>
                  <td>{p.received}</td>
                  <td>{p.deferred.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
