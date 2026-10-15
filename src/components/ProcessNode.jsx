import { Clock3 } from 'lucide-react';
import { PROCESS_STATES as PS } from '../algorithm/constants.js';
import { isPending, procName } from '../algorithm/ricartAgrawala.js';
import { STATE_META } from '../state/selectors.js';

/** One process rendered as a node on the network. Clicking selects it for the details panel. */
export default function ProcessNode({ proc, pos, n, selected, onSelect, dense, sending = false, receiving = false }) {
  const meta = STATE_META[proc.state];
  const showReplies = isPending(proc) || proc.state === PS.IN_CRITICAL_SECTION;
  const required = n - 1;
  const deferredText = proc.deferred.length
    ? `Deferred → ${proc.deferred.map(procName).join(', ')}`
    : 'No deferred replies';
  const flow = [sending && 'is-sending', receiving && 'is-receiving'].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={`node tone-${meta.tone} ${selected ? 'is-selected' : ''} ${dense ? 'is-dense' : ''} ${flow}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      onClick={() => onSelect(proc.id)}
      aria-pressed={selected}
      aria-label={`${proc.name}, ${meta.label}, logical clock ${proc.clock}`}
      title={`${proc.name}: ${meta.description}`}
    >
      <span className="node-top">
        <span className="node-name">{proc.name}</span>
        <span className={`state-chip chip-${meta.tone}`}>{meta.label}</span>
      </span>
      <span className="node-clock">
        <Clock3 size={13} aria-hidden="true" /> Clock <strong>{proc.clock}</strong>
      </span>
      <span className="node-replies">
        {showReplies ? `Replies ${proc.replies.length}/${required}` : 'Replies —'}
      </span>
      <span className="node-foot">{deferredText}</span>
    </button>
  );
}
