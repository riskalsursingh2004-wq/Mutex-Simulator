import { Activity } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';

export default function Header({ status, metrics }) {
  return (
    <header className="app-header" id="top">
      <div className="header-title">
        <span className="header-icon" aria-hidden="true"><Activity size={22} /></span>
        <div>
          <h1>Distributed Mutual Exclusion Simulator</h1>
          <p>Ricart–Agrawala Algorithm · Distributed Computing (MCA)</p>
        </div>
      </div>
      <div className="header-status" aria-label="Simulation status">
        <span className="muted small">Simulation Status</span>
        <span className={`status-pill tone-${status.tone}`}>{status.label}</span>
        <span className={`pill ${metrics.safe ? 'pill-safe' : 'pill-danger'}`}>
          Mutual Exclusion: {metrics.safe ? 'SAFE ✓' : 'VIOLATION'}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
