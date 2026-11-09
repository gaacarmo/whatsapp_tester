import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maskPhone, normalizePhone, parseNumberList } from '../src/phone.js';

// Example numbers from libphonenumber's metadata, not real people.
const BR_MOBILE = '+5511961234567';

test('accepts common Brazilian formats', () => {
  for (const input of ['+55 (11) 96123-4567', '5511961234567', '11961234567', '(11) 96123-4567']) {
    const r = normalizePhone(input, 'BR');
    assert.equal(r.ok, true, input);
    assert.equal(r.e164, BR_MOBILE, input);
    assert.equal(r.digits, '5511961234567', input);
  }
});

test('uses the default country only for national numbers', () => {
  const us = normalizePhone('+1 201 555 0123', 'BR');
  assert.equal(us.ok, true);
  assert.equal(us.e164, '+12015550123');
  assert.equal(normalizePhone('2015550123', 'US').e164, '+12015550123');
});

test('rejects junk with a reason', () => {
  assert.deepEqual(normalizePhone('', 'BR').reason, 'empty');
  assert.equal(normalizePhone('call me', 'BR').reason, 'contains letters');
  assert.equal(normalizePhone('123', 'BR').reason, 'wrong length');
  assert.equal(normalizePhone('1234567890123456', 'BR').reason, 'wrong length');
  assert.equal(normalizePhone('+55 00 0000-0000', 'BR').ok, false);
});

test('masks all but the last four digits', () => {
  assert.equal(normalizePhone(BR_MOBILE).masked, '+55 ••••••• 4567');
  assert.equal(maskPhone('+12015550123', '1'), '+1 •••••• 0123');
});

test('parses lists with comments and blank lines', () => {
  const text = '# team\n+55 11 96123-4567\n\n  11961234567  # same number\r\n';
  assert.deepEqual(parseNumberList(text), ['+55 11 96123-4567', '11961234567']);
});
