import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeBcraResponse } from '../scripts/rates-lib.mjs';

test('normaliza la respuesta de préstamos personales del BCRA', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/bcra-personal-loans.json', import.meta.url), 'utf8'));
  const snapshot = normalizeBcraResponse(fixture, '2026-08-28T22:30:00.000Z');
  assert.equal(snapshot.productCount, 1);
  assert.equal(snapshot.products[0].entityCode, 7);
  assert.equal(snapshot.products[0].currency, 'Pesos');
  assert.equal(snapshot.products[0].cfteaPct, 343.18);
  assert.equal(snapshot.products[0].initialInstallmentPer10000, 1357);
  assert.match(snapshot.products[0].id, /^[a-f0-9]{16}$/);
});
