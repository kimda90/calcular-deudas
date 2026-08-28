export function annualEffectiveToMonthlyRate(annualPct) {
  const annual = Number(annualPct);
  if (!Number.isFinite(annual) || annual < 0) {
    throw new RangeError('La tasa anual debe ser un número mayor o igual a cero.');
  }
  return Math.pow(1 + annual / 100, 1 / 12) - 1;
}

export function frenchPayment(principal, annualEffectivePct, termMonths) {
  const p = Number(principal);
  const n = Math.trunc(Number(termMonths));
  if (!Number.isFinite(p) || p < 0) throw new RangeError('El capital debe ser mayor o igual a cero.');
  if (!Number.isFinite(n) || n < 1) throw new RangeError('El plazo debe ser de al menos un mes.');
  if (p === 0) return 0;

  const r = annualEffectiveToMonthlyRate(annualEffectivePct);
  if (r === 0) return p / n;
  return p * (r / (1 - Math.pow(1 + r, -n)));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function simulateCompoundDebt({
  months = 12,
  monthlyDeficit = 100000,
  annualEffectivePct = 100,
} = {}) {
  const horizon = Math.trunc(clampNumber(months, 1, 600, 12));
  const deficit = clampNumber(monthlyDeficit, 0, 1e15, 100000);
  const rate = annualEffectiveToMonthlyRate(clampNumber(annualEffectivePct, 0, 100000, 100));
  const rows = [];
  let debt = 0;
  let totalBorrowed = 0;

  for (let month = 1; month <= horizon; month += 1) {
    const interest = debt * rate;
    debt += interest + deficit;
    totalBorrowed += deficit;
    rows.push({
      month,
      baseDeficit: deficit,
      interest,
      newBorrowing: deficit,
      debtService: 0,
      totalBorrowed,
      interestPaid: 0,
      outstandingDebt: debt,
    });
  }

  return {
    mode: 'compound',
    monthlyRate: rate,
    rows,
    summary: {
      outstandingDebt: debt,
      totalBorrowed,
      totalPayments: 0,
      interestPaid: 0,
      finalDebtService: 0,
      finalNewBorrowing: deficit,
      debtServiceExceedsBaseMonth: null,
    },
  };
}

export function simulateRecurringLoans({
  months = 12,
  monthlyDeficit = 100000,
  annualEffectivePct = 100,
  termMonths = 12,
  monthlyIncome = 0,
} = {}) {
  const horizon = Math.trunc(clampNumber(months, 1, 600, 12));
  const term = Math.trunc(clampNumber(termMonths, 1, 600, 12));
  const deficit = clampNumber(monthlyDeficit, 0, 1e15, 100000);
  const income = clampNumber(monthlyIncome, 0, 1e15, 0);
  const annualPct = clampNumber(annualEffectivePct, 0, 100000, 100);
  const monthlyRate = annualEffectiveToMonthlyRate(annualPct);

  const loans = [];
  const rows = [];
  let totalBorrowed = 0;
  let totalPayments = 0;
  let interestPaid = 0;
  let debtServiceExceedsBaseMonth = null;

  for (let month = 1; month <= horizon; month += 1) {
    let debtService = 0;
    let monthInterest = 0;

    for (const loan of loans) {
      if (loan.remainingMonths <= 0 || month < loan.firstPaymentMonth) continue;
      const interest = loan.balance * monthlyRate;
      monthInterest += interest;
      interestPaid += interest;

      const due = loan.remainingMonths === 1
        ? loan.balance + interest
        : Math.min(loan.payment, loan.balance + interest);

      const principalPaid = Math.max(0, due - interest);
      loan.balance = Math.max(0, loan.balance - principalPaid);
      loan.remainingMonths -= 1;
      debtService += due;
      totalPayments += due;
    }

    if (debtServiceExceedsBaseMonth === null && deficit > 0 && debtService >= deficit) {
      debtServiceExceedsBaseMonth = month;
    }

    const newBorrowing = deficit + debtService;
    totalBorrowed += newBorrowing;

    if (newBorrowing > 0) {
      loans.push({
        issuedMonth: month,
        firstPaymentMonth: month + 1,
        originalPrincipal: newBorrowing,
        balance: newBorrowing,
        payment: frenchPayment(newBorrowing, annualPct, term),
        remainingMonths: term,
      });
    }

    const outstandingDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);
    rows.push({
      month,
      baseDeficit: deficit,
      debtService,
      newBorrowing,
      monthInterest,
      totalBorrowed,
      totalPayments,
      interestPaid,
      outstandingDebt,
      debtServiceToIncomePct: income > 0 ? (debtService / income) * 100 : null,
    });
  }

  const last = rows.at(-1);
  return {
    mode: 'recurring-loans',
    monthlyRate,
    rows,
    summary: {
      outstandingDebt: last?.outstandingDebt ?? 0,
      totalBorrowed,
      totalPayments,
      interestPaid,
      finalDebtService: last?.debtService ?? 0,
      finalNewBorrowing: last?.newBorrowing ?? deficit,
      debtServiceExceedsBaseMonth,
      finalDebtServiceToIncomePct: last?.debtServiceToIncomePct ?? null,
    },
  };
}
