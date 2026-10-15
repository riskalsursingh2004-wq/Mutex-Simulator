# Distributed Mutual Exclusion Simulator

MCA Distributed Computing mini project. Interactive simulation of the **Ricart–Agrawala**
distributed mutual exclusion algorithm (React + Vite, runs entirely in the browser).

## Run
```bash
npm install
npm run dev        # development server
npm test           # algorithm + reducer unit tests (node:test, no extra deps)
npm run build      # production build -> dist/
```

## Structure
- `src/algorithm/ricartAgrawala.js` – pure simulation engine: REQUEST/REPLY/RELEASE handling,
  deferred replies, Lamport clocks, (timestamp, id) priority, invariant check, scenario runner.
- `src/algorithm/scenarios.js` – scripted Demo and Faculty Demo steps (plain data).
- `src/algorithm/constants.js`, `rng.js` – constants and seeded PRNG.
- `src/state/simulatorReducer.js` – React reducer for UI state and localStorage preferences.
- `src/state/selectors.js` – derived view-model values (status, metrics, layout, button hints).
- `src/components/` – Dashboard widgets: network, nodes, critical section, controls (MANUAL/AUTOMATIC),
  Message Log (filters, search), Simulation Timeline, details, statistics charts, algorithm theory,
  sidebar, header, error boundary.
- `src/algorithm/__tests__/`, `src/state/__tests__/` – 74 tests (incl. the 10 acceptance tests in `requiredScenarios.test.js`).

## Modes
- **MANUAL** (default): Start only runs the clock. You pick a process and press Request / Release.
- **AUTOMATIC**: Start generates random requests from eligible processes (IDLE, past cooldown, pending < ⌊n/2⌋).
  Frequency Low/Medium/High; Auto Release ON releases the CS after a short random period (OFF: release it yourself).
- Both modes use the same engine. Step advances exactly one tick; one tick can deliver several messages.
- Demo scenarios: Single Process Request, Multiple Concurrent Requests, Deferred Reply Demonstration,
  High Contention, Random Simulation (switches to AUTOMATIC), plus Faculty Demo.

## Key rules implemented
- Request: `clock++`, timestamp stored, REQUEST sent to all N−1 peers.
- Receive REQUEST: `clock = max(clock, ts)+1`; defer if inside CS or if own request has priority
  `(ts, id)`; otherwise reply immediately.
- Enter CS only after N−1 REPLYs.
- Release: leave CS, broadcast RELEASE notices, then send all deferred REPLYs.
- Invariant `criticalSectionOwners.length ≤ 1` is checked after every event; a breach halts the
  simulation and logs `Mutual exclusion violation detected`.
