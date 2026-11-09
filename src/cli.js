#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { STATUS } from './detect.js';
import { c, log } from './log.js';
import { normalizePhone, parseNumberList } from './phone.js';
import { UsageLedger, nextGap, resolveLimits } from './rate-limit.js';
import { ResultsFile } from './results.js';
import { DemoWhatsApp, WhatsAppWeb } from './whatsapp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_DIR = process.env.WA_PROFILE_DIR ?? path.join(ROOT, '.wa-session');
const LEDGER_FILE = path.join(ROOT, '.wa-state', 'usage.json');
const LOGIN_TIMEOUT_MS = 3 * 60_000;

const HELP = `
${c.bold('wa-check')} — is this number on WhatsApp?

${c.bold('Usage')}
  npm run check -- <number> [<number> ...]
  npm run check -- --file numbers.txt

${c.bold('Options')}
  -f, --file <path>       One number per line. "#" starts a comment.
  -o, --out <path>        CSV output (default: results.csv)
  -c, --country <code>    Country for numbers without a country code (default: BR)
      --demo              Offline walkthrough with fake answers. No browser, no WhatsApp.
  -h, --help              Show this help

${c.bold('Limits')} ${c.dim('(env vars can only make them stricter)')}
  WA_MAX_PER_RUN   numbers per run        (max 25)
  WA_MAX_PER_DAY   checks per rolling 24h (max 60)
  WA_MIN_GAP_MS    pause between checks   (min 8000)

Only check numbers you have a legitimate reason to check. See README.
`;

const ICON = {
  [STATUS.ON]: c.green('●  on WhatsApp'),
  [STATUS.OFF]: c.red('○  not on WhatsApp'),
  [STATUS.UNKNOWN]: c.yellow('?  unknown'),
};

class UsageError extends Error {}

function readArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        file: { type: 'string', short: 'f' },
        out: { type: 'string', short: 'o' },
        country: { type: 'string', short: 'c', default: 'BR' },
        demo: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
}

function collectNumbers({ values, positionals }) {
  const raw = [...positionals];
  if (values.file) {
    const file = path.resolve(values.file);
    if (!fs.existsSync(file)) throw new UsageError(`File not found: ${values.file}`);
    raw.push(...parseNumberList(fs.readFileSync(file, 'utf8')));
  }
  if (!/^[a-z]{2}$/i.test(values.country)) {
    throw new UsageError(`--country must be a 2-letter code like BR or US, got "${values.country}"`);
  }

  const valid = new Map();
  const rejected = [];
  for (const entry of raw) {
    const result = normalizePhone(entry, values.country);
    if (result.ok) valid.set(result.e164, result);
    else rejected.push(result);
  }
  return { numbers: [...valid.values()], rejected, duplicates: raw.length - rejected.length - valid.size };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.values.help) {
    console.log(HELP);
    return 0;
  }

  const demo = args.values.demo;
  const limits = demo ? { perRun: 25, perDay: Infinity, minGapMs: 400, maxGapMs: 900 } : resolveLimits();
  const { numbers, rejected, duplicates } = collectNumbers(args);

  log.blank();
  console.log(`${c.bold('WhatsApp Tester')}${demo ? c.dim('  ·  demo mode, no real lookups') : ''}`);
  log.blank();

  for (const r of rejected) log.warn(`Skipping "${r.input}": ${r.reason}`);
  if (duplicates > 0) log.info(`Removed ${duplicates} duplicate${duplicates > 1 ? 's' : ''}`);

  if (numbers.length === 0) throw new UsageError('No valid numbers to check. Run with --help for usage.');
  if (numbers.length > limits.perRun) {
    throw new UsageError(
      `${numbers.length} numbers given; the limit is ${limits.perRun} per run. ` +
        'This tool is for spot checks, not bulk validation.',
    );
  }

  const ledger = demo ? null : new UsageLedger(LEDGER_FILE);
  if (ledger) {
    const left = ledger.remaining(limits.perDay);
    if (numbers.length > left) {
      const when = new Date(ledger.nextSlotAt()).toLocaleString();
      throw new UsageError(
        `Daily limit: ${left} of ${limits.perDay} checks left in the last 24h. Next slot frees up at ${when}.`,
      );
    }
  }

  const outFile = args.values.out ?? (demo ? null : 'results.csv');
  const results = outFile ? new ResultsFile(outFile) : null;

  const wa = demo ? new DemoWhatsApp() : new WhatsAppWeb({ profileDir: PROFILE_DIR });
  let interrupted = false;
  const onSigint = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    log.blank();
    log.warn('Stopping after the current number… (Ctrl+C again to force)');
  };
  process.on('SIGINT', onSigint);

  const tally = { [STATUS.ON]: 0, [STATUS.OFF]: 0, [STATUS.UNKNOWN]: 0 };
  try {
    log.step(demo ? 'Starting demo session…' : 'Opening WhatsApp Web…');
    await wa.open();
    await wa.waitForLogin({
      timeoutMs: LOGIN_TIMEOUT_MS,
      onQr: () => log.step('Scan the QR code in the browser window (WhatsApp › Linked devices).'),
    });
    log.step(`Checking ${numbers.length} number${numbers.length > 1 ? 's' : ''}, one at a time`);
    log.blank();

    for (const [i, n] of numbers.entries()) {
      if (interrupted) break;
      const counter = c.dim(`${String(i + 1).padStart(String(numbers.length).length)}/${numbers.length}`);

      let status;
      try {
        status = await wa.check(n.digits);
      } catch (err) {
        status = STATUS.UNKNOWN;
        log.warn(`${n.masked}: ${err.message.split('\n')[0]}`);
      }
      ledger?.record();
      results?.append(n.e164, status);
      tally[status] += 1;
      console.log(`  ${counter}  ${n.masked.padEnd(18)} ${ICON[status]}`);

      if (i < numbers.length - 1 && !interrupted) {
        await new Promise((r) => setTimeout(r, nextGap(limits)));
      }
    }
  } finally {
    process.off('SIGINT', onSigint);
    await wa.close();
  }

  const done = tally[STATUS.ON] + tally[STATUS.OFF] + tally[STATUS.UNKNOWN];
  log.blank();
  console.log(
    `  ${c.bold(done)} checked  ${c.dim('·')}  ${c.green(tally[STATUS.ON])} on  ${c.dim('·')}  ` +
      `${c.red(tally[STATUS.OFF])} not  ${c.dim('·')}  ${c.yellow(tally[STATUS.UNKNOWN])} unknown`,
  );
  if (results) log.info(`Saved to ${path.relative(process.cwd(), results.file) || results.file}`);
  if (ledger) log.info(c.dim(`${ledger.remaining(limits.perDay)} checks left in the rolling 24h window`));
  log.blank();
  return interrupted ? 130 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof UsageError) {
      log.error(err.message);
      process.exit(2);
    }
    log.error(err?.message ?? String(err));
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  },
);
