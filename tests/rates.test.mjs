import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonicalLoanType,
  dedupeLoanTypes,
  normalizeBcraResponse,
} from '../scripts/rates-lib.mjs';

test('normaliza la respuesta de préstamos personales del BCRA', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/bcra-personal-loans.json', import.meta.url), 'utf8'));
  const snapshot = normalizeBcraResponse(fixture, '2026-08-28T22:30:00.000Z');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.rawProductCount, 1);
  assert.equal(snapshot.productCount, 1);
  assert.equal(snapshot.products[0].entityCode, 7);
  assert.equal(snapshot.products[0].currency, 'Pesos');
  assert.equal(snapshot.products[0].cfteaPct, 343.18);
  assert.equal(snapshot.products[0].initialInstallmentPer10000, 1357);
  assert.equal(snapshot.products[0].loanType, 'Préstamo personal');
  assert.match(snapshot.products[0].id, /^[a-f0-9]{16}$/);
});

test('normaliza nombres equivalentes al mismo tipo de préstamo', () => {
  assert.deepEqual(canonicalLoanType({ name: 'PRESTAMOPERSONAL' }), {
    key: 'personal-general',
    label: 'Préstamo personal',
  });
  assert.deepEqual(canonicalLoanType({ name: 'Préstamos personales' }), {
    key: 'personal-general',
    label: 'Préstamo personal',
  });
});

test('mantiene separados los segmentos con condiciones potencialmente distintas', () => {
  assert.equal(canonicalLoanType({ name: 'Préstamo personal', beneficiary: 'Jubilados y pensionados' }).key, 'personal-jubilados');
  assert.equal(canonicalLoanType({ name: 'Préstamo personal', beneficiary: 'Monotributistas' }).key, 'personal-monotributistas');
  assert.equal(canonicalLoanType({ name: 'Préstamo personal con acreditación de haberes' }).key, 'personal-sueldo');
});

test('deduplica variantes nominales y conserva la menor CFTEA', () => {
  const products = [
    {
      id: 'a', entityCode: 7, entity: 'Banco Ejemplo', name: 'PRESTAMOPERSONAL', shortName: 'PP',
      beneficiary: 'Todos los beneficiarios', currency: 'Pesos', rateType: 'Fija', cfteaPct: 180,
    },
    {
      id: 'b', entityCode: 7, entity: 'Banco Ejemplo', name: 'Préstamo Personal', shortName: 'Personal',
      beneficiary: 'Todos los beneficiarios', currency: 'Pesos', rateType: 'Fija', cfteaPct: 150,
    },
  ];

  const deduped = dedupeLoanTypes(products);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].cfteaPct, 150);
  assert.equal(deduped[0].variants, 2);
  assert.ok(deduped[0].aliases.includes('PRESTAMOPERSONAL'));
  assert.ok(deduped[0].aliases.includes('Préstamo Personal'));
});
