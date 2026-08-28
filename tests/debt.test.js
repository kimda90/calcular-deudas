import test from 'node:test';
import assert from 'node:assert/strict';
import { annualEffectiveToMonthlyRate, simulateUnpaidDebt } from '../lib/debt.js';

test('convierte una tasa efectiva anual a mensual', () => {
  assert.ok(Math.abs(annualEffectiveToMonthlyRate(100) - 0.05946309435929531) < 1e-12);
});

test('un préstamo único sin interés queda constante', () => {
  const simulation = simulateUnpaidDebt({ months: 12, amount: 100000, annualEffectivePct: 0, recurring: false });
  assert.equal(simulation.summary.totalBorrowed, 100000);
  assert.equal(simulation.summary.finalDebt, 100000);
  assert.equal(simulation.rows[0].outstandingDebt, 100000);
});

test('un préstamo único impago capitaliza cada mes', () => {
  const simulation = simulateUnpaidDebt({ months: 12, amount: 100000, annualEffectivePct: 100, recurring: false });
  assert.ok(Math.abs(simulation.summary.finalDebt - 200000) < 0.01);
});

test('un préstamo recurrente sin interés acumula el capital mensual', () => {
  const simulation = simulateUnpaidDebt({ months: 12, amount: 100000, annualEffectivePct: 0, recurring: true });
  assert.equal(simulation.summary.totalBorrowed, 1200000);
  assert.equal(simulation.summary.finalDebt, 1200000);
});

test('un préstamo recurrente con interés termina por encima del capital recibido', () => {
  const simulation = simulateUnpaidDebt({ months: 12, amount: 100000, annualEffectivePct: 100, recurring: true });
  assert.equal(simulation.summary.totalBorrowed, 1200000);
  assert.ok(simulation.summary.finalDebt > 1200000);
  assert.ok(simulation.summary.accruedInterest > 0);
});
