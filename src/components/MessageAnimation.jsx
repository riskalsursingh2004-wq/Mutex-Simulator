import { messageTypeMeta } from '../state/selectors.js';
import { MESSAGE_STATUS } from '../algorithm/constants.js';

/**
 * Renders the messages that are really in flight as tokens moving from sender to receiver.
 * Position = (simTime - sentAt) / (deliverAt - sentAt). The CSS transition lasts one tick,
 * so each token glides between simulation ticks. Tokens disappear at delivery.
 */
export default function MessageAnimation({ messages, positions, tickMs, simTime }) {
  return (
    <div className="message-layer" aria-hidden="true">
      {messages.map((msg) => {
        const from = positions[msg.from];
        const to = positions[msg.to];
        if (!from || !to) return null;
        const meta = messageTypeMeta(msg.type);
        const span = Math.max(1, msg.deliverAt - msg.sentAt);
        const elapsed = (simTime ?? 0) - msg.sentAt;
        const progress = Math.min(1, Math.max(0, elapsed / span));

        // Perpendicular offset so REQUEST/REPLY travelling both ways do not overlap.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const side = msg.from < msg.to ? 1 : -1;
        const offset = 2.4 * side;
        const x = from.x + dx * progress + (-dy / len) * offset;
        const y = from.y + dy * progress + (dx / len) * offset;

        return (
          <div
            key={msg.id}
            className={`msg-token ${meta.className} ${msg.deferred ? 'is-deferred' : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, transitionDuration: `${tickMs}ms` }}
            title={`${meta.label} P${msg.from}→P${msg.to}, ts ${msg.ts}, sent at t=${msg.sentAt}, ${MESSAGE_STATUS.IN_FLIGHT}`}
          >
            <span className="msg-label">{meta.short}</span>
            <span className="msg-route">P{msg.from}→P{msg.to}</span>
            <span className="msg-ts">ts {msg.ts}</span>
          </div>
        );
      })}
    </div>
  );
}
