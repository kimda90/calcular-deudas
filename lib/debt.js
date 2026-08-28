export function annualEffectiveToMonthlyRate(annualPct) {
  const annual = Number(annualPct);
  if (!Number.isFinite(annual) || annual < 0) {
    throw new RangeError('La tasa anual debe ser un número mayor o igual a cero.');
  }
  return Math.pow(1 + annual / 100, 1 / 12) - 1;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function simulateUnpaidDebt({
  months = 12,
  amount = 100000,
  annualEffectivePct = 100,
  recurring = false,
} = {}) {
  const horizon = Math.trunc(clampNumber(months, 1, 600, 12));
  const principal = clampNumber(amount, 0, 1e15, 100000);
  const annualPct = clampNumber(annualEffectivePct, 0, 100000, 100);
  const monthlyRate = annualEffectiveToMonthlyRate(annualPct);
  const rows = [];

  let debt = recurring ? 0 : principal;
  let totalBorrowed = recurring ? 0 : principal;

  rows.push({
    month: 0,
    newBorrowing: recurring ? 0 : principal,
    interest: 0,
    totalBorrowed,
    outstandingDebt: debt,
  });

  for (let month = 1; month <= horizon; month += 1) {
    const newBorrowing = recurring ? principal : 0;
    debt += newBorrowing;
    totalBorrowed += newBorrowing;

    const interest = debt * monthlyRate;
    debt += interest;

    rows.push({
      month,
      newBorrowing,
      interest,
      totalBorrowed,
      outstandingDebt: debt,
    });
  }

  return {
    mode: recurring ? 'recurring' : 'one-time',
    monthlyRate,
    rows,
    summary: {
      finalDebt: debt,
      totalBorrowed,
      accruedInterest: Math.max(0, debt - totalBorrowed),
    },
  };
}

export function simulateCompoundDebt({ months = 12, monthlyDeficit = 100000, annualEffectivePct = 100 } = {}) {
  const simulation = simulateUnpaidDebt({ months, amount: monthlyDeficit, annualEffectivePct, recurring: true });
  return {
    ...simulation,
    rows: simulation.rows.slice(1).map((row) => ({ ...row, baseDeficit: monthlyDeficit, debtService: 0 })),
    summary: {
      outstandingDebt: simulation.summary.finalDebt,
      totalBorrowed: simulation.summary.totalBorrowed,
      totalPayments: 0,
      interestPaid: 0,
      finalDebtService: 0,
      finalNewBorrowing: monthlyDeficit,
      debtServiceExceedsBaseMonth: null,
    },
  };
}
