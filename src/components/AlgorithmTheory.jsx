/** Reference theory for the Ricart–Agrawala algorithm, shown on the Algorithm page. Static text only. */
export default function AlgorithmTheory() {
  return (
    <section className="card theory" aria-labelledby="theory-title" id="algorithm-theory">
      <header className="card-header">
        <div>
          <h2 id="theory-title">Theory · Distributed Mutual Exclusion</h2>
          <p className="muted small">Background for the simulator: definitions, the algorithm, its costs and its limits.</p>
        </div>
      </header>

      <div className="theory-grid">
        <article>
          <h3>Mutual exclusion</h3>
          <p>
            <strong>Critical section (CS):</strong> a part of a program that accesses a shared resource and must not run
            in two processes at the same time.
          </p>
          <ul>
            <li><strong>Safety:</strong> at most one process is inside the CS at any moment.</li>
            <li><strong>Liveness:</strong> every request is eventually granted (no deadlock, no starvation).</li>
            <li><strong>Fairness:</strong> requests are served in the order they were made (here: by timestamp).</li>
          </ul>
        </article>

        <article>
          <h3>Centralized vs distributed</h3>
          <p>
            <strong>Centralized:</strong> one coordinator grants permission. Simple, but the coordinator is a single point of
            failure and a bottleneck. Each entry costs about 3 messages (REQUEST, GRANT, RELEASE).
          </p>
          <p>
            <strong>Distributed:</strong> there is no coordinator. Processes agree among themselves by exchanging messages.
            Ricart–Agrawala is the classic distributed algorithm.
          </p>
        </article>

        <article>
          <h3>Logical clocks (Lamport)</h3>
          <ul>
            <li>A local event or a send: <code>C = C + 1</code>.</li>
            <li>A receive with timestamp <code>ts</code>: <code>C = max(C, ts) + 1</code>.</li>
            <li>If event A happened before event B, then <code>C(A) &lt; C(B)</code>. The converse is not guaranteed.</li>
          </ul>
        </article>

        <article>
          <h3>Ordering requests</h3>
          <p>
            Each request carries the pair <code>(timestamp, processId)</code>. Pairs are compared lexicographically,
            so the order is total: a smaller timestamp wins, and equal timestamps are broken by the smaller process ID.
          </p>
        </article>

        <article className="span-2">
          <h3>Ricart–Agrawala steps</h3>
          <ol className="steps">
            <li><strong>Request.</strong> Increment the clock, record the request timestamp, and send REQUEST(ts, id) to every other process.</li>
            <li><strong>Receive REQUEST from Pj.</strong> Update the clock. If this process is inside the CS, or is requesting with a higher priority pair, <em>defer</em> the REPLY. Otherwise send REPLY at once.</li>
            <li><strong>Receive REPLY.</strong> Count it. When REPLYs have arrived from all N−1 peers, enter the CS.</li>
            <li><strong>Release.</strong> Leave the CS, send RELEASE notices, then send every deferred REPLY. Those REPLYs are the permission hand-off.</li>
          </ol>
        </article>

        <article>
          <h3>REQUEST, REPLY and RELEASE</h3>
          <ul>
            <li><strong>REQUEST</strong> asks every peer for permission to enter.</li>
            <li><strong>REPLY</strong> grants permission. It is sent immediately, or later as a deferred REPLY.</li>
            <li><strong>RELEASE</strong> tells peers that the CS has been left. This simulator sends it as an explicit notice.</li>
          </ul>
        </article>

        <article>
          <h3>Deferred replies</h3>
          <p>
            Deferring means withholding a REPLY on purpose. A process holds a REPLY back while it is inside the CS, or while its own
            request has priority. The requester therefore cannot collect all REPLYs and stays WAITING until the owner releases.
            This is the mechanism that produces mutual exclusion without a coordinator.
          </p>
        </article>

        <article>
          <h3>Advantages</h3>
          <ul>
            <li>No coordinator and no single point of failure.</li>
            <li>Fair: requests are served in timestamp order.</li>
            <li>Deadlock-free and starvation-free under reliable message delivery.</li>
          </ul>
        </article>

        <article>
          <h3>Limitations</h3>
          <ul>
            <li>Message cost grows with N: 2(N−1) messages per entry (REQUEST + REPLY).</li>
            <li>Every peer must answer, so one crashed process blocks everyone.</li>
            <li>Each process must know the full membership, and channels must be reliable.</li>
          </ul>
        </article>

        <article>
          <h3>Complexity</h3>
          <table className="data-table compact">
            <tbody>
              <tr><th>Messages per CS entry</th><td>2(N−1) for REQUEST + REPLY (the simulator also counts N−1 RELEASE notices)</td></tr>
              <tr><th>Delay before entry</th><td>2 message delays when there is no contention</td></tr>
              <tr><th>Space per process</th><td>O(N): clock, request data, reply and deferred sets</td></tr>
            </tbody>
          </table>
        </article>

        <article className="span-2">
          <h3>Comparison</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Property</th><th>Centralized</th><th>Ricart–Agrawala</th><th>Token ring</th></tr>
              </thead>
              <tbody>
                <tr><td>Coordinator needed</td><td>Yes</td><td>No</td><td>No</td></tr>
                <tr><td>Messages per entry</td><td>~3</td><td>2(N−1)</td><td>0 to N</td></tr>
                <tr><td>Entry delay</td><td>2 messages</td><td>2 message delays</td><td>Up to N hops</td></tr>
                <tr><td>Fairness</td><td>FIFO queue</td><td>Timestamp order</td><td>Ring order</td></tr>
                <tr><td>Main weakness</td><td>Coordinator crash</td><td>Any peer crash blocks all</td><td>Token loss</td></tr>
              </tbody>
            </table>
          </div>
        </article>

        <article className="span-2">
          <h3>Sequence diagram · P1 wins, P2 is deferred, then P3</h3>
          <svg className="sequence" viewBox="0 0 560 300" role="img" aria-label="Sequence diagram of REQUEST, REPLY, deferred REPLY and RELEASE between P1, P2 and P3">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {[['P1', 80], ['P2', 280], ['P3', 480]].map(([name, x]) => (
              <g key={name}>
                <text x={x} y={22} textAnchor="middle" className="seq-name">{name}</text>
                <line x1={x} y1={32} x2={x} y2={290} className="seq-life" />
              </g>
            ))}
            {/* 1. P1 requests to P2 and P3 */}
            <line x1="80" y1="60" x2="280" y2="60" className="seq-req" markerEnd="url(#arrow)" />
            <text x="180" y="54" textAnchor="middle" className="seq-text">REQUEST(ts 1)</text>
            <line x1="80" y1="80" x2="480" y2="80" className="seq-req" markerEnd="url(#arrow)" />
            <text x="280" y="98" textAnchor="middle" className="seq-text">REQUEST(ts 1)</text>
            {/* 2. P2 replies at once, P3 replies at once */}
            <line x1="280" y1="120" x2="80" y2="120" className="seq-rep" markerEnd="url(#arrow)" />
            <text x="180" y="114" textAnchor="middle" className="seq-text">REPLY</text>
            <line x1="480" y1="140" x2="80" y2="140" className="seq-rep" markerEnd="url(#arrow)" />
            <text x="280" y="134" textAnchor="middle" className="seq-text">REPLY</text>
            {/* 3. P1 is in CS; P2 requests and is deferred by P1 */}
            <rect x="72" y="150" width="16" height="70" className="seq-cs" />
            <text x="100" y="172" className="seq-note">P1 in CS</text>
            <line x1="280" y1="190" x2="80" y2="190" className="seq-dash" markerEnd="url(#arrow)" />
            <text x="180" y="184" textAnchor="middle" className="seq-text">REQUEST(ts 2) → deferred</text>
            {/* 4. P1 releases: deferred REPLY to P2 and P3 */}
            <line x1="80" y1="230" x2="280" y2="230" className="seq-rep" markerEnd="url(#arrow)" />
            <text x="180" y="224" textAnchor="middle" className="seq-text">RELEASE + deferred REPLY</text>
            <line x1="80" y1="250" x2="480" y2="250" className="seq-rep" markerEnd="url(#arrow)" />
            <text x="280" y="268" textAnchor="middle" className="seq-text">deferred REPLY</text>
          </svg>
          <p className="muted small">Solid arrows: REQUEST and REPLY. Dashed: a request that the owner defers. The deferred REPLY is the hand-off on release.</p>
        </article>
      </div>
    </section>
  );
}
