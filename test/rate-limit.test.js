import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { HARD_LIMITS, UsageLedger, nextGap, resolveLimits } from '../src/rate-limit.js';

test('env vars can tighten limits but never loosen them', () => {
  assert.deepEqual(resolveLimits({}), HARD_LIMITS);

  const strict = resolveLimits({ WA_MAX_PER_RUN: '5', WA_MAX_PER_DAY: '10', WA_MIN_GAP_MS: '20000' });
  assert.equal(strict.perRun, 5);
  assert.equal(strict.perDay, 10);
  assert.equal(strict.minGapMs, 20000);
  assert.ok(strict.maxGapMs >= strict.minGapMs);

  const loose = resolveLimits({ WA_MAX_PER_RUN: '9999', WA_MAX_PER_DAY: '9999', WA_MIN_GAP_MS: '1' });
  assert.equal(loose.perRun, HARD_LIMITS.perRun);
  assert.equal(loose.perDay, HARD_LIMITS.perDay);
  assert.equal(loose.minGapMs, HARD_LIMITS.minGapMs);

  assert.deepEqual(resolveLimits({ WA_MAX_PER_RUN: 'abc', WA_MAX_PER_DAY: '-3' }), HARD_LIMITS);
});

test('gap stays inside the configured window', () => {
  const limits = { minGapMs: 8000, maxGapMs: 15000 };
  assert.equal(nextGap(limits, () => 0), 8000);
  assert.equal(nextGap(limits, () => 0.999999), 15000);
});

test('ledger counts a rolling 24h window and persists across instances', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ledger-'));
  const file = path.join(dir, 'state', 'usage.json');
  let now = Date.UTC(2026, 0, 1);
  const clock = () => now;

  const ledger = new UsageLedger(file, clock);
  for (let i = 0; i < 3; i++) ledger.record();
  assert.equal(ledger.usedToday(), 3);
  assert.equal(ledger.remaining(5), 2);

  const reloaded = new UsageLedger(file, clock);
  assert.equal(reloaded.usedToday(), 3);

  now += 24 * 60 * 60 * 1000 + 1;
  assert.equal(reloaded.usedToday(), 0);
  assert.equal(reloaded.remaining(5), 5);

  const saved = fs.readFileSync(file, 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(saved)), ['checks'], 'stores timestamps only');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ledger survives a corrupt state file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ledger-'));
  const file = path.join(dir, 'usage.json');
  fs.writeFileSync(file, '{not json');
  assert.equal(new UsageLedger(file).usedToday(), 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
