import { simulateCompoundDebt, simulateRecurringLoans } from './lib/debt.js';

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });

const state = { snapshot: null, products: [], selected: null };
const defaults = { monthlyDeficit: 100000, monthlyIncome: 2000000, horizonMonths: 12, termMonths: 12, manualRate: 100 };

function safeNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function rateForProduct(product) {
  return product?.cfteaPct ?? product?.teaPct ?? null;
}

function eligibleProducts(products) {
  return products
    .filter((product) => product.currency?.toLocaleLowerCase('es').includes('peso'))
    .filter((product) => Number.isFinite(rateForProduct(product)) && rateForProduct(product) >= 0)
    .sort((a, b) => rateForProduct(a) - rateForProduct(b));
}

async function loadRates() {
  try {
    const response = await fetch('./data/rates.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.snapshot = await response.json();
    state.products = eligibleProducts(state.snapshot.products ?? []);
    populateProducts();
    renderRatesTable();
    renderFreshness();
  } catch (error) {
    $('#freshness').textContent = 'Sin snapshot BCRA';
    $('#sourceNote').textContent = `No se pudo cargar el snapshot: ${error.message}. La calculadora manual sigue disponible.`;
    renderRatesTable();
  }
}

function populateProducts() {
  const select = $('#productSelect');
  select.replaceChildren(new Option('Tasa manual', 'manual'));
  for (const product of state.products) {
    const rate = rateForProduct(product);
    const label = `${product.entity} — ${product.shortName ?? product.name} — ${pct.format(rate)}%`;
    select.add(new Option(label, product.id));
  }
}

function renderFreshness() {
  const retrieved = state.snapshot?.retrievedAt ? new Date(state.snapshot.retrievedAt) : null;
  $('#freshness').textContent = retrieved && !Number.isNaN(retrieved.valueOf())
    ? `${state.snapshot.productCount} productos · descargado ${dateFmt.format(retrieved)}`
    : 'Snapshot pendiente de actualización';
  $('#sourceNote').textContent = state.snapshot?.scope ?? 'Fuente BCRA.';
}

function selectedProduct() {
  const id = $('#productSelect').value;
  return id === 'manual' ? null : state.products.find((product) => product.id === id) ?? null;
}

function currentRate() {
  const product = selectedProduct();
  return product ? rateForProduct(product) : safeNumber($('#manualRate'), defaults.manualRate);
}

function renderProductDetails() {
  const product = selectedProduct();
  state.selected = product;
  const manual = $('#manualRate');
  manual.disabled = Boolean(product);
  if (!product) {
    $('#productDetails').textContent = 'Tasa manual: ingresá un CFTEA para comparar un escenario que no figure en el BCRA.';
    return;
  }
  const details = [
    `${pct.format(rateForProduct(product))}% CFTEA máx.`,
    product.teaPct != null ? `${pct.format(product.teaPct)}% TEA máx.` : null,
    product.maxTermMonths ? `hasta ${product.maxTermMonths} meses` : null,
    product.beneficiary,
    product.infoDate ? `informado ${product.infoDate}` : null,
  ].filter(Boolean);
  $('#productDetails').textContent = details.join(' · ');
}

function metric(label, value, warning = false) {
  return `<div class="metric${warning ? ' warning' : ''}"><strong>${value}</strong><span>${label}</span></div>`;
}

function renderSummary(simulation, months, rate) {
  const s = simulation.summary;
  const metrics = [
    metric('Deuda pendiente', money.format(s.outstandingDebt)),
    metric('Capital pedido acumulado', money.format(s.totalBorrowed)),
    metric('Pagos realizados', money.format(s.totalPayments)),
    metric('Interés pagado', money.format(s.interestPaid)),
    metric('Cuotas en el último mes', money.format(s.finalDebtService), s.finalDebtService >= safeNumber($('#monthlyDeficit'))),
    metric('Nuevo préstamo del último mes', money.format(s.finalNewBorrowing), s.finalNewBorrowing > safeNumber($('#monthlyDeficit'))),
  ];
  if (s.debtServiceExceedsBaseMonth) metrics.push(metric('Cuotas ≥ déficit base', `Mes ${s.debtServiceExceedsBaseMonth}`, true));
  if (s.finalDebtServiceToIncomePct != null) metrics.push(metric('Cuotas / ingreso al final', `${pct.format(s.finalDebtServiceToIncomePct)}%`, s.finalDebtServiceToIncomePct >= 30));
  $('#metricGrid').innerHTML = metrics.join('');
  $('#resultMonths').textContent = months;
  $('#resultRate').textContent = `CFTEA ${pct.format(rate)}%`;
}

function renderChart(rows) {
  const width = 760;
  const height = 300;
  const pad = { left: 68, right: 18, top: 18, bottom: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(1, ...rows.flatMap((row) => [row.outstandingDebt, row.newBorrowing]));
  const x = (index) => pad.left + (rows.length === 1 ? innerW / 2 : (index / (rows.length - 1)) * innerW);
  const y = (value) => pad.top + innerH - (value / maxY) * innerH;
  const points = (key) => rows.map((row, index) => `${x(index)},${y(row[key])}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, i) => (maxY / 4) * i);
  const grid = ticks.map((tick) => {
    const yy = y(tick);
    return `<line class="grid" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text x="${pad.left - 8}" y="${yy + 4}" text-anchor="end">${compactMoney(tick)}</text>`;
  }).join('');
  const xLabels = rows.map((row, index) => {
    if (rows.length > 12 && index % Math.ceil(rows.length / 8) !== 0 && index !== rows.length - 1) return '';
    return `<text x="${x(index)}" y="${height - 10}" text-anchor="middle">${row.month}</text>`;
  }).join('');

  $('#chart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}<polyline class="debt-line" points="${points('outstandingDebt')}"/><polyline class="borrow-line" points="${points('newBorrowing')}"/>${xLabels}</svg>`;
  $('#chart').setAttribute('aria-label', `La deuda termina en ${money.format(rows.at(-1)?.outstandingDebt ?? 0)} y el último préstamo nuevo en ${money.format(rows.at(-1)?.newBorrowing ?? 0)}.`);
}

function compactMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

function renderSimulationTable(rows) {
  $('#simulationTable').innerHTML = rows.map((row) => `<tr><td>${row.month}</td><td class="num">${money.format(row.baseDeficit)}</td><td class="num">${money.format(row.debtService ?? 0)}</td><td class="num">${money.format(row.newBorrowing)}</td><td class="num">${money.format(row.outstandingDebt)}</td></tr>`).join('');
}

function calculate(event) {
  event?.preventDefault();
  const monthlyDeficit = safeNumber($('#monthlyDeficit'), defaults.monthlyDeficit);
  const monthlyIncome = safeNumber($('#monthlyIncome'), defaults.monthlyIncome);
  const months = Math.max(1, Number($('#horizonMonths').value));
  const termMonths = Math.max(1, Number($('#termMonths').value));
  const annualEffectivePct = currentRate();
  const mode = document.querySelector('input[name="mode"]:checked')?.value ?? 'recurring';
  const product = selectedProduct();

  if (!Number.isFinite(annualEffectivePct) || annualEffectivePct < 0) {
    $('#validationMessage').textContent = 'Ingresá un CFTEA válido.';
    return;
  }
  if (product?.maxTermMonths && termMonths > product.maxTermMonths) {
    $('#validationMessage').textContent = `El producto informa un plazo máximo de ${product.maxTermMonths} meses. Elegí un plazo menor para esta simulación.`;
    return;
  }
  $('#validationMessage').textContent = '';

  const simulation = mode === 'compound'
    ? simulateCompoundDebt({ months, monthlyDeficit, annualEffectivePct })
    : simulateRecurringLoans({ months, monthlyDeficit, monthlyIncome, annualEffectivePct, termMonths });

  renderSummary(simulation, months, annualEffectivePct);
  renderChart(simulation.rows);
  renderSimulationTable(simulation.rows);
}

function renderRatesTable() {
  const query = ($('#rateSearch')?.value ?? '').trim().toLocaleLowerCase('es');
  const filtered = state.products.filter((product) => {
    if (!query) return true;
    return [product.entity, product.name, product.shortName, product.beneficiary]
      .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query);
  }).slice(0, 100);

  const tbody = $('#ratesTable');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td class="empty-row" colspan="7">${state.products.length ? 'No hay resultados para esa búsqueda.' : 'Todavía no hay tasas en el snapshot. Ejecutá “Update BCRA rates” o esperá al próximo CRON.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map((product) => `<tr>
    <td>${escapeHtml(product.entity)}</td>
    <td>${escapeHtml(product.shortName ?? product.name)}</td>
    <td>${escapeHtml(product.beneficiary ?? '—')}</td>
    <td class="num"><strong>${pct.format(rateForProduct(product))}%</strong></td>
    <td class="num">${product.teaPct == null ? '—' : `${pct.format(product.teaPct)}%`}</td>
    <td class="num">${product.maxTermMonths ?? '—'} meses</td>
    <td>${escapeHtml(product.infoDate ?? '—')}</td>
  </tr>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function reset() {
  $('#monthlyDeficit').value = defaults.monthlyDeficit;
  $('#monthlyIncome').value = defaults.monthlyIncome;
  $('#horizonMonths').value = defaults.horizonMonths;
  $('#termMonths').value = defaults.termMonths;
  $('#manualRate').value = defaults.manualRate;
  $('#productSelect').value = 'manual';
  document.querySelector('input[name="mode"][value="recurring"]').checked = true;
  renderProductDetails();
  calculate();
}

$('#simulationForm').addEventListener('submit', calculate);
$('#productSelect').addEventListener('change', () => { renderProductDetails(); calculate(); });
$('#rateSearch').addEventListener('input', renderRatesTable);
$('#resetButton').addEventListener('click', reset);
for (const control of ['#monthlyDeficit', '#monthlyIncome', '#horizonMonths', '#termMonths', '#manualRate']) {
  $(control).addEventListener('change', calculate);
}
for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', calculate);

await loadRates();
renderProductDetails();
calculate();
