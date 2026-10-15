/**
 * Scripted scenarios for faculty demonstrations.
 *
 * Steps are plain data: an optional `action` executed by the engine, an optional
 * `waitTicks` delay before the action, a `minTicks` hold time after it, and an
 * `until` predicate on the simulator state that must hold before the next step.
 * Keeping this file free of engine imports avoids circular dependencies.
 */
import { PROCESS_STATES as PS } from './constants.js';

const ownerIs = (id) => (s) => s.csOwners.length === 1 && s.csOwners[0] === id;
const csFree = (s) => s.csOwners.length === 0;
const occupied = (s) => s.csOwners.length === 1;
const stateOf = (s, id) => s.processes[id - 1]?.state;

const DEFERRED_STEPS = [
  {
    note: 'P2 creates a REQUEST, stamps it with its logical clock and broadcasts it to P1, P3 and P4.',
    action: { type: 'REQUEST', pid: 2 },
    until: ownerIs(2),
  },
  {
    note: 'P2 has received REPLYs from all peers and is INSIDE the Critical Section. It is the only owner.',
    minTicks: 8,
    until: ownerIs(2),
  },
  {
    note: 'P4 requests access while P2 is inside. P1 and P3 REPLY at once; P2 DEFERS its REPLY to P4.',
    action: { type: 'REQUEST', pid: 4 },
    until: (s) => stateOf(s, 4) === PS.WAITING && ownerIs(2)(s),
  },
  {
    note: 'P4 is WAITING: it holds 2 of its 3 REPLYs and the deferred REPLY from P2 is still held back.',
    minTicks: 8,
    until: () => true,
  },
  {
    note: 'P2 releases the Critical Section: RELEASE notices go out, then the DEFERRED REPLY is sent to P4.',
    action: { type: 'RELEASE', pid: 2 },
    until: ownerIs(4),
  },
  {
    note: 'P4 has now received all REPLYs and ENTERS the Critical Section.',
    minTicks: 2,
    until: ownerIs(4),
  },
  {
    note: 'P4 finishes its work and releases the Critical Section. The scenario is complete.',
    action: { type: 'RELEASE', pid: 4 },
    minTicks: 6,
    until: csFree,
  },
];

const SINGLE_STEPS = [
  {
    note: 'P1 creates a REQUEST with its logical timestamp and broadcasts it to P2, P3 and P4.',
    action: { type: 'REQUEST', pid: 1 },
    until: ownerIs(1),
  },
  {
    note: 'Every peer REPLIES at once (none is competing). P1 has all 3 REPLYs and ENTERS the Critical Section.',
    minTicks: 6,
    until: ownerIs(1),
  },
  {
    note: 'P1 finishes its work and releases. RELEASE notices go out; no REPLY was deferred, so nothing else is sent.',
    action: { type: 'RELEASE', pid: 1 },
    minTicks: 4,
    until: csFree,
  },
];

/**
 * Generic "everyone asks at once" script: all requesters are queued together, then
 * the owner is released once per requester. The engine decides the order by (timestamp, id).
 */
function burstSteps(pids, title) {
  const steps = [
    {
      note: `${title}: ${pids.map((p) => `P${p}`).join(', ')} REQUEST at the same instant. Equal timestamps are ordered by process ID.`,
      action: { type: 'REQUEST_MANY', pids },
      until: occupied,
    },
  ];
  pids.forEach((pid, index) => {
    const last = index === pids.length - 1;
    steps.push({
      note: index === 0
        ? 'The highest-priority process has all REPLYs and ENTERS the CS. Every other requester is WAITING (its REPLY is deferred).'
        : 'The next requester has collected all REPLYs and ENTERS the CS. The others keep waiting.',
      minTicks: 5,
      until: occupied,
    });
    steps.push({
      note: last
        ? 'The last owner releases. Every requester has now entered exactly once; mutual exclusion held throughout.'
        : 'The owner RELEASES. Its deferred REPLYs hand the CS to the next requester in (timestamp, id) order.',
      action: { type: 'RELEASE_OWNER' },
      minTicks: 2,
      until: last ? csFree : occupied,
    });
  });
  return steps;
}

const CONCURRENT_STEPS = burstSteps([1, 2, 3], 'Concurrent requests');
const CONTENTION_STEPS = burstSteps([1, 2, 3, 4, 5], 'High contention');

const FACULTY_STEPS = [
  {
    note: 'Step A: P2 creates a REQUEST with its logical timestamp and broadcasts REQUEST to P1, P3 and P4.',
    action: { type: 'REQUEST', pid: 2 },
    waitTicks: 1,
    minTicks: 1,
    until: ownerIs(2),
  },
  {
    note: 'Step B: P1, P3 and P4 REPLY. P2 has all 3 REPLYs and ENTERS the Critical Section (sole owner).',
    minTicks: 6,
    until: ownerIs(2),
  },
  {
    note: 'Step C: P4 requests while P2 is inside. P1 and P3 REPLY, but P2 DEFERS its REPLY to P4. P4 is WAITING.',
    action: { type: 'REQUEST', pid: 4 },
    minTicks: 6,
    until: (s) => stateOf(s, 4) === PS.WAITING && ownerIs(2)(s),
  },
  {
    note: 'Step D: P4 keeps waiting. Its REQUEST has the lower priority, and the Critical Section stays with P2.',
    minTicks: 6,
    until: () => true,
  },
  {
    note: 'Step E: P2 RELEASES. RELEASE notices go to all peers, then the DEFERRED REPLY to P4 is sent.',
    action: { type: 'RELEASE', pid: 2 },
    minTicks: 2,
    until: ownerIs(4),
  },
  {
    note: 'Step F: P4 receives the deferred REPLY, has all REPLYs and ENTERS the Critical Section.',
    minTicks: 6,
    until: ownerIs(4),
  },
  {
    note: 'Step G: P4 releases. Critical Section is free.',
    action: { type: 'RELEASE', pid: 4 },
    minTicks: 3,
    until: csFree,
  },
  {
    note: 'Step H (tie-break): P1 and P3 REQUEST at the SAME instant. Priority is the pair (timestamp, process ID); the smaller pair wins.',
    action: { type: 'REQUEST_MANY', pids: [1, 3] },
    minTicks: 2,
    until: occupied,
  },
  {
    note: 'Step I: The higher-priority process enters. The other is WAITING because the owner DEFERS its REPLY.',
    minTicks: 7,
    until: occupied,
  },
  {
    note: 'Step J: The owner RELEASES. Its deferred REPLY is the hand-off that lets the second process enter.',
    action: { type: 'RELEASE_OWNER' },
    minTicks: 2,
    until: occupied,
  },
  {
    note: 'Step K: The second process now holds all REPLYs and ENTERS the Critical Section.',
    minTicks: 6,
    until: occupied,
  },
  {
    note: 'Step L: The second process releases. Faculty demonstration complete. Mutual exclusion held throughout.',
    action: { type: 'RELEASE_OWNER' },
    minTicks: 2,
    until: csFree,
  },
];

export const SCENARIOS = {
  single: {
    id: 'single',
    title: 'Single Process Request',
    description: 'P1 requests the CS with no competition, gets REPLYs from every peer, enters, and releases.',
    requiredProcesses: 4,
    kind: 'script',
    steps: SINGLE_STEPS,
  },
  concurrent: {
    id: 'concurrent',
    title: 'Multiple Concurrent Requests',
    description: 'P1, P2 and P3 request at the same time. Exactly one enters at a time, ordered by (timestamp, process ID).',
    requiredProcesses: 4,
    kind: 'script',
    steps: CONCURRENT_STEPS,
  },
  deferred: {
    id: 'deferred',
    title: 'Deferred Reply Demonstration',
    description: 'P4 asks while P2 is inside the CS. P2 holds back (defers) its REPLY until it releases.',
    requiredProcesses: 4,
    kind: 'script',
    steps: DEFERRED_STEPS,
  },
  contention: {
    id: 'contention',
    title: 'High Contention',
    description: 'All five processes request at once. Each one enters the CS in turn, with no overlap.',
    requiredProcesses: 5,
    kind: 'script',
    steps: CONTENTION_STEPS,
  },
  random: {
    id: 'random',
    title: 'Random Simulation',
    description: 'Switches to AUTOMATIC mode: random eligible processes request, and the CS is auto-released after a short time.',
    requiredProcesses: 2,
    kind: 'auto',
    steps: [],
  },
  faculty: {
    id: 'faculty',
    title: 'Faculty Demo',
    description: 'Full guided walkthrough with a tie-break between simultaneous requests (about 1–2 minutes at Slow speed).',
    requiredProcesses: 4,
    kind: 'script',
    steps: FACULTY_STEPS,
  },
};

/** Scenario ids shown as demo buttons (Faculty Demo is selected through its own mode). */
export const DEMO_SCENARIO_IDS = ['single', 'concurrent', 'deferred', 'contention', 'random'];
