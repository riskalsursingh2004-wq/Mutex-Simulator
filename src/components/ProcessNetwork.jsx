import { useMemo } from 'react';
import CriticalSection from './CriticalSection.jsx';
import ProcessNode from './ProcessNode.jsx';
import MessageAnimation from './MessageAnimation.jsx';
import { networkLayout, messageTypeMeta } from '../state/selectors.js';

/**
 * Live network: processes on a ring around the Critical Section, faint pairwise links,
 * and animated tokens for the REAL in-flight messages (no decorative animation).
 */
export default function ProcessNetwork({ sim, selectedId, onSelect, tickMs }) {
  const layout = useMemo(() => networkLayout(sim.n), [sim.n]);
  const positions = useMemo(() => Object.fromEntries(layout.map((p) => [p.id, p])), [layout]);
  const dense = sim.n >= 7;

  // Sender and receiver of every message currently in transit.
  const senders = new Set(sim.inFlight.map((m) => m.from));
  const receivers = new Set(sim.inFlight.map((m) => m.to));

  // Every unordered pair of processes is linked (faint), so the message paths are visible.
  const pairs = [];
  for (let a = 0; a < layout.length; a += 1) {
    for (let b = a + 1; b < layout.length; b += 1) pairs.push([layout[a], layout[b]]);
  }

  return (
    <section className="card network-card" id="processes" aria-labelledby="network-title">
      <header className="card-header">
        <div>
          <h2 id="network-title">Process Network</h2>
          <p className="muted small">
            {sim.n} processes communicate only by message passing. Click a node for its details.
          </p>
        </div>
        <span className="pill pill-muted">Tick t={sim.simTime}</span>
      </header>

      <div className="network-scroll">
        <div className={`network ${dense ? 'is-dense' : ''}`}>
          <svg className="network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {pairs.map(([a, b]) => (
              <line key={`${a.id}-${b.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            ))}
          </svg>

          <div className="cs-anchor">
            <CriticalSection owners={sim.csOwners} violation={Boolean(sim.violation)} />
          </div>

          {layout.map((pos) => (
            <ProcessNode
              key={pos.id}
              proc={sim.processes[pos.id - 1]}
              pos={pos}
              n={sim.n}
              dense={dense}
              selected={selectedId === pos.id}
              sending={senders.has(pos.id)}
              receiving={receivers.has(pos.id)}
              onSelect={onSelect}
            />
          ))}

          <MessageAnimation messages={sim.inFlight} positions={positions} tickMs={tickMs} simTime={sim.simTime} />
        </div>
      </div>

      <footer className="legend" aria-label="Message legend">
        {['REQUEST', 'REPLY', 'RELEASE'].map((type) => {
          const meta = messageTypeMeta(type);
          const hint = type === 'REQUEST' ? 'ask for access (square)' : type === 'REPLY' ? 'permission (round)' : 'leaving CS (dashed)';
          return (
            <span key={type} className="legend-item">
              <span className={`legend-swatch ${meta.className}`} aria-hidden="true" />
              <strong>{meta.label}</strong>&nbsp;<span className="muted">{hint}</span>
            </span>
          );
        })}
        <span className="legend-item">
          <span className="legend-swatch msg-reply is-deferred" aria-hidden="true" />
          <strong>Deferred REPLY</strong>&nbsp;<span className="muted">sent on release</span>
        </span>
      </footer>
    </section>
  );
}
