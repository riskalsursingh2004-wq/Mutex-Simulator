import { useEffect, useState } from 'react';
import { BookOpen, Play, Network, Mail, History, Workflow, ListOrdered } from 'lucide-react';

const NAV = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'simulation', label: 'Simulation', icon: Play },
  { id: 'processes', label: 'Processes', icon: Network },
  { id: 'message-log', label: 'Message Log', icon: Mail },
  { id: 'event-log', label: 'Timeline', icon: History },
  { id: 'algorithm', label: 'Algorithm', icon: Workflow },
  { id: 'statistics', label: 'Statistics', icon: ListOrdered },
];

/** Section navigation with a scroll-spy (IntersectionObserver, disconnected on unmount). */
export default function Sidebar({ status }) {
  const [active, setActive] = useState('overview');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const targets = NAV.map((n) => document.getElementById(n.id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  const go = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <aside className="sidebar" aria-label="Section navigation">
      <nav>
        <ul className="nav-list">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button type="button" className={`nav-item ${active === id ? 'is-active' : ''}`} onClick={() => go(id)}>
                <Icon size={17} aria-hidden="true" />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-status">
        <span className="muted small">Simulation Status</span>
        <span className={`status-pill tone-${status.tone}`}>{status.label}</span>
      </div>
    </aside>
  );
}
