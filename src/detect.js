/**
 * Turning a WhatsApp Web page into a verdict.
 *
 * Opening `web.whatsapp.com/send?phone=<number>` ends in one of two states:
 *   - the chat opens and the message composer appears  -> number is on WhatsApp
 *   - a dialog says the shared phone number is invalid -> number is not
 *
 * Anything else (still loading, logged out, network error, a UI change) is
 * UNKNOWN. The old version defaulted to "OK" here, which produced false
 * positives whenever the page was slow or in another language.
 */

export const STATUS = Object.freeze({
  ON: 'on_whatsapp',
  OFF: 'not_on_whatsapp',
  UNKNOWN: 'unknown',
});

/** The "invalid number" dialog in the languages WhatsApp Web ships most. */
const INVALID_PATTERNS = [
  /inv[aá]lid/i, // pt: "inválido", en: "invalid"
  /no es v[aá]lido/i, // es
  /non (è )?valido/i, // it
  /ungültig/i, // de
  /n'est pas valide/i, // fr
];

/**
 * @param {{ composerVisible: boolean, dialogText: string | null, loggedOut: boolean }} state
 * @returns {string | null} a STATUS, or null while the page is still settling
 */
export function classify(state) {
  if (state.loggedOut) return STATUS.UNKNOWN;
  if (state.composerVisible) return STATUS.ON;
  if (state.dialogText && INVALID_PATTERNS.some((re) => re.test(state.dialogText))) {
    return STATUS.OFF;
  }
  return null;
}

/**
 * Runs inside the browser. Kept free of closures so Playwright can serialize it.
 * Selectors favour stable ids/roles over generated class names.
 */
export function readPageState() {
  const composer = document.querySelector(
    '#main footer [contenteditable="true"], [data-testid="conversation-compose-box-input"]',
  );
  const dialog = document.querySelector('[role="dialog"], [data-animate-modal-popup="true"]');
  const qr = document.querySelector('[data-testid="link-device-qr-code"], [data-ref] canvas');
  const appShell = document.querySelector('#pane-side, #side, [data-testid="chat-list"]');
  return {
    composerVisible: Boolean(composer),
    dialogText: dialog ? dialog.innerText : null,
    loggedOut: Boolean(qr) && !appShell,
  };
}
