/**
 * Shared constants for the Ricart–Agrawala simulator.
 * Pure data only – no React imports – so the algorithm can be tested in Node.
 */

export const PROCESS_STATES = {
  IDLE: 'IDLE',
  REQUESTING: 'REQUESTING',
  WAITING: 'WAITING',
  IN_CRITICAL_SECTION: 'IN_CRITICAL_SECTION',
  RELEASING: 'RELEASING',
};

export const MESSAGE_TYPES = {
  REQUEST: 'REQUEST',
  REPLY: 'REPLY',
  RELEASE: 'RELEASE',
};

export const MESSAGE_STATUS = {
  IN_FLIGHT: 'IN_FLIGHT',
  DELIVERED: 'DELIVERED',
};

export const SIM_MODES = {
  MANUAL: 'manual',
  AUTO: 'auto',
};

export const LOG_KINDS = {
  SYSTEM: 'system',
  REQUEST: 'request',
  REPLY: 'reply',
  RELEASE: 'release',
  DEFER: 'defer',
  ENTER: 'enter',
  EXIT: 'exit',
  DEMO: 'demo',
  ERROR: 'error',
  VIOLATION: 'violation',
};

export const MIN_PROCESSES = 2;
export const MAX_PROCESSES = 10;
export const DEFAULT_PROCESSES = 5;
export const FACULTY_PROCESSES = 4;

/** Milliseconds per simulation tick for each speed setting. */
export const SPEEDS = {
  slow: { label: 'Slow', tickMs: 1200 },
  normal: { label: 'Normal', tickMs: 700 },
  fast: { label: 'Fast', tickMs: 300 },
};

export const DEFAULT_SPEED = 'normal';
export const FIXED_LATENCY_TICKS = 2;   // used in deterministic / demo modes
export const MAX_LOG_ENTRIES = 300;     // hard cap kept in memory
export const MAX_MESSAGE_LOG = 300;     // message records kept for the Message Log
export const CS_HOLD_TICKS = { min: 2, max: 4 }; // automatic release: ticks inside the CS
export const AUTO_COOLDOWN_TICKS = 4;           // idle time after a release before re-requesting

/**
 * Automatic request frequency: probability that one new request is generated on a tick.
 * Only one request per tick is ever created, and concurrency is capped, so requests
 * cannot flood the network.
 */
export const AUTO_RATES = {
  low: { label: 'Low', probability: 0.05 },
  medium: { label: 'Medium', probability: 0.12 },
  high: { label: 'High', probability: 0.3 },
};
export const DEFAULT_AUTO_RATE = 'medium';
