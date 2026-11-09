import fs from 'node:fs';
import path from 'node:path';

const HEADER = 'number,status,checked_at\n';

/**
 * Appends one CSV row per check as soon as it finishes, so an interrupted run
 * (Ctrl+C, crash, logout) keeps everything checked so far.
 */
export class ResultsFile {
  constructor(file) {
    this.file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file) || fs.statSync(this.file).size === 0) {
      fs.writeFileSync(this.file, HEADER);
    }
  }

  append(e164, status, at = new Date()) {
    fs.appendFileSync(this.file, `${e164},${status},${at.toISOString()}\n`);
  }
}
