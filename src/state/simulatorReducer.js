/**
 * UI-level state: wraps the pure algorithm engine in a React reducer and keeps
 * user preferences (process count, speed, faculty mode, log limit) in localStorage.
 * Transient simulation data (messages, logs, clocks, mode, request rate) is NOT persisted.
 */
import {
  createSimulation,
  tick,
  startSimulation,
  pauseSimulation,
  stepSimulation,
  requestCriticalSection,
  releaseCriticalSection,
  startScenario,
  stopScenario,
  setMode,
  setAutoRate,
  setAutoRelease,
  clearLog,
} from '../algorithm/ricartAgrawala.js';
import {
  DEFAULT_PROCESSES,
  DEFAULT_SPEED,
  FACULTY_PROCESSES,
  MIN_PROCESSES,
  MAX_PROCESSES,
  SPEEDS,
  SIM_MODES,
  AUTO_RATES,
  DEFAULT_AUTO_RATE,
} from '../algorithm/constants.js';
import { SCENARIOS, DEMO_SCENARIO_IDS } from '../algorithm/scenarios.js';

const PREFS_KEY = 'mutex-simulator:prefs:v1';
const LOG_LIMITS = [50, 100, 200, 300];
const DEMO_SEED = 1;
const DEFAULT_SCENARIO = 'single';

const DEFAULT_PREFS = {
  processCount: DEFAULT_PROCESSES,
  speed: DEFAULT_SPEED,
  facultyMode: false,
  logLimit: 100,
};

export function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      processCount: clampCount(parsed.processCount),
      speed: SPEEDS[parsed.speed] ? parsed.speed : DEFAULT_SPEED,
      facultyMode: Boolean(parsed.facultyMode),
      logLimit: LOG_LIMITS.includes(parsed.logLimit) ? parsed.logLimit : DEFAULT_PREFS.logLimit,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage may be unavailable (private mode); preferences are optional */
  }
}

function clampCount(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n)) return DEFAULT_PREFS.processCount;
  return Math.min(MAX_PROCESSES, Math.max(MIN_PROCESSES, n));
}

/** Engine settings that survive a reset (they are configuration, not progress). */
const simConfig = (sim) => ({ mode: sim.mode, autoRate: sim.autoRate, autoRelease: sim.autoRelease });

/**
 * Builds a fresh simulation. Demo and faculty runs use fixed message latency so they
 * are repeatable; normal runs use random latency.
 */
function freshSim(processCount, fixedLatency, seed, config = {}) {
  return createSimulation({
    n: processCount,
    latencyMode: fixedLatency ? 'fixed' : 'random',
    seed,
    mode: config.mode ?? SIM_MODES.MANUAL,
    autoRate: config.autoRate ?? DEFAULT_AUTO_RATE,
    autoRelease: config.autoRelease ?? true,
  });
}

export function createInitialUi() {
  const prefs = loadPrefs();
  return {
    prefs,
    sim: freshSim(prefs.processCount, prefs.facultyMode),
    selectedId: 1,
    scenarioId: DEFAULT_SCENARIO,
    notice: null,
    noticeSeq: 0,
    savedBeforeFaculty: null,
  };
}

function withNotice(ui, tone, text) {
  const noticeSeq = ui.noticeSeq + 1;
  return { ...ui, noticeSeq, notice: { id: noticeSeq, tone, text } };
}

/** Applies an engine result: on error show a notice, otherwise accept the new state. */
function applyResult(ui, result, successText) {
  if (result.error) return withNotice(ui, 'error', result.error);
  const next = { ...ui, sim: result.state };
  return successText ? withNotice(next, 'info', successText) : next;
}

const isValidProcessId = (sim, id) => Number.isInteger(id) && id >= 1 && id <= sim.n;

export function uiReducer(ui, action) {
  switch (action.type) {
    case 'TICK': {
      // A simulation event must never crash the UI: on an unexpected error, halt the clock
      // (keeping the state for inspection) and report it.
      try {
        return { ...ui, sim: tick(ui.sim) };
      } catch (err) {
        const halted = { ...ui.sim, running: false, paused: true, draining: false };
        return withNotice({ ...ui, sim: halted }, 'error', `Simulation event failed and the clock was paused: ${err.message}`);
      }
    }

    case 'START':
      return applyResult(ui, startSimulation(ui.sim));

    case 'PAUSE':
      return applyResult(ui, pauseSimulation(ui.sim));

    case 'STEP':
      return applyResult(ui, stepSimulation(ui.sim));

    case 'RESET': {
      const sim = freshSim(ui.prefs.processCount, ui.prefs.facultyMode, undefined, simConfig(ui.sim));
      return withNotice({ ...ui, sim }, 'info', 'Simulator reset. All processes are IDLE and the counters are cleared.');
    }

    case 'SET_PROCESS_COUNT': {
      if (ui.prefs.facultyMode) {
        return withNotice(ui, 'error', 'Faculty Demo Mode fixes the process count at 4. Turn it off to change this.');
      }
      const count = Number.parseInt(action.count, 10);
      if (!Number.isInteger(count) || count < MIN_PROCESSES || count > MAX_PROCESSES) {
        return withNotice(ui, 'error', `Process count must be a whole number from ${MIN_PROCESSES} to ${MAX_PROCESSES}.`);
      }
      const prefs = { ...ui.prefs, processCount: count };
      return withNotice(
        { ...ui, prefs, sim: freshSim(count, false, undefined, simConfig(ui.sim)), selectedId: Math.min(ui.selectedId, count) },
        'info',
        `Configured ${count} processes. The simulator was reset to apply the change.`,
      );
    }

    case 'SET_SPEED': {
      if (ui.prefs.facultyMode) {
        return withNotice(ui, 'error', 'Faculty Demo Mode uses Slow speed. Turn it off to change speed.');
      }
      if (!SPEEDS[action.speed]) return ui;
      return { ...ui, prefs: { ...ui.prefs, speed: action.speed } };
    }

    case 'SET_LOG_LIMIT':
      return LOG_LIMITS.includes(action.limit) ? { ...ui, prefs: { ...ui.prefs, logLimit: action.limit } } : ui;

    case 'SELECT_PROCESS': {
      // Invalid selections are ignored, so the details panel always shows a real process.
      if (!isValidProcessId(ui.sim, action.id)) {
        return withNotice(ui, 'error', `There is no process with id ${action.id}.`);
      }
      return { ...ui, selectedId: action.id };
    }

    case 'SET_MODE':
      return applyResult(
        ui,
        setMode(ui.sim, action.mode),
        action.mode === SIM_MODES.AUTO
          ? 'Automatic mode: random eligible processes request the CS. Manual request controls are disabled.'
          : 'Manual mode: you choose which process requests and when to release.',
      );

    case 'SET_AUTO_RATE':
      if (!AUTO_RATES[action.rate]) return ui;
      return applyResult(ui, setAutoRate(ui.sim, action.rate));

    case 'SET_AUTO_RELEASE':
      return applyResult(ui, setAutoRelease(ui.sim, action.enabled));

    case 'SELECT_SCENARIO':
      if (!DEMO_SCENARIO_IDS.includes(action.scenarioId)) return ui;
      return { ...ui, scenarioId: action.scenarioId };

    case 'REQUEST_CS': {
      if (!isValidProcessId(ui.sim, action.id)) return withNotice(ui, 'error', `There is no process with id ${action.id}.`);
      return applyResult(ui, requestCriticalSection(ui.sim, action.id));
    }

    case 'RELEASE_CS':
      return applyResult(ui, releaseCriticalSection(ui.sim, action.id ?? null));

    case 'CLEAR_LOG':
      return { ...ui, sim: clearLog(ui.sim) };

    case 'RUN_SCENARIO': {
      const scenarioId = ui.prefs.facultyMode ? 'faculty' : (action.scenarioId ?? ui.scenarioId ?? DEFAULT_SCENARIO);
      const scenario = SCENARIOS[scenarioId];
      if (!scenario) return withNotice(ui, 'error', 'Unknown scenario.');
      if (ui.sim.violation) return withNotice(ui, 'error', 'Reset the simulator first.');
      if (ui.sim.demo) return withNotice(ui, 'error', 'A scenario is already running.');

      if (scenario.kind === 'auto') {
        // Random Simulation keeps the current network and switches it to AUTOMATIC mode.
        if (ui.sim.running && ui.sim.mode === SIM_MODES.AUTO) {
          return withNotice(ui, 'error', 'Automatic simulation is already running.');
        }
        return applyResult(ui, startScenario(ui.sim, scenarioId), 'Random Simulation started in AUTOMATIC mode.');
      }

      if (ui.sim.running) return withNotice(ui, 'error', 'Pause the simulation before running a scenario.');
      // Scripted scenarios start from a clean network in MANUAL mode so the walkthrough is repeatable.
      const sim = freshSim(scenario.requiredProcesses, true, DEMO_SEED, { mode: SIM_MODES.MANUAL, autoRate: ui.sim.autoRate, autoRelease: ui.sim.autoRelease });
      const started = startScenario(sim, scenarioId);
      if (started.error) return withNotice(ui, 'error', started.error);
      return { ...ui, sim: started.state, selectedId: 2, scenarioId };
    }

    case 'STOP_SCENARIO':
      return applyResult(ui, stopScenario(ui.sim), 'Scenario stopped.');

    case 'TOGGLE_FACULTY': {
      if (ui.sim.demo) return withNotice(ui, 'error', 'Stop the running scenario before changing Faculty Demo Mode.');
      if (!ui.prefs.facultyMode) {
        const prefs = {
          ...ui.prefs,
          facultyMode: true,
          processCount: FACULTY_PROCESSES,
          speed: 'slow',
        };
        return withNotice(
          {
            ...ui,
            prefs,
            savedBeforeFaculty: { processCount: ui.prefs.processCount, speed: ui.prefs.speed },
            sim: freshSim(FACULTY_PROCESSES, true, undefined, { mode: SIM_MODES.MANUAL }),
            selectedId: 1,
          },
          'info',
          'Faculty Demo Mode on: 4 processes, Slow speed, deterministic message timing. Press Run Faculty Demo.',
        );
      }
      const saved = ui.savedBeforeFaculty ?? { processCount: DEFAULT_PROCESSES, speed: DEFAULT_SPEED };
      const prefs = { ...ui.prefs, facultyMode: false, processCount: saved.processCount, speed: saved.speed };
      return withNotice(
        { ...ui, prefs, savedBeforeFaculty: null, sim: freshSim(prefs.processCount, false, undefined, simConfig(ui.sim)) },
        'info',
        'Faculty Demo Mode off. Previous settings restored.',
      );
    }

    case 'DISMISS_NOTICE':
      return ui.notice && ui.notice.id === action.id ? { ...ui, notice: null } : ui;

    default:
      return ui;
  }
}

export const LOG_LIMIT_OPTIONS = LOG_LIMITS;
