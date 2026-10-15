import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation, tick, requestCriticalSection, releaseCriticalSection,
  startSimulation, pauseSimulation, stepSimulation, startScenario,
  checkMutualExclusion, hasPriority, updateLogicalClock, getProcess,
  setWallClockProvider, handleRequest,
} from '../ricartAgrawala.js';
import { PROCESS_STATES as PS, MESSAGE_TYPES as MT } from '../constants.js';

setWallClockProvider(() => '00:00:00');

const owners = (s) => s.csOwners.slice();
const stateOf = (s, id) => getProcess(s, id).state;

/** Step the simulation (forced, as if paused-and-stepped) until pred holds. */
function runUntil(s, pred, max = 500) {
  for (let i = 0; i < max; i++) {
    if (pred(s)) return s;
    s = tick(s, { force: true });
    assert.ok(checkMutualExclusion(s).safe, 'mutual exclusion must hold at every tick');
  }
  assert.fail('condition not reached within ' + max + ' ticks');
}

describe('Lamport logical clocks', () => {
  test('local event increments the clock by one', () => {
    const p = { clock: 4 };
    assert.equal(updateLogicalClock(p), 5);
  });

  test('receive sets clock = max(clock, ts) + 1', () => {
    const a = { clock: 4 };
    assert.equal(updateLogicalClock(a, 9), 10);
    const b = { clock: 7 };
    assert.equal(updateLogicalClock(b, 3), 8);
  });
});

describe('Request priority (timestamp, processId)', () => {
  test('smaller timestamp wins', () => {
    assert.equal(hasPriority(3, 5, 4, 1), true);
    assert.equal(hasPriority(4, 1, 3, 5), false);
  });

  test('equal timestamps are broken by process ID', () => {
    assert.equal(hasPriority(5, 1, 5, 3), true);
    assert.equal(hasPriority(5, 3, 5, 1), false);
    assert.equal(hasPriority(5, 2, 5, 2), false); // identical pair is not strictly higher
  });
});

describe('Construction and validation', () => {
  test('rejects process counts outside 2..10', () => {
    assert.throws(() => createSimulation({ n: 1 }), RangeError);
    assert.throws(() => createSimulation({ n: 11 }), RangeError);
    assert.throws(() => createSimulation({ n: 3.5 }), RangeError);
  });

  test('new simulation: all IDLE, zero counters, no owner', () => {
    const s = createSimulation({ n: 5, seed: 1 });
    assert.equal(s.processes.length, 5);
    assert.ok(s.processes.every((p) => p.state === PS.IDLE && p.clock === 0 && p.sent === 0));
    assert.deepEqual(owners(s), []);
    assert.equal(s.totals.sent, 0);
    assert.equal(s.inFlight.length, 0);
  });
});

describe('Test 1 – two processes: P1 enters, releases, then P2 enters', () => {
  test('sequential access works', () => {
    let s = createSimulation({ n: 2, latencyMode: 'fixed', seed: 7 });
    let r = requestCriticalSection(s, 1);
    assert.equal(r.error, null);
    s = r.state;
    assert.equal(stateOf(s, 1), PS.REQUESTING);
    s = runUntil(s, (x) => owners(x).includes(1));
    assert.deepEqual(owners(s), [1]);
    r = releaseCriticalSection(s);
    assert.equal(r.error, null);
    s = r.state;
    assert.deepEqual(owners(s), []);
    r = requestCriticalSection(s, 2);
    s = runUntil(r.state, (x) => owners(x).includes(2));
    assert.deepEqual(owners(s), [2]);
    s = releaseCriticalSection(s).state;
    s = runUntil(s, (x) => !x.processes.some((p) => p.state === PS.RELEASING) && x.inFlight.length === 0);
    assert.equal(s.violation, null);
  });
});

describe('Test 2 – five processes, multiple requests, one owner at a time', () => {
  test('every requester eventually enters and never overlaps', () => {
    let s = createSimulation({ n: 5, latencyMode: 'random', seed: 99 });
    for (const id of [1, 2, 3, 4, 5]) {
      const r = requestCriticalSection(s, id);
      assert.equal(r.error, null);
      s = r.state;
    }
    const entered = [];
    let guard = 0;
    while (entered.length < 5 && guard++ < 800) {
      s = tick(s, { force: true });
      assert.ok(owners(s).length <= 1, 'at most one owner');
      if (owners(s).length === 1 && !entered.includes(owners(s)[0])) {
        entered.push(owners(s)[0]);
        s = releaseCriticalSection(s).state;
      }
    }
    assert.equal(entered.length, 5, 'all five processes obtained the CS');
    assert.equal(new Set(entered).size, 5);
    assert.equal(s.violation, null);
  });
});

describe('Test 3 – simultaneous requests are ordered by (timestamp, processId)', () => {
  test('equal timestamps: lower process ID enters first', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 3 });
    // Both processes start at clock 0, so both request with timestamp 1.
    s = requestCriticalSection(s, 3).state;
    s = requestCriticalSection(s, 1).state;
    const p1 = getProcess(s, 1), p3 = getProcess(s, 3);
    assert.equal(p1.reqTs, p3.reqTs, 'same logical timestamp');
    s = runUntil(s, (x) => owners(x).length === 1);
    assert.deepEqual(owners(s), [1], 'P1 wins the tie because 1 < 3');
    assert.equal(stateOf(s, 3), PS.WAITING, 'P3 waits: P1 defers its REPLY');
    s = releaseCriticalSection(s).state;
    s = runUntil(s, (x) => owners(x).length === 1);
    assert.deepEqual(owners(s), [3], 'P3 enters after P1 releases');
  });

  test('different timestamps: smaller timestamp enters first', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 3 });
    // Set logical clocks directly so the two requests carry clearly different timestamps.
    getProcess(s, 2).clock = 2;
    getProcess(s, 4).clock = 20;
    s = requestCriticalSection(s, 4).state; // request ts 21 (larger, lower priority)
    s = requestCriticalSection(s, 2).state; // request ts 3  (smaller, higher priority)
    const ts2 = getProcess(s, 2).reqTs, ts4 = getProcess(s, 4).reqTs;
    assert.ok(ts2 < ts4, `precondition: P2 (${ts2}) has lower timestamp than P4 (${ts4})`);
    s = runUntil(s, (x) => owners(x).length === 1);
    assert.deepEqual(owners(s), [2], 'the smaller timestamp wins even though P4 asked first');
    assert.equal(stateOf(s, 4), PS.WAITING);
  });
});

describe('Test 4 – a request made while another process is inside must wait', () => {
  test('requester becomes WAITING and enters only after release', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 5 });
    s = requestCriticalSection(s, 2).state;
    s = runUntil(s, (x) => owners(x).includes(2));
    s = requestCriticalSection(s, 4).state;
    s = runUntil(s, (x) => stateOf(x, 4) === PS.WAITING);
    assert.deepEqual(owners(s), [2], 'P2 still the only owner');
    assert.ok(getProcess(s, 2).deferred.includes(4), 'P2 is holding P4\'s REPLY');
    s = releaseCriticalSection(s).state;
    s = runUntil(s, (x) => owners(x).includes(4));
    assert.deepEqual(owners(s), [4]);
  });
});

describe('Test 5 – release sends deferred REPLYs and the waiter enters', () => {
  test('deferred REPLY is counted and sent exactly once', () => {
    let s = createSimulation({ n: 3, latencyMode: 'fixed', seed: 11 });
    s = requestCriticalSection(s, 1).state;
    s = runUntil(s, (x) => owners(x).includes(1));
    s = requestCriticalSection(s, 2).state;
    s = runUntil(s, (x) => getProcess(x, 1).deferred.includes(2));
    const before = s.totals.sent;
    s = releaseCriticalSection(s).state;
    // RELEASE to P2 & P3 (2 messages) + deferred REPLY to P2 (1 message)
    assert.equal(s.totals.sent - before, 3);
    assert.equal(s.inFlight.filter((m) => m.type === MT.REPLY && m.deferred).length, 1);
    s = runUntil(s, (x) => owners(x).includes(2));
    assert.deepEqual(owners(s), [2]);
  });
});

describe('Test 6 – automatic simulation: no mutual exclusion violation', () => {
  for (const n of [2, 5, 10]) {
    for (const seed of [1, 2, 3]) {
      test(`n=${n}, seed=${seed}, 1500 ticks`, () => {
        let s = createSimulation({ n, latencyMode: 'random', seed, mode: 'auto' });
        s = startSimulation(s).state;
        let entries = 0;
        let prevEntries = 0;
        for (let i = 0; i < 1500; i++) {
          s = tick(s);
          assert.ok(owners(s).length <= 1, 'csOwners.length <= 1');
          assert.equal(s.violation, null);
          const total = s.processes.reduce((a, p) => a + p.entries, 0);
          if (total > prevEntries) entries += total - prevEntries;
          prevEntries = total;
        }
        assert.ok(entries > 5, `auto mode should serve several entries (got ${entries})`);
      });
    }
  }
});

describe('Test 7 – reset returns everything to the initial state', () => {
  test('fresh simulation after activity has IDLE processes and zero counters', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 2 });
    s = startSimulation(s).state;
    for (let i = 0; i < 40; i++) s = tick(s);
    const fresh = createSimulation({ n: 4, latencyMode: 'fixed', seed: 2 });
    assert.ok(fresh.processes.every((p) => p.state === PS.IDLE && p.sent === 0 && p.entries === 0));
    assert.equal(fresh.inFlight.length, 0);
    assert.deepEqual(fresh.csOwners, []);
  });
});

describe('Test 8 & 9 – pause freezes events, start resumes them', () => {
  test('tick is a no-op while paused (same object returned)', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 4 });
    s = startSimulation(s).state;
    s = tick(s);
    s = pauseSimulation(s).state;
    const frozen = s;
    const after = tick(s);
    assert.equal(after, frozen, 'no state change while paused');
    assert.equal(after.simTime, frozen.simTime);
  });

  test('start after pause continues the simulation', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 4 });
    s = startSimulation(s).state;
    s = pauseSimulation(s).state;
    const t0 = s.simTime;
    s = startSimulation(s).state;
    s = tick(s);
    assert.equal(s.simTime, t0 + 1);
  });

  test('pausing during in-flight messages stops draining; Step advances one tick', () => {
    let s = createSimulation({ n: 3, latencyMode: 'fixed', seed: 4 });
    s = requestCriticalSection(s, 1).state;
    assert.equal(s.draining, true, 'manual request drains network while not paused');
    s = pauseSimulation(s).state;
    assert.equal(s.draining, false);
    const t0 = s.simTime;
    assert.equal(tick(s), s);
    s = stepSimulation(s).state;
    assert.equal(s.simTime, t0 + 1);
  });
});

describe('Test 10 – invariant detects a forced violation', () => {
  test('two IN_CS processes are reported and halt the simulator', () => {
    let s = createSimulation({ n: 3, latencyMode: 'fixed', seed: 8 });
    s.processes[0].state = PS.IN_CRITICAL_SECTION;
    s.processes[2].state = PS.IN_CRITICAL_SECTION;
    s.csOwners = [1, 3];
    const check = checkMutualExclusion(s);
    assert.equal(check.safe, false);
    assert.deepEqual(check.conflicting, [1, 3]);

    // A tick on a violated state must halt the simulator.
    const halted = tick(s, { force: true });
    assert.ok(halted.violation, 'violation recorded');
    assert.deepEqual(halted.violation.processes, [1, 3]);
    assert.match(halted.violation.message, /MUTUAL EXCLUSION VIOLATION/);
    assert.equal(halted.running, false);
    assert.ok(halted.log.some((e) => e.kind === 'violation'));
    assert.equal(startSimulation(halted).error !== null, true, 'cannot restart after violation');
  });
});

describe('User action validation', () => {
  test('requesting while already inside the CS is rejected', () => {
    let s = createSimulation({ n: 3, latencyMode: 'fixed', seed: 6 });
    s = requestCriticalSection(s, 1).state;
    s = runUntil(s, (x) => owners(x).includes(1));
    const r = requestCriticalSection(s, 1);
    assert.match(r.error, /already inside/);
    assert.equal(r.state, s, 'state unchanged on error');
  });

  test('duplicate request is rejected', () => {
    let s = createSimulation({ n: 3, latencyMode: 'fixed', seed: 6 });
    s = requestCriticalSection(s, 2).state;
    const r = requestCriticalSection(s, 2);
    assert.match(r.error, /duplicate|outstanding/i);
  });

  test('releasing with no owner is rejected', () => {
    const s = createSimulation({ n: 3, seed: 6 });
    const r = releaseCriticalSection(s);
    assert.match(r.error, /nothing to release/);
  });
});

describe('Message accounting', () => {
  test('one uncontended request on N=5 costs (N-1) REQUEST + (N-1) REPLY + (N-1) RELEASE', () => {
    let s = createSimulation({ n: 5, latencyMode: 'fixed', seed: 12 });
    s = requestCriticalSection(s, 3).state;
    s = runUntil(s, (x) => owners(x).includes(3));
    s = releaseCriticalSection(s).state;
    s = runUntil(s, (x) => x.inFlight.length === 0 && !x.processes.some((p) => p.state === PS.RELEASING));
    assert.equal(s.totals.sent, 12);
    assert.equal(s.totals.received, 12);
    const sentSum = s.processes.reduce((a, p) => a + p.sent, 0);
    assert.equal(sentSum, s.totals.sent);
  });
});

describe('Scripted scenarios', () => {
  const expectedEntries = { single: 1, concurrent: 3, deferred: 2, contention: 5, faculty: 4 };
  for (const [id, expected] of Object.entries(expectedEntries)) {
    test(`${id} scenario completes with no violation and every requester enters once`, () => {
      let s = createSimulation({ n: id === 'contention' ? 5 : 4, latencyMode: 'fixed', seed: 1 });
      s = startScenario(s, id).state;
      const entries = [];
      let sawWaiting = false;
      for (let i = 0; i < 2000 && s.demo; i++) {
        s = tick(s);
        assert.ok(owners(s).length <= 1);
        if (s.processes.some((p) => p.state === PS.WAITING)) sawWaiting = true;
        const cur = owners(s)[0];
        if (cur !== undefined && entries[entries.length - 1] !== cur) entries.push(cur);
      }
      assert.equal(s.demo, null, 'scenario finished');
      assert.equal(s.lastScenario.status, 'COMPLETE');
      assert.equal(s.violation, null);
      assert.equal(entries.length, expected, `${id}: number of CS entries`);
      assert.equal(new Set(entries).size, entries.length, 'each requester enters exactly once');
      if (expected > 1) assert.ok(sawWaiting, 'a requester was observed WAITING');
    });
  }

  test('deferred scenario: P4 waits while P2 is inside, then P2 enters first', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 1 });
    s = startScenario(s, 'deferred').state;
    const entries = [];
    let sawP4Waiting = false;
    for (let i = 0; i < 2000 && s.demo; i++) {
      s = tick(s);
      if (stateOf(s, 4) === PS.WAITING) sawP4Waiting = true;
      const cur = owners(s)[0];
      if (cur !== undefined && entries[entries.length - 1] !== cur) entries.push(cur);
    }
    assert.ok(sawP4Waiting, 'P4 was observed WAITING while P2 held the CS');
    assert.deepEqual(entries, [2, 4]);
  });

  test('faculty walkthrough: P2, P4, then the tie-break pair', () => {
    let s = createSimulation({ n: 4, latencyMode: 'fixed', seed: 1 });
    s = startScenario(s, 'faculty').state;
    const entries = [];
    for (let i = 0; i < 2000 && s.demo; i++) {
      s = tick(s);
      const cur = owners(s)[0];
      if (cur !== undefined && entries[entries.length - 1] !== cur) entries.push(cur);
    }
    assert.equal(entries.length, 4);
    assert.deepEqual(entries.slice(0, 2), [2, 4]);
  });
});

describe('Handler behaviour', () => {
  test('handleRequest replies immediately to an IDLE process', () => {
    const s = createSimulation({ n: 3, latencyMode: 'fixed', seed: 1 });
    handleRequest(s, { from: 2, to: 1, type: MT.REQUEST, ts: 4, deliverAt: 0, id: 99 });
    assert.equal(s.inFlight.length, 1);
    assert.equal(s.inFlight[0].type, MT.REPLY);
    assert.equal(s.inFlight[0].to, 2);
    assert.equal(getProcess(s, 1).clock, 6, 'receive: max(0,4)+1 = 5, then the REPLY send: +1 = 6');
  });
});
