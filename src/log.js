const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const c = {
  dim: paint('2'),
  bold: paint('1'),
  green: paint('32'),
  red: paint('31'),
  yellow: paint('33'),
  cyan: paint('36'),
};

export const log = {
  info: (msg) => console.log(`${c.dim('·')} ${msg}`),
  step: (msg) => console.log(`${c.cyan('›')} ${msg}`),
  warn: (msg) => console.warn(`${c.yellow('!')} ${msg}`),
  error: (msg) => console.error(`${c.red('✗')} ${msg}`),
  blank: () => console.log(),
};
