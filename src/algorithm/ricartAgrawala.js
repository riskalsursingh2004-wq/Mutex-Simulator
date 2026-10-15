/**
 * Ricart–Agrawala distributed mutual exclusion – simulation engine.
 *
 * Framework-independent. Public API = pure functions: each takes the current
 * simulator state and returns a NEW state (or { state, error } for user actions).
 * Internally, helpers mutate a deep clone ("draft") so the logic reads like the
 * textbook pseudo-code.
 *
 * Algorithm summary (per process Pi):
 *   request : clock++, reqTs = clock, send REQUEST(reqTs) to every peer, wait for N-1 REPLYs.
 *   receive REQUEST from Pj(ts):
 *             clock = max(clock, ts) + 1
 *             if Pi is IN_CS, or Pi is requesting with priority (reqTs,i) < (ts,j):
 *                 DEFER the reply (remember j)
 *             else send REPLY immediately
 *   receive REPLY : clock = max(clock, ts) + 1; count it; when N-1 REPLYs are present -> enter CS
 *   release : leave CS, send RELEASE notices to all peers, then send the deferred REPLYs.
 *
 * Automatic and manual modes share every function below. The mode only decides
 * WHO creates requests (random eligible process vs. the user) and WHETHER the
 * owner is released automatically.
 */
import {
  PROCESS_STATES as PS,
  MESSAGE_TYPES as MT,
  MESSAGE_STATUS as MS,
  LOG_KINDS as LK,
  SIM_MODES as MODE,
  MIN_PROCESSES,
  MAX_PROCESSES,
  DEFAULT_PROCESSES,
  FIXED_LATENCY_TICKS,
  MAX_LOG_ENTRIES,
  MAX_MESSAGE_LOG,
  CS_HOLD_TICKS,
  AUTO_COOLDOWN_TICKS,
  AUTO_RATES,
  DEFAULT_AUTO_RATE,
} from './constants.js';
import { nextRandom } from './rng.js';
import { SCENARIOS } from './scenarios.js';

const DEMO_TIMEOUT_TICKS = 80; // safety net: a scenario step that never settles is aborted

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

let wallClock = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

/** Allows tests to replace the wall-clock used for log timestamps. */
export function setWallClockProvider(fn) {
  wallClock = fn;
}

const cloneState = (s) => structuredClone(s);
const ok = (state) => ({ state, error: null });
const fail = (state, error) => ({ state, error });

export const procName = (id) => `P${id}`;
export const getProcess = (s, id) => s.processes.find((p) => p.id === id) ?? null;
export const peersOf = (s, id) => s.processes.filter((p) => p.id !== id);
export const isPending = (p) => p.state === PS.REQUESTING || p.state === PS.WAITING;

/**
 * Total order used by Ricart–Agrawala: (timestamp, processId).
 * Returns true when (tsA, idA) has strictly higher priority (is smaller) than (tsB, idB).
 */
export function hasPriority(tsA, idA, tsB, idB) {
  if (tsA !== tsB) return tsA < tsB;
  return idA < idB;
}

function newProcess(id) {
  return {
    id,
    name: procName(id),
    clock: 0,
    state: PS.IDLE,
    reqTs: null,
    reqSimTime: null,
    replies: [],         // ids of peers whose REPLY has arrived for the current request
    deferred: [],        // ids of peers whose REPLY we are holding back
    releasingUntil: null,
    csRemaining: null,   // automatic release: ticks left inside the CS
    csEnteredAt: null,   // tick at which the current CS entry started
    cooldownUntil: 0,    // automatic mode: earliest tick at which this process may request again
    sent: 0,
    received: 0,
    requestsMade: 0,
    entries: 0,
    totalWait: 0,
    maxWait: 0,
    totalCsTime: 0,
    deferredTotal: 0,
    lastWait: null,
    lastRelease: null,
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Creates a fresh simulator state.
 *   latencyMode: 'random' (1–3 ticks, messages may overtake each other) or 'fixed'.
 *   mode:        'manual' (user creates requests) or 'auto' (random eligible processes request).
 *   autoRate:    key of AUTO_RATES.
 *   autoRelease: automatically release the CS after a short simulated period.
 */
export function createSimulation({
  n = DEFAULT_PROCESSES,
  latencyMode = 'random',
  seed,
  mode = MODE.MANUAL,
  autoRate = DEFAULT_AUTO_RATE,
  autoRelease = true,
} = {}) {
  if (!Number.isInteger(n) || n < MIN_PROCESSES || n > MAX_PROCESSES) {
    throw new RangeError(`Process count must be an integer between ${MIN_PROCESSES} and ${MAX_PROCESSES}.`);
  }
  if (mode !== MODE.MANUAL && mode !== MODE.AUTO) throw new RangeError(`Unknown mode ${mode}.`);
  if (!AUTO_RATES[autoRate]) throw new RangeError(`Unknown request rate ${autoRate}.`);
  const initialSeed = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 0x7fffffff);
  return {
    n,
    latencyMode,
    fixedLatency: FIXED_LATENCY_TICKS,
    initialSeed,
    rngSeed: initialSeed,
    simTime: 0,
    processes: Array.from({ length: n }, (_, i) => newProcess(i + 1)),
    csOwners: [],          // criticalSectionOwners – the invariant is csOwners.length <= 1
    inFlight: [],          // messages travelling through the network
    messageLog: [],        // message records (sent → delivered) for the Message Log
    log: [],               // event log (structured entries)
    nextLogId: 1,
    nextMsgId: 1,
    totals: {
      sent: 0,
      received: 0,
      byType: { REQUEST: 0, REPLY: 0, RELEASE: 0 },
      deferred: 0,
      violations: 0,
      csTime: 0,
      csCompleted: 0,
      maxWait: 0,
    },
    mode,
    autoRate,
    autoRelease,
    running: false,        // clock / automatic activity running
    paused: false,         // explicit pause (blocks manual message draining)
    draining: false,       // manual actions: keep ticking until in-flight messages settle
    demo: null,            // scenario progress { scenarioId, index, ran, stepStart }
    lastScenario: null,    // { id, status, reason }
    violation: null,       // set if the mutual exclusion invariant is ever broken
  };
}

// ---------------------------------------------------------------------------
// Logging, clocks, randomness
// ---------------------------------------------------------------------------

/**
 * Structured event log. `fields` carries the data the UI filters on:
 *   pid (process involved), from/to (message endpoints), msgType, clock.
 * Entries with msgType are message-related (sends and receipts) and appear in the Message Log;
 * entries without it are local events shown in the Simulation Timeline.
 */
function addLog(s, kind, text, fields = {}) {
  s.log.push({
    id: s.nextLogId++,
    wall: wallClock(),
    sim: s.simTime,
    kind,
    text,
    pid: fields.pid ?? null,
    from: fields.from ?? null,
    to: fields.to ?? null,
    msgType: fields.msgType ?? null,
    clock: fields.clock ?? null,
  });
  if (s.log.length > MAX_LOG_ENTRIES) s.log.splice(0, s.log.length - MAX_LOG_ENTRIES);
}

/**
 * Lamport clock rule.
 *  - Local event or send: clock = clock + 1.
 *  - Receive(ts):         clock = max(clock, ts) + 1.
 * Returns the new clock value.
 */
export function updateLogicalClock(proc, receivedTs = null) {
  proc.clock = receivedTs === null ? proc.clock + 1 : Math.max(proc.clock, receivedTs) + 1;
  return proc.clock;
}

function randomFloat(s) {
  const r = nextRandom(s.rngSeed);
  s.rngSeed = r.seed;
  return r.value;
}

function randInt(s, min, max) {
  return min + Math.floor(randomFloat(s) * (max - min + 1));
}

function chooseLatency(s) {
  if (s.latencyMode === 'fixed') return s.fixedLatency;
  return 1 + Math.floor(randomFloat(s) * 3);
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/**
 * Sends one message (mutates draft s). Clock rule: the sender increments its
 * clock on every send unless an explicit `ts` is supplied (REQUEST uses the
 * single request timestamp for all peers).
 */
export function sendMessage(s, from, to, type, opts = {}) {
  const sender = getProcess(s, from);
  const ts = opts.ts ?? updateLogicalClock(sender);
  const latency = chooseLatency(s);
  const msg = {
    id: s.nextMsgId++,
    from,
    to,
    type,
    ts,
    sentAt: s.simTime,
    deliverAt: s.simTime + latency,
    latency,
    status: MS.IN_FLIGHT,
    deferred: Boolean(opts.deferred),
    deliveredAt: null,
  };
  s.inFlight.push(msg);
  s.messageLog.push({
    id: msg.id,
    wall: wallClock(),
    from,
    to,
    type,
    ts,
    sentAt: s.simTime,
    deliveredAt: null,
    status: MS.IN_FLIGHT,
    deferred: msg.deferred,
  });
  if (s.messageLog.length > MAX_MESSAGE_LOG) s.messageLog.splice(0, s.messageLog.length - MAX_MESSAGE_LOG);

  sender.sent += 1;
  s.totals.sent += 1;
  s.totals.byType[type] += 1;
  if (!opts.quiet) {
    const kind = type === MT.REQUEST ? LK.REQUEST : type === MT.REPLY ? LK.REPLY : LK.RELEASE;
    const tag = msg.deferred ? ' (deferred)' : '';
    const receiver = getProcess(s, to).name;
    addLog(s, kind, `${sender.name} → ${receiver} ${type}${tag} [ts ${ts}]`, {
      pid: from, from, to, msgType: type, clock: ts,
    });
  }
  return msg;
}

/** Delivers a message to its recipient (mutates draft s) and dispatches by type. */
export function receiveMessage(s, msg) {
  msg.status = MS.DELIVERED;
  msg.deliveredAt = s.simTime;
  const record = s.messageLog.find((r) => r.id === msg.id);
  if (record) {
    record.status = MS.DELIVERED;
    record.deliveredAt = s.simTime;
  }
  const recipient = getProcess(s, msg.to);
  recipient.received += 1;
  s.totals.received += 1;
  switch (msg.type) {
    case MT.REQUEST:
      handleRequest(s, msg);
      break;
    case MT.REPLY:
      handleReply(s, msg);
      break;
    case MT.RELEASE:
      handleRelease(s, msg);
      break;
    default:
      addLog(s, LK.ERROR, `Unknown message type ${msg.type} ignored`, { pid: msg.to });
  }
}

// ---------------------------------------------------------------------------
// Ricart–Agrawala message handlers (operate on the draft state)
// ---------------------------------------------------------------------------

/** Rule for an incoming REQUEST from Pj with timestamp ts. */
export function handleRequest(s, msg) {
  const me = getProcess(s, msg.to);
  updateLogicalClock(me, msg.ts);

  const insideCS = me.state === PS.IN_CRITICAL_SECTION;
  const myRequestHasPriority =
    isPending(me) && hasPriority(me.reqTs, me.id, msg.ts, msg.from);

  if (insideCS || myRequestHasPriority) {
    if (!me.deferred.includes(msg.from)) me.deferred.push(msg.from);
    me.deferredTotal += 1;
    s.totals.deferred += 1;
    const reason = insideCS
      ? 'is inside the Critical Section'
      : `has priority (ts ${me.reqTs}, id ${me.id}) over (ts ${msg.ts}, id ${msg.from})`;
    addLog(s, LK.DEFER, `${me.name} DEFERS its REPLY to ${procName(msg.from)} – ${me.name} ${reason}`, {
      pid: me.id, from: me.id, to: msg.from,
    });
  } else {
    sendMessage(s, me.id, msg.from, MT.REPLY);
  }
}

/** Rule for an incoming REPLY: count it and enter the CS once all N-1 have arrived. */
export function handleReply(s, msg) {
  const me = getProcess(s, msg.to);
  updateLogicalClock(me, msg.ts);

  if (!isPending(me)) {
    addLog(s, LK.ERROR, `${me.name} ignored a stale REPLY from ${procName(msg.from)}`, { pid: me.id });
    return;
  }
  if (!me.replies.includes(msg.from)) me.replies.push(msg.from);
  addLog(s, LK.REPLY, `${me.name} received REPLY from ${procName(msg.from)} (${me.replies.length}/${s.n - 1})`, {
    pid: me.id, from: msg.from, to: me.id, msgType: MT.REPLY, clock: me.clock,
  });

  if (me.replies.length === s.n - 1) enterCriticalSection(s, me);
}

/**
 * RELEASE is broadcast when a process leaves the CS. Under Ricart–Agrawala the
 * permission hand-off is the deferred REPLY; RELEASE is the informational
 * notice that lets peers update their view of the owner.
 */
export function handleRelease(s, msg) {
  const me = getProcess(s, msg.to);
  updateLogicalClock(me, msg.ts);
  me.lastRelease = { from: msg.from, ts: msg.ts, at: s.simTime };
}

function enterCriticalSection(s, p) {
  // Under correct RA this only runs when no other owner exists. If it ever does
  // not, the owner is still recorded so the invariant check reports the breach.
  p.state = PS.IN_CRITICAL_SECTION;
  p.csRemaining = null;
  p.csEnteredAt = s.simTime;
  s.csOwners.push(p.id);
  p.entries += 1;
  const wait = s.simTime - (p.reqSimTime ?? s.simTime);
  p.totalWait += wait;
  p.lastWait = wait;
  p.maxWait = Math.max(p.maxWait, wait);
  s.totals.maxWait = Math.max(s.totals.maxWait, wait);
  addLog(s, LK.ENTER, `${p.name} ENTERED the Critical Section (all ${s.n - 1} REPLYs received, waited ${wait} tick${wait === 1 ? '' : 's'})`, {
    pid: p.id,
  });
}

/** Local request creation (mutates draft). Returns an error string or null. */
function draftRequest(s, id) {
  const p = getProcess(s, id);
  if (!p) return `No process with id ${id}.`;
  if (p.state === PS.IN_CRITICAL_SECTION) return `${p.name} is already inside the Critical Section.`;
  if (isPending(p)) return `${p.name} already has an outstanding request. Duplicate request ignored.`;
  if (p.state === PS.RELEASING) return `${p.name} is still releasing the Critical Section. Try again in a moment.`;

  updateLogicalClock(p);                 // step 1: increment logical clock
  p.reqTs = p.clock;                     // step 2: request carries (timestamp, id)
  p.reqSimTime = s.simTime;
  p.replies = [];
  p.state = PS.REQUESTING;
  p.requestsMade += 1;
  p.csRemaining = null;
  addLog(s, LK.REQUEST, `${p.name} created REQUEST at logical timestamp ${p.reqTs} (priority key (${p.reqTs}, ${p.id}))`, {
    pid: p.id, clock: p.reqTs,
  });

  for (const peer of peersOf(s, id)) {   // step 3: broadcast REQUEST
    sendMessage(s, id, peer.id, MT.REQUEST, { ts: p.reqTs });
  }
  return null;
}

/** Leaving the CS (mutates draft). Sends RELEASE notices, then deferred REPLYs. */
function draftRelease(s, id) {
  const p = getProcess(s, id);
  if (p.csEnteredAt !== null) {
    const duration = s.simTime - p.csEnteredAt;
    p.totalCsTime += duration;
    s.totals.csTime += duration;
    s.totals.csCompleted += 1;
    p.csEnteredAt = null;
  }
  s.csOwners = s.csOwners.filter((x) => x !== id);
  p.state = PS.RELEASING;
  p.releasingUntil = s.simTime + 1;
  p.csRemaining = null;
  p.cooldownUntil = s.simTime + AUTO_COOLDOWN_TICKS;
  updateLogicalClock(p);

  const deferredIds = [...p.deferred].sort((a, b) => a - b);
  p.deferred = [];

  addLog(s, LK.EXIT, `${p.name} released the Critical Section`, { pid: p.id });
  const peers = peersOf(s, id);
  addLog(s, LK.RELEASE, `${p.name} broadcast RELEASE to ${peers.map((q) => q.name).join(', ')}`, { pid: p.id });
  for (const q of peers) sendMessage(s, id, q.id, MT.RELEASE, { quiet: true });
  for (const k of deferredIds) sendMessage(s, id, k, MT.REPLY, { deferred: true });
}

// ---------------------------------------------------------------------------
// Derived state, invariant and violation handling
// ---------------------------------------------------------------------------

/**
 * WAITING vs REQUESTING is derived from the algorithm's own data: a requesting
 * process is WAITING when at least one peer is deferring its REPLY to it.
 */
export function refreshStates(s) {
  for (const p of s.processes) {
    if (p.state !== PS.REQUESTING && p.state !== PS.WAITING) continue;
    const blocked = s.processes.some((q) => q.id !== p.id && q.deferred.includes(p.id));
    p.state = blocked ? PS.WAITING : PS.REQUESTING;
  }
}

/**
 * Mutual exclusion invariant: at most one owner, and the owner set agrees with
 * the processes that are actually in the IN_CRITICAL_SECTION state.
 */
export function checkMutualExclusion(s) {
  const inCsStates = s.processes.filter((p) => p.state === PS.IN_CRITICAL_SECTION).map((p) => p.id);
  const owners = [...s.csOwners];
  const consistent =
    inCsStates.length === owners.length && inCsStates.every((id) => owners.includes(id));
  if (owners.length <= 1 && consistent) {
    return { safe: true, owners, conflicting: [] };
  }
  const conflicting = [...new Set([...owners, ...inCsStates])].sort((a, b) => a - b);
  return { safe: false, owners, conflicting };
}

function abortScenario(s, reason) {
  if (!s.demo) return;
  addLog(s, LK.ERROR, `Scenario stopped: ${reason}`);
  s.lastScenario = { id: s.demo.scenarioId, status: 'ABORTED', reason };
  s.demo = null;
}

function haltOnViolation(s, check) {
  s.violation = {
    atSimTime: s.simTime,
    processes: check.conflicting,
    message: `MUTUAL EXCLUSION VIOLATION: ${check.conflicting.map(procName).join(', ')} inside the Critical Section at the same time`,
  };
  s.totals.violations += 1;
  addLog(s, LK.VIOLATION, `Mutual exclusion violation detected: ${check.conflicting.map(procName).join(', ')} inside the Critical Section at the same time`);
  s.running = false;
  s.paused = true;
  s.draining = false;
  abortScenario(s, 'mutual exclusion violation');
}

function refreshActivity(s) {
  const releasing = s.processes.some((p) => p.state === PS.RELEASING);
  s.draining = !s.violation && !s.running && !s.paused && (s.inFlight.length > 0 || releasing);
}

/** Runs derived-state refresh and the invariant check after every mutation. */
function finalize(s) {
  refreshStates(s);
  const check = checkMutualExclusion(s);
  if (!check.safe) haltOnViolation(s, check);
  refreshActivity(s);
  return s;
}

// ---------------------------------------------------------------------------
// Automatic mode
// ---------------------------------------------------------------------------

/**
 * One automatic step (only when mode === 'auto' and running):
 *  1. The CS owner is released after a random hold period (if Auto Release is on).
 *  2. With the configured probability, ONE idle, eligible process is chosen at random
 *     and requests the CS. The number of simultaneous requesters is capped.
 */
function autoStep(s) {
  if (s.autoRelease) {
    for (const id of [...s.csOwners]) {
      const p = getProcess(s, id);
      if (p.csRemaining === null) {
        p.csRemaining = randInt(s, CS_HOLD_TICKS.min, CS_HOLD_TICKS.max);
        continue;
      }
      p.csRemaining -= 1;
      if (p.csRemaining <= 0) draftRelease(s, id);
    }
  }

  const cap = Math.max(1, Math.floor(s.n / 2));
  const active = s.processes.filter(isPending).length;
  if (active >= cap) return;

  const eligible = s.processes.filter((p) => p.state === PS.IDLE && s.simTime >= p.cooldownUntil);
  if (eligible.length === 0) return;
  const roll = randomFloat(s);
  if (roll >= AUTO_RATES[s.autoRate].probability) return;

  const chosen = eligible[randInt(s, 0, eligible.length - 1)];
  draftRequest(s, chosen.id);
}

// ---------------------------------------------------------------------------
// Scenario runner (scripted demonstrations)
// ---------------------------------------------------------------------------

function executeAction(s, action) {
  switch (action.type) {
    case 'REQUEST':
      return draftRequest(s, action.pid);
    case 'REQUEST_MANY':
      for (const pid of action.pids) {
        const err = draftRequest(s, pid);
        if (err) return err;
      }
      return null;
    case 'RELEASE': {
      if (!s.csOwners.includes(action.pid)) {
        return `${procName(action.pid)} is not inside the Critical Section, so it cannot release it.`;
      }
      draftRelease(s, action.pid);
      return null;
    }
    case 'RELEASE_OWNER': {
      const owner = s.csOwners[0];
      if (owner === undefined) return 'No owner to release.';
      draftRelease(s, owner);
      return null;
    }
    default:
      return `Unknown scenario action ${action.type}`;
  }
}

function finishScenario(s) {
  const scenario = SCENARIOS[s.demo.scenarioId];
  addLog(s, LK.DEMO, `Scenario complete: ${scenario.title}. Mutual exclusion held at every step.`);
  s.lastScenario = { id: scenario.id, status: 'COMPLETE', reason: null };
  s.demo = null;
  s.running = false;
  s.paused = false;
}

function runScenarioStep(s) {
  const d = s.demo;
  const steps = SCENARIOS[d.scenarioId].steps;
  const step = steps[d.index];
  if (!step) {
    finishScenario(s);
    return;
  }

  if (!d.ran) {
    if (s.simTime - d.stepStart < (step.waitTicks ?? 0)) return;
    addLog(s, LK.DEMO, `▶ ${step.note}`);
    d.ran = true;
    d.stepStart = s.simTime;
    if (step.action) {
      const err = executeAction(s, step.action);
      if (err) {
        abortScenario(s, err);
        return;
      }
    }
  }

  const elapsed = s.simTime - d.stepStart;
  if (elapsed > DEMO_TIMEOUT_TICKS) {
    abortScenario(s, `step ${d.index + 1} did not settle in time`);
    return;
  }
  if (elapsed >= (step.minTicks ?? 0) && (!step.until || step.until(s))) {
    d.index += 1;
    d.ran = false;
    d.stepStart = s.simTime;
  }
}

// ---------------------------------------------------------------------------
// Clock tick – the single place where simulated time advances
// ---------------------------------------------------------------------------

/**
 * Advances the simulation by one tick:
 *   1. deliver every message whose deliverAt <= now (deterministic order),
 *   2. finish RELEASING processes,
 *   3. advance the scenario, or the automatic mode,
 *   4. refresh derived states and check mutual exclusion.
 * Without `force`, a tick is ignored unless the simulation is running or draining,
 * which is what makes Pause freeze all activity.
 */
export function tick(state, { force = false } = {}) {
  if (state.violation) return state;
  if (!force && !state.running && !state.draining) return state;

  const s = cloneState(state);
  s.simTime += 1;

  const due = s.inFlight
    .filter((m) => m.deliverAt <= s.simTime)
    .sort((a, b) => a.deliverAt - b.deliverAt || a.id - b.id);
  s.inFlight = s.inFlight.filter((m) => m.deliverAt > s.simTime);
  for (const msg of due) {
    receiveMessage(s, msg);
    if (s.violation) break;
  }

  for (const p of s.processes) {
    if (p.state === PS.RELEASING && p.releasingUntil !== null && p.releasingUntil <= s.simTime) {
      p.state = PS.IDLE;
      p.releasingUntil = null;
    }
  }

  if (!s.violation) {
    if (s.demo) runScenarioStep(s);
    else if (s.running && s.mode === MODE.AUTO) autoStep(s);
  }

  return finalize(s);
}

// ---------------------------------------------------------------------------
// Public user actions – each returns { state, error }
// ---------------------------------------------------------------------------

const HALTED = 'The simulator is halted by a mutual exclusion violation. Reset to continue.';
const SCENARIO_BUSY = 'A scenario is running. Stop it or wait for it to finish first.';

export function requestCriticalSection(state, id) {
  if (state.violation) return fail(state, HALTED);
  if (state.demo) return fail(state, SCENARIO_BUSY);
  if (state.mode === MODE.AUTO) {
    return fail(state, 'Automatic mode creates requests itself. Switch to Manual mode to request manually.');
  }
  const s = cloneState(state);
  const error = draftRequest(s, id);
  if (error) return fail(state, error);
  return ok(finalize(s));
}

export function releaseCriticalSection(state, id = null) {
  if (state.violation) return fail(state, HALTED);
  if (state.demo) return fail(state, SCENARIO_BUSY);
  if (state.mode === MODE.AUTO && state.autoRelease) {
    return fail(state, 'Auto Release is ON, so the automatic mode releases the critical section itself. Turn Auto Release OFF to release manually.');
  }
  const ownerId = id ?? state.csOwners[0] ?? null;
  if (ownerId === null || !state.csOwners.includes(ownerId)) {
    return fail(state, 'No process is inside the Critical Section, so there is nothing to release.');
  }
  const s = cloneState(state);
  draftRelease(s, ownerId);
  return ok(finalize(s));
}

/** Switches between MANUAL and AUTOMATIC. Current state is kept; no timers are touched. */
export function setMode(state, mode) {
  if (mode !== MODE.MANUAL && mode !== MODE.AUTO) return fail(state, 'Unknown simulation mode.');
  if (state.violation) return fail(state, HALTED);
  if (state.demo) return fail(state, 'Mode cannot change while a scenario runs. Stop the scenario first.');
  if (state.mode === mode) return ok(state);
  const s = cloneState(state);
  s.mode = mode;
  // A release countdown belongs to automatic mode only; drop it on switch.
  for (const p of s.processes) p.csRemaining = null;
  addLog(s, LK.SYSTEM, mode === MODE.AUTO
    ? 'Mode switched to AUTOMATIC: random eligible processes will request the CS'
    : 'Mode switched to MANUAL: you control requests and releases');
  return ok(finalize(s));
}

export function setAutoRate(state, rate) {
  if (!AUTO_RATES[rate]) return fail(state, 'Unknown request frequency.');
  if (state.autoRate === rate) return ok(state);
  const s = cloneState(state);
  s.autoRate = rate;
  addLog(s, LK.SYSTEM, `Request frequency set to ${AUTO_RATES[rate].label}`);
  return ok(s);
}

export function setAutoRelease(state, enabled) {
  const flag = Boolean(enabled);
  if (state.autoRelease === flag) return ok(state);
  const s = cloneState(state);
  s.autoRelease = flag;
  addLog(s, LK.SYSTEM, flag ? 'Auto Release ON: the CS is released after a short simulated period' : 'Auto Release OFF: the CS is released only by you');
  return ok(s);
}

export function startSimulation(state) {
  if (state.violation) return fail(state, HALTED);
  if (state.running) return ok(state);
  const s = cloneState(state);
  s.running = true;
  s.paused = false;
  const text = s.demo
    ? 'Scenario resumed'
    : s.mode === MODE.AUTO
      ? 'Automatic simulation started'
      : 'Simulation clock started (manual mode: requests are yours)';
  addLog(s, LK.SYSTEM, text);
  return ok(finalize(s));
}

export function pauseSimulation(state) {
  if (!state.running && !state.draining) return ok(state);
  const s = cloneState(state);
  s.running = false;
  s.paused = true;
  s.draining = false;
  addLog(s, LK.SYSTEM, 'Simulation paused – no new events occur until resumed or stepped');
  return ok(s);
}

/** Advances exactly one tick while paused / idle (the "Step" button). */
export function stepSimulation(state) {
  if (state.violation) return fail(state, HALTED);
  if (state.running) return fail(state, 'Pause the simulation before stepping.');
  return ok(tick(state, { force: true }));
}

export function startScenario(state, scenarioId) {
  if (state.violation) return fail(state, HALTED);
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) return fail(state, `Unknown scenario ${scenarioId}.`);
  if (state.demo) return fail(state, 'A scenario is already running.');
  if (state.n < scenario.requiredProcesses) {
    return fail(state, `This scenario needs at least ${scenario.requiredProcesses} processes.`);
  }
  const s = cloneState(state);
  if (scenario.kind === 'auto') {
    // Random Simulation: hand control to the automatic engine (same code path as the AUTOMATIC mode).
    s.mode = MODE.AUTO;
    s.running = true;
    s.paused = false;
    s.lastScenario = { id: scenario.id, status: 'RUNNING', reason: null };
    addLog(s, LK.DEMO, `Scenario started: ${scenario.title}. Random eligible processes request the CS.`);
    return ok(finalize(s));
  }
  s.demo = { scenarioId, index: 0, ran: false, stepStart: s.simTime };
  s.running = true;
  s.paused = false;
  addLog(s, LK.DEMO, `Scenario started: ${scenario.title} (${scenario.steps.length} steps)`);
  return ok(finalize(s));
}

export function stopScenario(state) {
  if (!state.demo) return ok(state);
  const s = cloneState(state);
  abortScenario(s, 'stopped by user');
  s.running = false;
  s.paused = true;
  return ok(finalize(s));
}

export function clearLog(state) {
  const s = cloneState(state);
  s.log = [];
  s.messageLog = [];
  return s;
}

export { SCENARIOS };
