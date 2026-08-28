import { simulateUnpaidDebt } from './lib/debt.js';

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const ratio = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });

const state = { snapshot: null, entities: [] };
const defaults = { amount: 100000, salary: 2000000, horizonMonths: 12 };

function safeNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function rateForProduct(product) {
  return product?.cfteaPct ?? product?.teaPct ?? null;
}

function bestProductPerEntity(products) {
  const byEntity = new Map();
  for (const product of products ?? []) {
    const rate = rateForProduct(product);
    if (!product?.entity || !Number.isFinite(rate) || rate < 0) continue;
    if (product.currency && !product.currency.toLocaleLowerCase('es').includes('peso')) continue;
    const current = byEntity.get(product.entity);
    if (!current || rate < current.rate) byEntity.set(product.entity, { entity: product.entity, rate, product });
  }
  return [...byEntity.values()].sort((a, b) => a.rate - b.rate || a.entity.localeCompare(b.entity, 'es'));
}

async function loadRates() {
  try {
    const response = await fetch('./data/rates.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.snapshot = await response.json();
    state.entities = bestProductPerEntity(state.snapshot.products ?? []);
    renderFreshness();
    calculate();
  } catch (error) {
    $('#freshness').textContent = 'Sin snapshot BCRA';
    $('#validationMessage').textContent = `No se pudo cargar el snapshot de tasas: ${error.message}`;
    state.entities = [];
    calculate();
  }
}

function renderFreshness() {
  const retrieved = state.snapshot?.retrievedAt ? new Date(state.snapshot.retrievedAt) : null;
  $('#freshness').textContent = retrieved && !Number.isNaN(retrieved.valueOf())
    ? `${state.entities.length} entidades · ${dateFmt.format(retrieved)}`
    : `${state.entities.length} entidades`;
}

function colorFor(index, total) {
  const hue = Math.round((index * 317.5) % 360);
  const light = total > 20 ? 48 : 44;
  return `hsl(${hue} 58% ${light}%)`;
}

function compactMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

function metric(label, value, detail = '') {
  return `<div class="metric"><strong>${value}</strong><span>${label}</span>${detail ? `<small>${detail}</small>` : ''}</div>`;
}

function buildSeries({ amount, months, recurring }) {
  return state.entities.map((entry) => {
    const simulation = simulateUnpaidDebt({ months, amount, annualEffectivePct: entry.rate, recurring });
    return { ...entry, simulation, finalDebt: simulation.summary.finalDebt };
  }).sort((a, b) => a.finalDebt - b.finalDebt);
}

function renderSummary(series, amount, salary, months, recurring) {
  if (!series.length) {
    $('#metricGrid').innerHTML = metric('Sin datos', '—', 'Ejecutá la actualización de tasas para comparar entidades.');
    return;
  }

  const cheapest = series[0];
  const mostExpensive = series.at(-1);
  const capital = recurring ? amount * months : amount;
  $('#metricGrid').innerHTML = [
    metric('Capital que recibís', money.format(capital), recurring ? `${money.format(amount)} por mes` : 'una sola vez'),
    metric('Menor deuda final', money.format(cheapest.finalDebt), `${cheapest.entity} · ${pct.format(cheapest.rate)}% CFTEA`),
    metric('Mayor deuda final', money.format(mostExpensive.finalDebt), `${mostExpensive.entity} · ${pct.format(mostExpensive.rate)}% CFTEA`),
  ].join('');

  $('#salaryBadge').textContent = `Salario ${money.format(salary)}`;
}

function renderChart(series, salary, months) {
  const chart = $('#chart');
  if (!series.length) {
    chart.innerHTML = '<div class="empty-state">Todavía no hay entidades para graficar.</div>';
    return;
  }

  const width = 920;
  const height = 430;
  const pad = { left: 78, right: 24, top: 24, bottom: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxDebt = Math.max(...series.map((item) => item.finalDebt), salary, 1);
  const maxY = maxDebt * 1.08;
  const x = (month) => pad.left + (month / months) * innerW;
  const y = (value) => pad.top + innerH - (value / maxY) * innerH;
  const ticks = Array.from({ length: 6 }, (_, i) => (maxY / 5) * i);

  const grid = ticks.map((tick) => {
    const yy = y(tick);
    return `<line class="grid" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"/><text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end">${compactMoney(tick)}</text>`;
  }).join('');

  const xLabels = Array.from({ length: months + 1 }, (_, month) => {
    const step = months > 18 ? 6 : months > 12 ? 3 : 2;
    if (month !== 0 && month !== months && month % step !== 0) return '';
    return `<text x="${x(month)}" y="${height - 16}" text-anchor="middle">${month}</text>`;
  }).join('');

  const salaryY = y(salary);
  const salaryLine = `<line class="salary-line" x1="${pad.left}" y1="${salaryY}" x2="${width - pad.right}" y2="${salaryY}"/><text class="salary-label" x="${width - pad.right}" y="${Math.max(14, salaryY - 7)}" text-anchor="end">Salario ${compactMoney(salary)}</text>`;

  const lines = series.map((item, index) => {
    const points = item.simulation.rows.map((row) => `${x(row.month)},${y(row.outstandingDebt)}`).join(' ');
    const color = colorFor(index, series.length);
    return `<polyline class="entity-line" style="--line-color:${color}" points="${points}" tabindex="0"><title>${escapeHtml(item.entity)} · CFTEA ${pct.format(item.rate)}% · ${money.format(item.finalDebt)}</title></polyline>`;
  }).join('');

  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${salaryLine}${lines}${xLabels}</svg>`;
  const cheapest = series[0];
  const mostExpensive = series.at(-1);
  chart.setAttribute('aria-label', `Comparación de ${series.length} entidades. La deuda final va de ${money.format(cheapest.finalDebt)} a ${money.format(mostExpensive.finalDebt)}. El salario de referencia es ${money.format(salary)}.`);
}

function renderTable(series, salary) {
  $('#entityCount').textContent = `${series.length} entidades`;
  const tbody = $('#comparisonTable');
  if (!series.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Sin tasas disponibles.</td></tr>';
    return;
  }

  tbody.innerHTML = series.map((item, index) => {
    const salaryMultiple = salary > 0 ? item.finalDebt / salary : null;
    const color = colorFor(index, series.length);
    return `<tr>
      <td><span class="entity-name"><i style="background:${color}"></i>${escapeHtml(item.entity)}</span><small>${escapeHtml(item.product.shortName ?? item.product.name ?? '')}</small></td>
      <td class="num">${pct.format(item.rate)}%</td>
      <td class="num"><strong>${money.format(item.finalDebt)}</strong></td>
      <td class="num">${salaryMultiple == null ? '—' : `${ratio.format(salaryMultiple)}× salario`}</td>
    </tr>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function calculate(event) {
  event?.preventDefault();
  const amount = safeNumber($('#amount'), defaults.amount);
  const salary = safeNumber($('#salary'), defaults.salary);
  const months = Math.max(1, Number($('#horizonMonths').value));
  const recurring = document.querySelector('input[name="mode"]:checked')?.value === 'recurring';

  $('#validationMessage').textContent = amount <= 0 ? 'Ingresá un monto mayor a cero.' : '';
  $('#resultMonths').textContent = months;
  $('#chartTitle').textContent = recurring ? `Pedir ${money.format(amount)} todos los meses` : `Pedir ${money.format(amount)} una sola vez`;
  $('#chartSubtitle').textContent = `No se paga nada durante ${months} meses. La línea punteada muestra un salario fijo de ${money.format(salary)}.`;

  const series = amount > 0 ? buildSeries({ amount, months, recurring }) : [];
  renderSummary(series, amount, salary, months, recurring);
  renderChart(series, salary, months);
  renderTable(series, salary);
}

$('#simulationForm').addEventListener('submit', calculate);
for (const control of ['#amount', '#salary', '#horizonMonths']) $(control).addEventListener('input', calculate);
for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', calculate);

await loadRates();
calculate();
