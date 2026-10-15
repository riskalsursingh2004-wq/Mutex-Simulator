import { useEffect, useMemo, useReducer } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import { NoticeToast, ViolationBanner } from './components/Notice.jsx';
import ProjectInfo from './components/ProjectInfo.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';
import ProcessNetwork from './components/ProcessNetwork.jsx';
import SimulationControls from './components/SimulationControls.jsx';
import ScenarioPanel from './components/ScenarioPanel.jsx';
import ProcessDetails from './components/ProcessDetails.jsx';
import EventLog from './components/EventLog.jsx';
import MessageLog from './components/MessageLog.jsx';
import AlgorithmExplanation from './components/AlgorithmExplanation.jsx';
import AlgorithmTheory from './components/AlgorithmTheory.jsx';
import StatisticsPanel from './components/StatisticsPanel.jsx';
import { uiReducer, createInitialUi, savePrefs, LOG_LIMIT_OPTIONS } from './state/simulatorReducer.js';
import { selectStatus, selectMetrics } from './state/selectors.js';
import { SPEEDS } from './algorithm/constants.js';

export default function App() {
  const [ui, dispatch] = useReducer(uiReducer, undefined, createInitialUi);
  const { sim, prefs, selectedId, notice, scenarioId } = ui;
  const tickMs = SPEEDS[prefs.speed].tickMs;

  // The only simulation timer in the app. It exists only while the engine has work to do
  // (clock running, or manual messages still in flight). Changing the mode or the speed
  // never creates a second timer: the effect is keyed on (active, tickMs). It is cleared on
  // pause, on completion, on violation, on reset and on unmount.
  const timerActive = !sim.violation && (sim.running || sim.draining);
  useEffect(() => {
    if (!timerActive) return undefined;
    const id = window.setInterval(() => dispatch({ type: 'TICK' }), tickMs);
    return () => window.clearInterval(id);
  }, [timerActive, tickMs]);

  // Persist user preferences only (never transient simulation state).
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Auto-dismiss toasts; the timeout is cleared when the notice changes or unmounts.
  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(() => dispatch({ type: 'DISMISS_NOTICE', id: notice.id }), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const status = useMemo(() => selectStatus(sim), [sim]);
  const metrics = useMemo(() => selectMetrics(sim), [sim]);
  const selectedProcess = sim.processes[selectedId - 1];

  return (
    <div className="app-shell">
      <Sidebar status={status} />

      <main className="main">
        <Header status={status} metrics={metrics} />
        <NoticeToast notice={notice} onDismiss={() => dispatch({ type: 'DISMISS_NOTICE', id: notice?.id })} />
        <ViolationBanner violation={sim.violation} />

        <section id="overview" className="section">
          <ProjectInfo />
        </section>

        <MetricsPanel metrics={metrics} violation={sim.violation} />

        <section id="simulation" className="section two-col">
          <ProcessNetwork
            sim={sim}
            selectedId={selectedId}
            tickMs={tickMs}
            onSelect={(id) => dispatch({ type: 'SELECT_PROCESS', id })}
          />
          <div className="stack">
            <SimulationControls sim={sim} prefs={prefs} selectedId={selectedId} dispatch={dispatch} />
            <ScenarioPanel sim={sim} prefs={prefs} scenarioId={scenarioId} dispatch={dispatch} />
          </div>
        </section>

        <section className="section two-col">
          <div className="stack">
            <ProcessDetails sim={sim} selectedId={selectedId} />
          </div>
          <div className="stack">
            <MessageLog sim={sim} onClear={() => dispatch({ type: 'CLEAR_LOG' })} />
          </div>
        </section>

        <section className="section">
          <EventLog
            sim={sim}
            limit={prefs.logLimit}
            limitOptions={LOG_LIMIT_OPTIONS}
            onLimitChange={(limit) => dispatch({ type: 'SET_LOG_LIMIT', limit })}
            onClear={() => dispatch({ type: 'CLEAR_LOG' })}
          />
        </section>

        <section className="section">
          <AlgorithmExplanation selectedState={selectedProcess?.state} />
          <AlgorithmTheory />
        </section>

        <section className="section">
          <StatisticsPanel sim={sim} metrics={metrics} />
        </section>

        <footer className="app-footer">
          Distributed Mutual Exclusion Simulator · Ricart–Agrawala · all state is simulated in the browser; nothing is sent to a server.
        </footer>
      </main>
    </div>
  );
}
