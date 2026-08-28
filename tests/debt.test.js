import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annualEffectiveToMonthlyRate,
  frenchPayment,
  simulateCompoundDebt,
  simulateRecurringLoans,
} from '../lib/debt.js';

test('convierte una tasa efectiva anual a mensual', () => {
  assert.ok(Math.abs(annualEffectiveToMonthlyRate(100) - 0.05946309435929531) < 1e-12);
});

test('cuota francesa sin interés es capital dividido plazo', () => {
  assert.equal(frenchPayment(120000, 0, 12), 10000);
});

test('sin interés la deuda compuesta suma el déficit mensual', () => {
  const simulation = simulateCompoundDebt({ months: 12, monthlyDeficit: 100000, annualEffectivePct: 0 });
  assert.equal(simulation.summary.outstandingDebt, 1200000);
});

test('préstamos recurrentes incrementan el nuevo endeudamiento por las cuotas', () => {
  const simulation = simulateRecurringLoans({ months: 3, monthlyDeficit: 100000, annualEffectivePct: 0, termMonths: 10 });
  assert.equal(simulation.rows[0].newBorrowing, 100000);
  assert.equal(simulation.rows[1].debtService, 10000);
  assert.equal(simulation.rows[1].newBorrowing, 110000);
  assert.equal(simulation.rows[2].debtService, 21000);
  assert.equal(simulation.rows[2].newBorrowing, 121000);
});
