/**
 * The ten acceptance tests from the brief, plus error-handling checks.
 * They drive the same reducer the UI uses, so they cover the real user paths.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uiReducer } from '../simulatorReducer.js';
import { createSimulation, setWallClockProvider, tick, getProcess } from '../../algorithm/ricartAgrawala.js';
import { PROCESS_STATES as PS } from '../../algorithm/constants.js';

setWallClockProvider(() => '00:00:00');

const ui0 = (n = 5, mode = 'manual') => ({
  prefs: { processCount: n, speed: 'normal', facultyMode: false, logLimit: 100 },
  sim: createSimulation({ n, latencyMode: 'fixed', seed: 7, mode }),
  selectedId: 1,
  scenarioId: 'single',
  notice: null,
  noticeSeq: 0,
  savedBeforeFaculty: null,
});
const run = (ui, ...actions) => actions.reduce(uiReducer, ui);
const ticks = (ui, n) => Array.from({ length: n }).reduce((u) => ({ ...u, sim: tick(u.sim) }), ui);
const owners = (sim) => sim.csOwners.slice();
const stateOf = (sim, id) => getProcess(sim, id).state;

describe('Test 1 – P1 requests and enters', () => {
  test('a single request reaches the CS after all REPLYs', () => {
    let ui = run(ui0(), { type: 'REQUEST_CS', id: 1 });
    assert.equal(stateOf(ui.sim, 1), PS.REQUESTING);
    ui = ticks(ui, 10);
    assert.deepEqual(owners(ui.sim), [1]);
    assert.equal(stateOf(ui.sim, 1), PS.IN_CRITICAL_SECTION);
    assert.equal(ui.sim.violation, null);
  });
});

describe('Test 2 – P1 and P2 request simultaneously; exactly one is in the CS', () => {
  test('one owner at every tick', () => {
    let ui = run(ui0(), { type: 'REQUEST_CS', id: 1 }, { type: 'REQUEST_CS', id: 2 });
    let sawBoth = false;
    for (let i = 0; i < 60; i++) {
      ui = ticks(ui, 1);
      assert.ok(owners(ui.sim).length <= 1, 'never more than one owner');
      if (owners(ui.sim).length === 1) sawBoth = true;
    }
    assert.ok(sawBoth);
    assert.equal(ui.sim.violation, null);
  });
});

describe('Test 3 – P2 waits while P1 is in the CS', () => {
  test('P2 is WAITING (deferred) and enters only after P1 releases', () => {
    let ui = run(ui0(), { type: 'REQUEST_CS', id: 1 });
    ui = ticks(ui, 8);
    assert.deepEqual(owners(ui.sim), [1]);
    ui = run(ui, { type: 'REQUEST_CS', id: 2 });
    ui = ticks(ui, 8);
    assert.equal(stateOf(ui.sim, 2), PS.WAITING);
    assert.deepEqual(owners(ui.sim), [1]);
    ui = run(ui, { type: 'RELEASE_CS', id: 1 });
    ui = ticks(ui, 8);
    assert.deepEqual(owners(ui.sim), [2]);
    assert.equal(ui.sim.violation, null);
  });
});

describe('Test 4 – multiple requests are ordered by (timestamp, process ID)', () => {
  test('equal timestamps: the lower process ID enters first, the other follows', () => {
    // Both first requests carry timestamp 1 (each process's own clock), so the tie is broken by ID.
    let ui = run(ui0(), { type: 'REQUEST_CS', id: 3 }, { type: 'REQUEST_CS', id: 1 });
    assert.equal(getProcess(ui.sim, 3).reqTs, getProcess(ui.sim, 1).reqTs);
    const order = [];
    for (let i = 0; i < 200 && order.length < 2; i++) {
      ui = ticks(ui, 1);
      const cur = owners(ui.sim)[0];
      if (cur !== undefined && order[order.length - 1] !== cur) {
        order.push(cur);
        ui = run(ui, { type: 'RELEASE_CS', id: cur });
      }
    }
    assert.deepEqual(order, [1, 3]);
  });
});

describe('Test 5 – automatic run is safe', () => {
  test('auto mode for 2000 ticks: never more than one owner, no violation', () => {
    for (const n of [2, 4, 7, 10]) {
      let ui = run(ui0(n, 'auto'), { type: 'START' });
      let entries = 0;
      for (let i = 0; i < 2000; i++) {
        ui = ticks(ui, 1);
        assert.ok(owners(ui.sim).length <= 1);
        assert.equal(ui.sim.violation, null);
      }
      entries = ui.sim.processes.reduce((a, p) => a + p.entries, 0);
      assert.ok(entries > 0, `n=${n} served requests`);
    }
  });
});

describe('Test 6 – pause keeps state', () => {
  test('after PAUSE, ticks change nothing and the state object is preserved', () => {
    let ui = run(ui0(5, 'auto'), { type: 'START' });
    ui = ticks(ui, 25);
    ui = run(ui, { type: 'PAUSE' });
    const frozen = ui.sim;
    const after = uiReducer(ui, { type: 'TICK' });
    assert.equal(after.sim, frozen);
    assert.equal(ui.sim.running, false);
    assert.equal(ui.sim.paused, true);
    assert.ok(ui.sim.simTime > 0);
  });
});

describe('Test 7 – resume continues from the same state', () => {
  test('START after PAUSE continues the clock without resetting counters', () => {
    let ui = run(ui0(5, 'auto'), { type: 'START' });
    ui = ticks(ui, 25);
    ui = run(ui, { type: 'PAUSE' });
    const t = ui.sim.simTime;
    const sent = ui.sim.totals.sent;
    ui = run(ui, { type: 'START' });
    ui = ticks(ui, 5);
    assert.equal(ui.sim.simTime, t + 5);
    assert.ok(ui.sim.totals.sent >= sent);
    assert.equal(ui.sim.running, true);
  });
});

describe('Test 8 – reset clears everything', () => {
  test('RESET clears processes, logs, counters, owners, in-flight messages and timers state', () => {
    let ui = run(ui0(5, 'auto'), { type: 'START' });
    ui = ticks(ui, 60);
    ui = run(ui, { type: 'RESET' });
    assert.equal(ui.sim.simTime, 0);
    assert.equal(ui.sim.running, false);
    assert.equal(ui.sim.draining, false);
    assert.equal(ui.sim.inFlight.length, 0);
    assert.equal(ui.sim.log.length, 0);
    assert.equal(ui.sim.messageLog.length, 0);
    assert.equal(ui.sim.totals.sent, 0);
    assert.deepEqual(owners(ui.sim), []);
    assert.ok(ui.sim.processes.every((p) => p.state === PS.IDLE && p.entries === 0));
  });
});

describe('Test 9 – manual → automatic: no duplicate activity', () => {
  test('switching mode keeps one clock; automatic requests start only after the switch', () => {
    let ui = run(ui0(5, 'manual'), { type: 'START' });
    ui = ticks(ui, 20);
    assert.equal(ui.sim.totals.sent, 0, 'manual mode generates no automatic requests');
    ui = run(ui, { type: 'SET_MODE', mode: 'auto' });
    assert.equal(ui.sim.mode, 'auto');
    assert.equal(ui.sim.running, true, 'the clock keeps its state across the switch');
    ui = ticks(ui, 40);
    assert.ok(ui.sim.totals.sent > 0, 'automatic requests now happen');
    assert.ok(ui.sim.violation === null);
  });
});

describe('Test 10 – automatic → manual: consistent state', () => {
  test('owner and process states stay consistent after switching back to manual', () => {
    let ui = run(ui0(5, 'auto'), { type: 'START' });
    ui = ticks(ui, 30);
    ui = run(ui, { type: 'PAUSE' }, { type: 'SET_MODE', mode: 'manual' });
    assert.equal(ui.sim.mode, 'manual');
    assert.ok(ui.sim.processes.every((p) => p.csRemaining === null), 'auto release countdown cleared');
    const inCs = ui.sim.processes.filter((p) => p.state === PS.IN_CRITICAL_SECTION).map((p) => p.id);
    assert.deepEqual(inCs, owners(ui.sim), 'process states match the CS owner list');
    if (owners(ui.sim).length) {
      ui = run(ui, { type: 'RELEASE_CS' });
      assert.deepEqual(owners(ui.sim), []);
    }
    ui = run(ui, { type: 'REQUEST_CS', id: 1 });
    assert.equal(ui.notice?.tone ?? 'info', 'info');
    assert.equal(ui.sim.violation, null);
  });
});

describe('Error handling', () => {
  test('invalid process selection is rejected and the selection is unchanged', () => {
    const ui = run(ui0(5), { type: 'SELECT_PROCESS', id: 9 });
    assert.equal(ui.selectedId, 1);
    assert.match(ui.notice.text, /no process/);
    assert.equal(uiReducer(ui0(5), { type: 'REQUEST_CS', id: 0 }).sim.totals.sent, 0);
  });

  test('duplicate request is rejected without changing state', () => {
    let ui = run(ui0(5), { type: 'REQUEST_CS', id: 2 });
    const before = ui.sim;
    ui = uiReducer(ui, { type: 'REQUEST_CS', id: 2 });
    assert.equal(ui.sim, before);
    assert.match(ui.notice.text, /Duplicate|outstanding/);
  });

  test('requesting while inside the CS is rejected', () => {
    let ui = ticks(run(ui0(5), { type: 'REQUEST_CS', id: 1 }), 10);
    ui = uiReducer(ui, { type: 'REQUEST_CS', id: 1 });
    assert.match(ui.notice.text, /already inside/);
  });

  test('release with an empty queue is rejected', () => {
    const ui = uiReducer(ui0(5), { type: 'RELEASE_CS' });
    assert.match(ui.notice.text, /nothing to release/);
  });

  test('manual request is rejected in automatic mode', () => {
    const ui = uiReducer(ui0(5, 'auto'), { type: 'REQUEST_CS', id: 1 });
    assert.match(ui.notice.text, /Automatic mode/);
  });

  test('mode switch mid-run is applied without error and keeps running', () => {
    let ui = run(ui0(5, 'manual'), { type: 'START' }, ...Array(5).fill({ type: 'TICK' }));
    ui = uiReducer(ui, { type: 'SET_MODE', mode: 'auto' });
    assert.equal(ui.notice.tone, 'info');
    assert.equal(ui.sim.running, true);
  });

  test('a scenario blocks mode changes until it is stopped', () => {
    let ui = run(ui0(5), { type: 'RUN_SCENARIO', scenarioId: 'deferred' });
    ui = uiReducer(ui, { type: 'SET_MODE', mode: 'auto' });
    assert.equal(ui.sim.mode, 'manual');
    assert.match(ui.notice.text, /Stop the scenario/);
  });

  test('a tick that throws is caught, the clock halts and an error is shown', () => {
    const ui = ui0(5);
    const broken = { ...ui, sim: { ...ui.sim, processes: null, running: true } };
    const next = uiReducer(broken, { type: 'TICK' });
    assert.equal(next.sim.running, false);
    assert.equal(next.notice.tone, 'error');
  });

  test('user-visible log is bounded', () => {
    let ui = run(ui0(5, 'auto'), { type: 'START' });
    ui = ticks(ui, 1500);
    assert.ok(ui.sim.log.length <= 300);
    assert.ok(ui.sim.messageLog.length <= 300);
  });
});
