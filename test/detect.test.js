import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STATUS, classify } from '../src/detect.js';

const base = { composerVisible: false, dialogText: null, loggedOut: false };

test('composer visible means the chat opened', () => {
  assert.equal(classify({ ...base, composerVisible: true }), STATUS.ON);
});

test('invalid-number dialog in several languages means not on WhatsApp', () => {
  for (const text of [
    'O número de telefone compartilhado por url é inválido.',
    'Phone number shared via url is invalid.',
    'El número de teléfono compartido a través de la URL no es válido.',
    'Il numero di telefono condiviso tramite URL non valido.',
  ]) {
    assert.equal(classify({ ...base, dialogText: text }), STATUS.OFF, text);
  }
});

test('a loading dialog is not a verdict yet', () => {
  assert.equal(classify({ ...base, dialogText: 'Iniciando conversa' }), null);
  assert.equal(classify(base), null);
});

test('logged out is unknown, never a false positive', () => {
  assert.equal(classify({ ...base, loggedOut: true, composerVisible: true }), STATUS.UNKNOWN);
});
