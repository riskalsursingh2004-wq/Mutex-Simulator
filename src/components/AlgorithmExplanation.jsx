import { PROCESS_STATES as PS } from '../algorithm/constants.js';

const STAGE_FOR_STATE = {
  [PS.IDLE]: 'idle',
  [PS.REQUESTING]: 'receive',
  [PS.WAITING]: 'decision',
  [PS.IN_CRITICAL_SECTION]: 'cs',
  [PS.RELEASING]: 'release',
};

/** How It Works: plain-language steps, the mutual exclusion rule, and the flow diagram. */
export default function AlgorithmExplanation({ selectedState }) {
  const activeStage = STAGE_FOR_STATE[selectedState] ?? null;
  const cls = (stage) => `flow-node ${activeStage === stage ? 'is-active' : ''}`;

  return (
    <section className="card" aria-labelledby="algo-title" id="algorithm">
      <header className="card-header">
        <div>
          <h2 id="algo-title">How It Works — Ricart–Agrawala Algorithm</h2>
          <p className="muted small">
            A decentralised algorithm: no coordinator. Every process decides for itself, using only messages.
          </p>
        </div>
      </header>

      <div className="algo-layout">
        <div className="steps">
          <article className="step">
            <h3>Step 1 — Request</h3>
            <p>A process increments its logical clock, stamps its request with that timestamp, and broadcasts a REQUEST to every other process.</p>
          </article>
          <article className="step">
            <h3>Step 2 — Permission</h3>
            <p>
              A receiver replies at once if it is idle, or if the sender has higher priority. It <strong>defers</strong> the
              reply if it is inside the critical section, or if its own request has higher priority. Priority is the pair
              <code> (timestamp, process ID)</code>, so the smaller pair wins.
            </p>
          </article>
          <article className="step">
            <h3>Step 3 — Enter Critical Section</h3>
            <p>A process enters only after it has received a REPLY from all N−1 other processes.</p>
          </article>
          <article className="step">
            <h3>Step 4 — Release</h3>
            <p>
              After its work, the process leaves the critical section, broadcasts RELEASE notices, and sends every
              deferred REPLY. Those replies let the next waiting process enter.
            </p>
          </article>

          <div className="rule-callout">
            <span className="rule-title">Mutual Exclusion Rule</span>
            <blockquote>“At most one process can be inside the critical section at any time.”</blockquote>
            <p className="small muted">
              Enforced by the REPLY rule (a process needs everyone’s permission) and checked after every event by
              <code> criticalSectionOwners.length ≤ 1</code>.
            </p>
          </div>

          <div className="clock-rule">
            <span className="rule-title">Lamport clock rules</span>
            <ul>
              <li>Local event or send: <code>clock = clock + 1</code></li>
              <li>Receive message with timestamp <code>ts</code>: <code>clock = max(clock, ts) + 1</code></li>
            </ul>
          </div>

          <div className="state-legend">
            <span className="rule-title">Process states</span>
            <ul>
              <li><span className="state-chip chip-idle">IDLE</span> not requesting the critical section.</li>
              <li><span className="state-chip chip-requesting">REQUESTING</span> request sent; collecting REPLYs.</li>
              <li><span className="state-chip chip-waiting">WAITING</span> blocked: a peer is deferring its REPLY (it has priority or is in the CS).</li>
              <li><span className="state-chip chip-owner">IN CRITICAL SECTION</span> owns the critical section.</li>
              <li><span className="state-chip chip-releasing">RELEASING</span> leaving the CS and sending RELEASE and deferred REPLYs.</li>
            </ul>
          </div>
        </div>

        <div className="flow" aria-label="Algorithm flow diagram">
          <div className={cls('idle')}>IDLE</div>
          <div className="flow-arrow">↓</div>
          <div className={cls('receive')}>REQUEST<br /><small>Broadcast REQUEST (ts, id)</small></div>
          <div className="flow-arrow">↓</div>
          <div className={cls('receive')}>Receive REPLY messages</div>
          <div className="flow-arrow">↓</div>
          <div className={cls('decision')}>All permissions received?</div>
          <div className="flow-branch">
            <span className="flow-no">NO → stay WAITING; deferred REPLYs arrive on release</span>
            <span className="flow-yes">↓ YES</span>
          </div>
          <div className={cls('cs')}>🔐 CRITICAL SECTION</div>
          <div className="flow-arrow">↓</div>
          <div className={cls('release')}>RELEASE<br /><small>Broadcast RELEASE, then send deferred REPLIES</small></div>
          <div className="flow-arrow">↓</div>
          <div className={cls('idle')}>IDLE</div>
          <p className="small muted flow-caption">Highlighted stage follows the process selected in Process Details.</p>
        </div>
      </div>
    </section>
  );
}
