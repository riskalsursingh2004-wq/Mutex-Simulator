import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { uiReducer, LOG_LIMIT_OPTIONS } from '../simulatorReducer.js';
import { setWallClockProvider, createSimulation } from '../../algorithm/ricartAgrawala.js';

setWallClockProvider(() => '00:00:00');

// Minimal in-memory UI state (no window / localStorage needed in Node).
function initialUi() {
  return {
    prefs: { processCount: 5, speed: 'normal', facultyMode: false, logLimit: 100 },
    sim: createSimulation({ n: 5, latencyMode: 'random', seed: 42 }),
    selectedId: 1,
    scenarioId: 'single',
    notice: null,
    noticeSeq: 0,
    savedBeforeFaculty: null,
  };
}
const run = (ui, ...actions) => actions.reduce(uiReducer, ui);

describe('Start / Pause / Step', () => {
  test('Start runs the clock in manual mode (no automatic requests) and ticks advance time', () => {
    let ui = run(initialUi(), { type: 'START' });
    assert.equal(ui.sim.running, true);
    const t0 = ui.sim.simTime;
    ui = uiReducer(ui, { type: 'TICK' });
    assert.equal(ui.sim.simTime, t0 + 1);
  });

  test('Start while running is a no-op (no error notice)', () => {
    const ui = run(initialUi(), { type: 'START' });
    const again = uiReducer(ui, { type: 'START' });
    assert.equal(again.sim, ui.sim);
    assert.equal(again.notice, null);
  });

  test('Pause freezes: TICK after pause returns the same state object', () => {
    let ui = run(initialUi(), { type: 'START' }, { type: 'TICK' }, { type: 'PAUSE' });
    const frozen = ui.sim;
    const after = uiReducer(ui, { type: 'TICK' });
    assert.equal(after.sim, frozen);
  });

  test('Step is rejected while running, accepted when paused', () => {
    const running = run(initialUi(), { type: 'START' });
    const rejected = uiReducer(running, { type: 'STEP' });
    assert.match(rejected.notice.text, /Pause the simulation/);
    const paused = uiReducer(running, { type: 'PAUSE' });
    const stepped = uiReducer(paused, { type: 'STEP' });
    assert.equal(stepped.sim.simTime, paused.sim.simTime + 1);
  });
});

describe('Manual request & release', () => {
  test('requesting a process that is not idle shows an error and changes nothing', () => {
    let ui = run(initialUi(), { type: 'REQUEST_CS', id: 2 });
    const reqSim = ui.sim;
    ui = uiReducer(ui, { type: 'REQUEST_CS', id: 2 });
    assert.equal(ui.sim, reqSim);
    assert.match(ui.notice.text, /outstanding request/);
  });

  test('release with no owner shows an error', () => {
    const ui = uiReducer(initialUi(), { type: 'RELEASE_CS' });
    assert.match(ui.notice.text, /nothing to release/);
  });
});

describe('Process count & reset', () => {
  test('rejects counts outside 2..10', () => {
    const ui = uiReducer(initialUi(), { type: 'SET_PROCESS_COUNT', count: 11 });
    assert.match(ui.notice.text, /from 2 to 10/);
    assert.equal(ui.sim.n, 5);
  });

  test('valid count rebuilds the simulation', () => {
    const ui = uiReducer(initialUi(), { type: 'SET_PROCESS_COUNT', count: '8' });
    assert.equal(ui.sim.n, 8);
    assert.equal(ui.prefs.processCount, 8);
  });

  test('reset during a running simulation clears everything', () => {
    let ui = run(initialUi(), { type: 'START' }, ...Array(30).fill({ type: 'TICK' }));
    assert.ok(ui.sim.simTime > 0);
    ui = uiReducer(ui, { type: 'RESET' });
    assert.equal(ui.sim.simTime, 0);
    assert.equal(ui.sim.running, false);
    assert.equal(ui.sim.log.length, 0);
    assert.equal(ui.sim.totals.sent, 0);
    assert.deepEqual(ui.sim.csOwners, []);
  });
});

describe('Faculty Demo Mode', () => {
  test('turning it on fixes 4 processes, Slow speed, deterministic latency', () => {
    const ui = uiReducer(initialUi(), { type: 'TOGGLE_FACULTY' });
    assert.equal(ui.prefs.facultyMode, true);
    assert.equal(ui.sim.n, 4);
    assert.equal(ui.sim.latencyMode, 'fixed');
    assert.equal(ui.prefs.speed, 'slow');
    const locked = uiReducer(ui, { type: 'SET_SPEED', speed: 'fast' });
    assert.equal(locked.prefs.speed, 'slow');
    assert.match(locked.notice.text, /Slow speed/);
  });

  test('turning it off restores previous settings', () => {
    let ui = run(initialUi(), { type: 'SET_SPEED', speed: 'fast' }, { type: 'TOGGLE_FACULTY' }, { type: 'TOGGLE_FACULTY' });
    assert.equal(ui.prefs.facultyMode, false);
    assert.equal(ui.prefs.speed, 'fast');
    assert.equal(ui.sim.n, 5);
  });
});

describe('Scenario buttons', () => {
  test('Run Demo Scenario starts a 4-process scripted run and locks manual actions', () => {
    let ui = uiReducer(initialUi(), { type: 'RUN_SCENARIO' });
    assert.ok(ui.sim.demo, 'scenario active');
    assert.equal(ui.sim.n, 4);
    assert.equal(ui.sim.running, true);
    const req = uiReducer(ui, { type: 'REQUEST_CS', id: 3 });
    assert.match(req.notice.text, /scenario is running/i);
  });

  test('Run again while a scenario is active is rejected', () => {
    const ui = run(initialUi(), { type: 'RUN_SCENARIO' });
    const again = uiReducer(ui, { type: 'RUN_SCENARIO' });
    assert.equal(again.sim, ui.sim);
  });

  test('Stop Scenario aborts and leaves the simulator paused', () => {
    let ui = run(initialUi(), { type: 'RUN_SCENARIO' }, ...Array(3).fill({ type: 'TICK' }));
    ui = uiReducer(ui, { type: 'STOP_SCENARIO' });
    assert.equal(ui.sim.demo, null);
    assert.equal(ui.sim.running, false);
    assert.equal(ui.sim.lastScenario.status, 'ABORTED');
  });

  test('Faculty mode runs the longer faculty script', () => {
    const ui = run(initialUi(), { type: 'TOGGLE_FACULTY' }, { type: 'RUN_SCENARIO' });
    assert.equal(ui.sim.demo.scenarioId, 'faculty');
  });
});

describe('Log controls', () => {
  test('clear log empties the log; limits are restricted to presets', () => {
    let ui = run(initialUi(), { type: 'REQUEST_CS', id: 1 });
    assert.ok(ui.sim.log.length > 0);
    ui = uiReducer(ui, { type: 'CLEAR_LOG' });
    assert.equal(ui.sim.log.length, 0);
    assert.equal(uiReducer(ui, { type: 'SET_LOG_LIMIT', limit: 9999 }).prefs.logLimit, 100);
    assert.ok(LOG_LIMIT_OPTIONS.includes(200));
  });
});

describe('Notices', () => {
  test('dismiss only clears the matching notice id', () => {
    const ui = uiReducer(initialUi(), { type: 'RELEASE_CS' });
    assert.equal(uiReducer(ui, { type: 'DISMISS_NOTICE', id: ui.notice.id + 99 }).notice.id, ui.notice.id);
    assert.equal(uiReducer(ui, { type: 'DISMISS_NOTICE', id: ui.notice.id }).notice, null);
  });
});
