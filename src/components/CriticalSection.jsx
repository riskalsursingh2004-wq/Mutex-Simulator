import { Lock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { procName } from '../algorithm/ricartAgrawala.js';

/** The shared resource at the centre of the network. Owner is derived from csOwners. */
export default function CriticalSection({ owners, violation }) {
  const occupied = owners.length > 0;
  const ownerText = owners.length === 0 ? 'None' : owners.map(procName).join(', ');
  return (
    <div className={`cs-box ${occupied ? 'is-occupied' : ''} ${violation ? 'is-violation' : ''}`} aria-live="polite">
      <Lock size={22} aria-hidden="true" />
      <div className="cs-title">CRITICAL SECTION</div>
      <div className="cs-owner">
        <span className="cs-owner-label">CURRENT OWNER</span>
        <strong>{ownerText}</strong>
      </div>
      <div className={`cs-safe ${violation ? 'bad' : occupied ? 'locked' : 'good'}`}>
        {violation ? (
          <>
            <ShieldAlert size={13} aria-hidden="true" /> Mutual exclusion violation detected
          </>
        ) : occupied ? (
          <>
            <Lock size={13} aria-hidden="true" /> MUTUAL EXCLUSION LOCKED
          </>
        ) : (
          <>
            <ShieldCheck size={13} aria-hidden="true" /> SAFE ✓
          </>
        )}
      </div>
    </div>
  );
}
