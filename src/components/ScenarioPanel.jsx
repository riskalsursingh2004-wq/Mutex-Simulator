import { Presentation, Play, Square, GraduationCap } from 'lucide-react';
import { SCENARIOS, DEMO_SCENARIO_IDS } from '../algorithm/scenarios.js';

/** Demo scenarios, Faculty Demo Mode toggle, and live scenario progress. */
export default function ScenarioPanel({ sim, prefs, scenarioId, dispatch }) {
  const faculty = prefs.facultyMode;
  const activeId = faculty ? 'faculty' : scenarioId;
  const scenario = SCENARIOS[activeId];
  const total = scenario.steps.length;
  const demo = sim.demo;
  const stepIndex = demo ? Math.min(demo.index, total - 1) : 0;
  const currentNote = demo ? scenario.steps[demo.index]?.note ?? 'Finishing scenario…' : null;
  const autoRunning = sim.running && !demo;

  const runDisabled = Boolean(sim.violation) || Boolean(demo) || autoRunning;
  const runReason = sim.violation
    ? 'Reset the simulator first.'
    : demo
      ? 'A scenario is already running.'
      : autoRunning
        ? 'Pause the simulation before running a scenario.'
        : null;

  return (
    <section className="card" aria-labelledby="scenario-title" id="scenario">
      <header className="card-header">
        <div>
          <h2 id="scenario-title">Demonstration &amp; Scenarios</h2>
          <p className="muted small">Scripted runs use fixed message latency, so they are repeatable.</p>
        </div>
      </header>

      <div className="button-row">
        <button type="button" className={`btn ${faculty ? 'btn-accent' : ''}`}
          aria-pressed={faculty} disabled={Boolean(demo)}
          onClick={() => dispatch({ type: 'TOGGLE_FACULTY' })}>
          <GraduationCap size={16} aria-hidden="true" />
          Faculty Demo Mode: {faculty ? 'ON' : 'OFF'}
        </button>
      </div>

      {!faculty && (
        <div className="scenario-list" role="group" aria-label="Demo scenarios">
          {DEMO_SCENARIO_IDS.map((id) => {
            const s = SCENARIOS[id];
            const active = id === scenarioId;
            return (
              <button key={id} type="button" className={`scenario-option ${active ? 'is-active' : ''}`}
                aria-pressed={active} disabled={Boolean(demo)}
                onClick={() => dispatch({ type: 'SELECT_SCENARIO', scenarioId: id })}>
                <strong>{s.title}</strong>
                <span className="muted small">{s.description}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={runDisabled}
          onClick={() => dispatch({ type: 'RUN_SCENARIO', scenarioId: activeId })}>
          <Presentation size={16} aria-hidden="true" />
          {faculty ? 'Run Faculty Demo' : `Run: ${scenario.title}`}
        </button>
        <button type="button" className="btn" disabled={!demo}
          onClick={() => dispatch({ type: 'STOP_SCENARIO' })}>
          <Square size={16} aria-hidden="true" /> Stop Scenario
        </button>
      </div>
      {runReason && <p className="hint">{runReason}</p>}

      <div className="scenario-box">
        <div className="scenario-title">
          <strong>{scenario.title}</strong>
          <span className="muted small">{scenario.description}</span>
        </div>

        {demo ? (
          <>
            <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={stepIndex + 1}>
              <span style={{ width: `${(demo.index / total) * 100}%` }} />
            </div>
            <p className="small"><strong>Step {Math.min(demo.index + 1, total)} of {total}</strong>{sim.running ? '' : ' · paused'}</p>
            <p className="scenario-note">{currentNote}</p>
            <p className="hint">Manual controls are locked while the scenario runs. Use Pause, Start or Stop.</p>
          </>
        ) : sim.lastScenario ? (
          <p className={`small ${sim.lastScenario.status === 'COMPLETE' ? 'ok' : 'bad'}`}>
            {sim.lastScenario.status === 'RUNNING'
              ? 'Random Simulation is running in AUTOMATIC mode.'
              : `Last run ${sim.lastScenario.status === 'COMPLETE' ? 'completed successfully' : `aborted: ${sim.lastScenario.reason}`}.`}
          </p>
        ) : (
          <p className="muted small">Press Run to play the scenario step by step.</p>
        )}
      </div>

      {faculty && (
        <div className="faculty-note">
          <Play size={14} aria-hidden="true" />
          <span>
            Faculty mode: 4 processes · Slow speed · fixed latency (2 ticks) · logical clocks are highlighted in every node.
          </span>
        </div>
      )}
    </section>
  );
}
