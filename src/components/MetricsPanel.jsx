import { Network, Crown, Hourglass, SendHorizontal, Inbox, Timer, ShieldCheck, ShieldAlert } from 'lucide-react';
import { formatWait } from '../state/selectors.js';

/** KPI cards. Every value is derived from the live simulator state. */
export default function MetricsPanel({ metrics, violation }) {
  const cards = [
    { key: 'proc', label: 'Processes', value: metrics.processes, sub: 'active nodes', icon: Network, tone: 'neutral' },
    { key: 'owner', label: 'Current Owner', value: metrics.ownerName, sub: 'inside critical section', icon: Crown, tone: metrics.owner ? 'owner' : 'neutral' },
    { key: 'pending', label: 'Pending Requests', value: metrics.pending, sub: 'requesting or waiting', icon: Hourglass, tone: metrics.pending ? 'waiting' : 'neutral' },
    { key: 'sent', label: 'Messages Sent', value: metrics.sent, sub: 'REQUEST + REPLY + RELEASE', icon: SendHorizontal, tone: 'neutral' },
    { key: 'recv', label: 'Messages Received', value: metrics.received, sub: 'delivered to a process', icon: Inbox, tone: 'neutral' },
    { key: 'wait', label: 'Average Waiting Time', value: formatWait(metrics.avgWait), sub: `over ${metrics.entries} CS entr${metrics.entries === 1 ? 'y' : 'ies'}`, icon: Timer, tone: 'neutral' },
    violation
      ? { key: 'me', label: 'Mutual Exclusion', value: 'VIOLATION', sub: violation.message, icon: ShieldAlert, tone: 'danger' }
      : { key: 'me', label: 'Mutual Exclusion', value: 'SAFE ✓', sub: 'at most one owner', icon: ShieldCheck, tone: 'safe' },
  ];

  return (
    <section className="kpi-grid" aria-label="Live metrics" id="overview-metrics">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.key} className={`kpi tone-${c.tone}`}>
            <div className="kpi-head">
              <span className="kpi-label">{c.label}</span>
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="kpi-value">{c.value}</div>
            <div className="kpi-sub">{c.sub}</div>
          </div>
        );
      })}
    </section>
  );
}
