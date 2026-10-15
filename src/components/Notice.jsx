import { X, AlertTriangle, Info, ShieldAlert } from 'lucide-react';

/** Transient feedback toast for rejected or informational actions. */
export function NoticeToast({ notice, onDismiss }) {
  if (!notice) return null;
  const Icon = notice.tone === 'error' ? AlertTriangle : Info;
  return (
    <div className={`toast toast-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <span>{notice.text}</span>
      <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}

/** Prominent banner shown when the mutual exclusion invariant is broken. */
export function ViolationBanner({ violation }) {
  if (!violation) return null;
  return (
    <div className="violation-banner" role="alert">
      <ShieldAlert size={26} aria-hidden="true" />
      <div>
        <strong>MUTUAL EXCLUSION VIOLATION</strong>
        <p>
          Processes {violation.processes.map((id) => `P${id}`).join(', ')} were inside the critical section at the same time
          (simulated tick t={violation.atSimTime}). The simulation has been stopped. Reset to start again.
        </p>
      </div>
    </div>
  );
}
