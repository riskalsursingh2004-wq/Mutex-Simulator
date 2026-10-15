/** Project description card (title, subject, algorithm, purpose). */
export default function ProjectInfo() {
  const items = [
    ['Title', 'Distributed Mutual Exclusion Simulator'],
    ['Subject', 'Distributed Computing'],
    ['Algorithm', 'Ricart–Agrawala Distributed Mutual Exclusion Algorithm'],
    ['Purpose', 'To simulate how distributed processes coordinate access to a shared critical section without relying on a centralized coordinator.'],
  ];
  return (
    <section className="card project-card" aria-labelledby="project-title">
      <h2 id="project-title">Project Information</h2>
      <dl className="project-grid">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
