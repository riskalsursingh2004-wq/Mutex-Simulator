import { Play, Pause, SkipForward, RotateCcw, Send, Unlock, Bot, Hand } from 'lucide-react';
import { SPEEDS, MIN_PROCESSES, MAX_PROCESSES, AUTO_RATES, SIM_MODES } from '../algorithm/constants.js';
import { STATE_META, requestBlockReason, releaseBlockReason } from '../state/selectors.js';

/**
 * Mode switch (MANUAL | AUTOMATIC), Start / Pause / Step / Reset, speed, process count,
 * automatic-mode settings, and the manual demonstration controls.
 */
export default function SimulationControls({ sim, prefs, selectedId, dispatch }) {
  const halted = Boolean(sim.violation);
  const running = sim.running;
  const locked = prefs.facultyMode;
  const auto = sim.mode === SIM_MODES.AUTO;
  const inScenario = Boolean(sim.demo);

  const startDisabled = halted || running;
  const pauseDisabled = !(running || sim.draining);
  const stepDisabled = halted || running;

  const reqReason = requestBlockReason(sim, selectedId);
  const relReason = releaseBlockReason(sim);
  const selectedProc = sim.processes[selectedId - 1];

  const counts = Array.from({ length: MAX_PROCESSES - MIN_PROCESSES + 1 }, (_, i) => MIN_PROCESSES + i);

  return (
    <section className="card" aria-labelledby="controls-title">
      <header className="card-header">
        <div>
          <h2 id="controls-title">Simulation Controls</h2>
          <p className="muted small">
            {auto
              ? 'Automatic: Start generates random requests from eligible processes.'
              : 'Manual: Start only runs the clock. You choose which process requests the CS.'}
          </p>
        </div>
      </header>

      <div className="field">
        <span className="field-label" id="mode-label">Mode</span>
        <div className="segmented mode-switch" role="group" aria-labelledby="mode-label">
          <button type="button" aria-pressed={!auto} className={!auto ? 'is-active' : ''}
            disabled={inScenario || halted} onClick={() => dispatch({ type: 'SET_MODE', mode: SIM_MODES.MANUAL })}>
            <Hand size={14} aria-hidden="true" /> MANUAL
          </button>
          <button type="button" aria-pressed={auto} className={auto ? 'is-active' : ''}
            disabled={inScenario || halted} onClick={() => dispatch({ type: 'SET_MODE', mode: SIM_MODES.AUTO })}>
            <Bot size={14} aria-hidden="true" /> AUTOMATIC
          </button>
        </div>
        {inScenario && <p className="hint">Mode is locked while a scenario runs.</p>}
      </div>

      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={startDisabled}
          onClick={() => dispatch({ type: 'START' })} title={running ? 'Already running' : 'Start the clock'}>
          <Play size={16} aria-hidden="true" /> Start
        </button>
        <button type="button" className="btn" disabled={pauseDisabled}
          onClick={() => dispatch({ type: 'PAUSE' })} title="Freeze all events; state is kept">
          <Pause size={16} aria-hidden="true" /> Pause
        </button>
        <button type="button" className="btn" disabled={stepDisabled}
          onClick={() => dispatch({ type: 'STEP' })} title="Advance the network by exactly one tick">
          <SkipForward size={16} aria-hidden="true" /> Step
        </button>
        <button type="button" className="btn btn-danger-outline"
          onClick={() => dispatch({ type: 'RESET' })} title="Clear all processes, messages, logs and timers">
          <RotateCcw size={16} aria-hidden="true" /> Reset
        </button>
      </div>
      <p className="hint">Step advances exactly one tick. One tick can deliver several messages at once.</p>
      {sim.paused && !running && sim.inFlight.length > 0 && (
        <p className="hint">Paused with {sim.inFlight.length} message{sim.inFlight.length === 1 ? '' : 's'} in flight. Press Start to resume delivery, or Step to advance one tick.</p>
      )}

      {auto && (
        <div className="auto-box">
          <h3>Automatic Settings</h3>
          <div className="control-grid">
            <div className="field">
              <span className="field-label" id="rate-label">Request Frequency</span>
              <div className="segmented" role="group" aria-labelledby="rate-label">
                {Object.entries(AUTO_RATES).map(([key, rate]) => (
                  <button key={key} type="button" aria-pressed={sim.autoRate === key}
                    className={sim.autoRate === key ? 'is-active' : ''}
                    disabled={inScenario}
                    onClick={() => dispatch({ type: 'SET_AUTO_RATE', rate: key })}>
                    {rate.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label" id="release-label">Auto Release</span>
              <div className="segmented" role="group" aria-labelledby="release-label">
                <button type="button" aria-pressed={sim.autoRelease} className={sim.autoRelease ? 'is-active' : ''}
                  disabled={inScenario} onClick={() => dispatch({ type: 'SET_AUTO_RELEASE', enabled: true })}>ON</button>
                <button type="button" aria-pressed={!sim.autoRelease} className={!sim.autoRelease ? 'is-active' : ''}
                  disabled={inScenario} onClick={() => dispatch({ type: 'SET_AUTO_RELEASE', enabled: false })}>OFF</button>
              </div>
              <span className="hint">
                {sim.autoRelease ? 'The owner leaves the CS after a short random period.' : 'Release the CS yourself with the button below.'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="control-grid">
        <div className="field">
          <span className="field-label" id="speed-label">Simulation Speed</span>
          <div className="segmented" role="group" aria-labelledby="speed-label">
            {Object.entries(SPEEDS).map(([key, speed]) => (
              <button key={key} type="button" aria-pressed={prefs.speed === key}
                className={prefs.speed === key ? 'is-active' : ''}
                disabled={locked}
                onClick={() => dispatch({ type: 'SET_SPEED', speed: key })}>
                {speed.label}
              </button>
            ))}
          </div>
          {locked && <p className="hint">Locked to Slow by Faculty Demo Mode.</p>}
        </div>

        <label className="field">
          <span className="field-label">Number of Processes</span>
          <select value={sim.n} disabled={locked}
            onChange={(e) => dispatch({ type: 'SET_PROCESS_COUNT', count: e.target.value })}>
            {counts.map((c) => <option key={c} value={c}>{c} processes</option>)}
          </select>
          <span className="hint">Changing this resets the simulator ({MIN_PROCESSES}–{MAX_PROCESSES}).</span>
        </label>
      </div>

      <div className={`manual-box ${auto ? 'is-disabled' : ''}`}>
        <h3>Manual Demonstration</h3>
        {auto && <p className="hint">Disabled in AUTOMATIC mode. Switch to MANUAL to request the CS yourself.</p>}
        <div className="manual-row">
          <label className="field grow">
            <span className="field-label">Select Process</span>
            <select value={selectedId} disabled={inScenario}
              onChange={(e) => dispatch({ type: 'SELECT_PROCESS', id: Number(e.target.value) })}>
              {sim.processes.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {STATE_META[p.state].label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-accent" disabled={Boolean(reqReason) || auto}
            onClick={() => dispatch({ type: 'REQUEST_CS', id: selectedId })}>
            <Send size={16} aria-hidden="true" /> Request Critical Section
          </button>
          <button type="button" className="btn" disabled={Boolean(relReason)}
            onClick={() => dispatch({ type: 'RELEASE_CS' })}>
            <Unlock size={16} aria-hidden="true" /> Release Critical Section
          </button>
        </div>
        {!auto && reqReason && <p className="hint">Request: {reqReason}</p>}
        {relReason && <p className="hint">Release: {relReason}</p>}
        {!auto && !reqReason && selectedProc && (
          <p className="hint ok">{selectedProc.name} can request now. Messages will animate across the network.</p>
        )}
      </div>
    </section>
  );
}
