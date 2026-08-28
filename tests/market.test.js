import test from 'node:test';
import assert from 'node:assert/strict';
import { bestProductPerEntity, percentileDebtRows, quantile, representativeEntityNames } from '../lib/market.js';

test('quantile interpola una distribución', () => {
  assert.equal(quantile([0, 10, 20, 30, 40], 0.5), 20);
  assert.equal(quantile([0, 10, 20, 30], 0.25), 7.5);
});

test('bestProductPerEntity conserva la menor tasa en pesos', () => {
  const entities = bestProductPerEntity([
    { entity: 'Banco A', currency: 'Pesos', cfteaPct: 120 },
    { entity: 'Banco A', currency: 'Pesos', cfteaPct: 80 },
    { entity: 'Banco A', currency: 'Dólares', cfteaPct: 10 },
    { entity: 'Banco B', currency: 'Pesos', teaPct: 90 },
  ]);
  assert.deepEqual(entities.map((item) => [item.entity, item.rate]), [['Banco A', 80], ['Banco B', 90]]);
});

test('percentileDebtRows calcula percentiles por mes', () => {
  const series = [100, 200, 300, 400].map((finalDebt) => ({
    simulation: { rows: [{ month: 0, outstandingDebt: 0 }, { month: 1, outstandingDebt: finalDebt }] },
  }));
  const rows = percentileDebtRows(series);
  assert.equal(rows[1].p50, 250);
  assert.equal(rows[1].p25, 175);
  assert.equal(rows[1].p75, 325);
});

test('representativeEntityNames devuelve entidades cercanas a percentiles', () => {
  const entities = Array.from({ length: 5 }, (_, i) => ({ entity: `Banco ${i}`, rate: i * 10 }));
  assert.deepEqual(representativeEntityNames(entities), ['Banco 1', 'Banco 2', 'Banco 3']);
});
