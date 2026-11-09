import fs from 'node:fs';
import path from 'node:path';

/**
 * Hard ceilings. This tool checks a handful of numbers you have a reason to
 * check; it is deliberately not a bulk validator. Environment variables can
 * make these stricter, never looser.
 */
export const HARD_LIMITS = Object.freeze({
  perRun: 25,
  perDay: 60,
  minGapMs: 8_000,
  maxGapMs: 15_000,
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {typeof HARD_LIMITS}
 */
export function resolveLimits(env = process.env) {
  const stricter = (name, hard, cmp) => {
    const value = Number.parseInt(env[name] ?? '', 10);
    if (!Number.isFinite(value) || value <= 0) return hard;
    return cmp(value, hard) ? value : hard;
  };
  const lower = (a, b) => a < b;
  const higher = (a, b) => a > b;

  const minGapMs = stricter('WA_MIN_GAP_MS', HARD_LIMITS.minGapMs, higher);
  return {
    perRun: stricter('WA_MAX_PER_RUN', HARD_LIMITS.perRun, lower),
    perDay: stricter('WA_MAX_PER_DAY', HARD_LIMITS.perDay, lower),
    minGapMs,
    maxGapMs: Math.max(stricter('WA_MAX_GAP_MS', HARD_LIMITS.maxGapMs, higher), minGapMs),
  };
}

/** Pause between checks: keeps the pace slow, one number at a time. */
export function nextGap({ minGapMs, maxGapMs }, random = Math.random) {
  return Math.round(minGapMs + random() * (maxGapMs - minGapMs));
}

/**
 * A rolling 24h counter persisted on disk, so the daily ceiling survives
 * restarts. Stores timestamps only, never numbers.
 */
export class UsageLedger {
  /**
   * @param {string} file
   * @param {() => number} [now]
   */
  constructor(file, now = Date.now) {
    this.file = file;
    this.now = now;
    this.stamps = this.#load();
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(data.checks) ? data.checks.filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }

  #prune() {
    const cutoff = this.now() - DAY_MS;
    this.stamps = this.stamps.filter((t) => t > cutoff);
  }

  usedToday() {
    this.#prune();
    return this.stamps.length;
  }

  remaining(perDay) {
    return Math.max(perDay - this.usedToday(), 0);
  }

  /** When the oldest check in the window expires, freeing one slot. */
  nextSlotAt() {
    this.#prune();
    return this.stamps.length ? Math.min(...this.stamps) + DAY_MS : this.now();
  }

  record() {
    this.#prune();
    this.stamps.push(this.now());
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ checks: this.stamps }) + '\n');
  }
}
