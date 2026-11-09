import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Normalize a raw phone number into E.164.
 *
 * Accepts the formats people actually paste: "+55 (41) 99999-8888",
 * "5541999998888", "41999998888" (national, uses `defaultCountry`).
 *
 * @param {string} raw
 * @param {string} [defaultCountry='BR'] ISO 3166-1 alpha-2
 * @returns {{ ok: true, e164: string, digits: string, masked: string, country: string | undefined }
 *         | { ok: false, input: string, reason: string }}
 */
export function normalizePhone(raw, defaultCountry = 'BR') {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, input, reason: 'empty' };

  if (/[a-z]/i.test(input.replace(/\s*(ext\.?|x)\s*\d+$/i, ''))) {
    return { ok: false, input, reason: 'contains letters' };
  }

  const hasPlus = input.startsWith('+');
  const digits = input.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, input, reason: 'wrong length' };
  }

  const candidates = hasPlus
    ? [parsePhoneNumberFromString(`+${digits}`)]
    : [
        parsePhoneNumberFromString(digits, defaultCountry.toUpperCase()),
        parsePhoneNumberFromString(`+${digits}`),
      ];

  const phone = candidates.find((p) => p?.isValid());
  if (!phone) return { ok: false, input, reason: 'not a valid phone number' };

  const e164 = phone.number;
  return {
    ok: true,
    e164,
    digits: e164.slice(1),
    masked: maskPhone(e164, phone.countryCallingCode),
    country: phone.country,
  };
}

/**
 * Hide most of a number for logs: "+55 ••••••• 8888".
 * Results files keep the full number; terminal output and logs do not.
 */
export function maskPhone(e164, callingCode) {
  const cc = callingCode ?? '';
  const rest = e164.replace(/^\+/, '').slice(cc.length);
  const tail = rest.slice(-4);
  return `+${cc} ${'•'.repeat(Math.max(rest.length - 4, 0))} ${tail}`.replace(/\s+/g, ' ');
}

/**
 * Parse a text file body: one number per line, `#` comments and blank lines ignored.
 * @param {string} text
 * @returns {string[]}
 */
export function parseNumberList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
}
