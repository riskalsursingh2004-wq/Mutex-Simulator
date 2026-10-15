/**
 * Derived view-model helpers. Everything the UI shows is computed here from the
 * simulator state – nothing is hard-coded to a particular process.
 */
import { PROCESS_STATES as PS, SIM_MODES as MODE, MESSAGE_TYPES as MT } from '../algorithm/constants.js';
import { isPending, procName } from '../algorithm/ricartAgrawala.js';

export const STATE_META = {
  [PS.IDLE]: {
    label: 'IDLE',
    description: 'Process is not requesting the critical section.',
    tone: 'idle',
  },
  [PS.REQUESTING]: {
    label: 'REQUESTING',
    description: 'Process has requested access and is waiting for REPLY messages.',
    tone: 'requesting',
  },
  [PS.WAITING]: {
    label: 'WAITING',
    description: 'Process is blocked: at least one peer is deferring its REPLY because it has priority or is inside the CS.',
    tone: 'waiting',
  },
  [PS.IN_CRITICAL_SECTION]: {
    label: 'IN CS',
    description: 'Process currently owns the critical section.',
    tone: 'owner',
  },
  [PS.RELEASING]: {
    label: 'RELEASING',
    description: 'Process is leaving the CS, sending RELEASE notices and deferred REPLYs.',
    tone: 'releasing',
  },
};

/**
 * Simulation status shown in the header and sidebar. The labels are exactly
 * READY, RUNNING, PAUSED and COMPLETED.
 */
export function selectStatus(sim) {
  if (sim.violation) return { key: 'PAUSED', label: 'PAUSED', tone: 'danger' };
  if (sim.running || sim.draining) return { key: 'RUNNING', label: 'RUNNING', tone: 'success' };
  if (sim.paused) return { key: 'PAUSED', label: 'PAUSED', tone: 'warn' };
  if (sim.lastScenario?.status === 'COMPLETE') return { key: 'COMPLETED', label: 'COMPLETED', tone: 'info' };
  return { key: 'READY', label: 'READY', tone: 'muted' };
}

export function selectMetrics(sim) {
  const owner = sim.csOwners[0] ?? null;
  const entries = sim.processes.reduce((sum, p) => sum + p.entries, 0);
  const totalWait = sim.processes.reduce((sum, p) => sum + p.totalWait, 0);
  return {
    processes: sim.n,
    owner,
    ownerName: owner === null ? 'None' : procName(owner),
    pending: sim.processes.filter(isPending).length,
    sent: sim.totals.sent,
    received: sim.totals.received,
    entries,
    avgWait: entries === 0 ? null : totalWait / entries,
    safe: !sim.violation && sim.csOwners.length <= 1,
    simTime: sim.simTime,
  };
}

/** Aggregates for the Statistics panel. Every number comes from engine counters. */
export function selectStats(sim) {
  const entries = sim.processes.reduce((sum, p) => sum + p.entries, 0);
  const requests = sim.processes.reduce((sum, p) => sum + p.requestsMade, 0);
  const totalWait = sim.processes.reduce((sum, p) => sum + p.totalWait, 0);
  const { csTime, csCompleted, maxWait, deferred, violations, byType } = sim.totals;
  return {
    requests,
    entries,
    avgWait: entries === 0 ? null : totalWait / entries,
    maxWait,
    avgCs: csCompleted === 0 ? null : csTime / csCompleted,
    deferred,
    violations,
    byType,
    sent: sim.totals.sent,
    received: sim.totals.received,
    perEntry: entries === 0 ? null : sim.totals.sent / entries,
  };
}

/** Node positions in percent of the network canvas, arranged on an ellipse. */
export function networkLayout(n) {
  const rx = 36;
  const ry = 36;
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return {
      id: i + 1,
      x: 50 + rx * Math.cos(angle),
      y: 50 + ry * Math.sin(angle),
    };
  });
}

/** Explains why a manual request is not allowed for a process (or null if allowed). */
export function requestBlockReason(sim, id) {
  if (sim.violation) return 'The simulator is halted by a mutual exclusion violation. Reset to continue.';
  if (sim.demo) return 'A scenario is running. Stop it or wait for it to finish.';
  if (sim.mode === MODE.AUTO) return 'Automatic mode creates requests itself. Switch to Manual to request manually.';
  const p = sim.processes.find((x) => x.id === id);
  if (!p) return 'Select a process first.';
  if (p.state === PS.IN_CRITICAL_SECTION) return `${p.name} is already inside the Critical Section.`;
  if (isPending(p)) return `${p.name} already has an outstanding request (duplicate requests are ignored).`;
  if (p.state === PS.RELEASING) return `${p.name} is still releasing. Try again in a moment.`;
  return null;
}

export function releaseBlockReason(sim) {
  if (sim.violation) return 'The simulator is halted by a mutual exclusion violation. Reset to continue.';
  if (sim.demo) return 'A scenario is running. Stop it or wait for it to finish.';
  if (sim.mode === MODE.AUTO && sim.autoRelease) {
    return 'Auto Release is ON, so automatic mode releases the CS itself. Turn Auto Release OFF to release manually.';
  }
  if (sim.csOwners.length === 0) return 'No process is inside the Critical Section, so there is nothing to release.';
  return null;
}

export function messageTypeMeta(type) {
  switch (type) {
    case MT.REQUEST:
      return { short: 'REQ', className: 'msg-request', label: 'REQUEST' };
    case MT.REPLY:
      return { short: 'REP', className: 'msg-reply', label: 'REPLY' };
    default:
      return { short: 'REL', className: 'msg-release', label: 'RELEASE' };
  }
}

/** Request status shown for each process in the details panel. */
export function requestStatusOf(p) {
  if (p.state === PS.IN_CRITICAL_SECTION) return 'Granted – inside the CS';
  if (p.state === PS.WAITING) return 'Pending – REPLY deferred by a peer';
  if (p.state === PS.REQUESTING) return 'Pending – collecting REPLYs';
  if (p.state === PS.RELEASING) return 'Released – sending deferred REPLYs';
  return 'No active request';
}

export function formatWait(avgWait) {
  return avgWait === null ? '—' : `${avgWait.toFixed(1)} ticks`;
}
