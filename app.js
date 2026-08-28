import { simulateUnpaidDebt } from './lib/debt.js';
import { bestProductPerEntity, percentileDebtRows, representativeEntityNames } from './lib/market.js';

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const ratio = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });

const state = { snapshot: null, entities: [], selected: new Set(), initializedSelection: false };
const defaults = { amount: 100000, salary: 2000000, horizonMonths: 12 };

function safeNumber(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function entityColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 58% 46%)`;
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

async function loadRates() {
  try {
    const response = await fetch('./data/rates.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.snapshot = await response.json();
    state.entities = bestProductPerEntity(state.snapshot.products ?? []);
    if (!state.initializedSelection) {
      state.selected = new Set(representativeEntityNames(state.entities));
      state.initializedSelection = true;
    }
    renderFreshness();
    renderEntityOptions();
    calculate();
  } catch (error) {
    $('#freshness').textContent = 'Sin snapshot BCRA';
    $('#validationMessage').textContent = `No se pudo cargar el snapshot de tasas: ${error.message}`;
    state.entities = [];
    renderEntityOptions();
    calculate();
  }
}

function renderFreshness() {
  const retrieved = state.snapshot?.retrievedAt ? new Date(state.snapshot.retrievedAt) : null;
  $('#freshness').textContent = retrieved && !Number.isNaN(retrieved.valueOf())
    ? `${state.entities.length} entidades · ${dateFmt.format(retrieved)}`
    : `${state.entities.length} entidades`;
}

function renderEntityOptions() {
  const query = ($('#entitySearch')?.value ?? '').trim().toLocaleLowerCase('es');
  const visible = state.entities.filter(({ entity, product }) => [entity, product.shortName, product.name]
    .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query));

  $('#entityOptions').innerHTML = visible.length ? visible.map(({ entity, rate, product }) => {
    const checked = state.selected.has(entity) ? ' checked' : '';
    return `<label class="entity-option">
      <input type="checkbox" value="${escapeHtml(entity)}"${checked}>
      <span><strong>${escapeHtml(entity)}</strong><small>${pct.format(rate)}% CFTEA · ${escapeHtml(product.shortName ?? product.name ?? '')}</small></span>
    </label>`;
  }).join('') : '<p class="picker-empty">No hay entidades para esa búsqueda.</p>';

  for (const checkbox of $('#entityOptions').querySelectorAll('input[type="checkbox"]')) {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(checkbox.value);
      else state.selected.delete(checkbox.value);
      renderSelectionSummary();
      calculate();
    });
  }
  renderSelectionSummary();
}

function renderSelectionSummary() {
  const count = state.selected.size;
  $('#selectionSummary').textContent = `${count} ${count === 1 ? 'seleccionada' : 'seleccionadas'}`;
}

function selectSample() {
  state.selected = new Set(representativeEntityNames(state.entities));
  renderEntityOptions();
  calculate();
}

function selectAll() {
  state.selected = new Set(state.entities.map((item) => item.entity));
  renderEntityOptions();
  calculate();
}

function clearSelection() {
  state.selected.clear();
  renderEntityOptions();
  calculate();
}

function buildAllSeries({ amount, months, recurring }) {
  return state.entities.map((entry) => {
    const simulation = simulateUnpaidDebt({ months, amount, annualEffectivePct: entry.rate, recurring });
    return { ...entry, simulation, finalDebt: simulation.summary.finalDebt };
  }).sort((a, b) => a.finalDebt - b.finalDebt);
}

function selectedSeries(allSeries) {
  return allSeries.filter((item) => state.selected.has(item.entity));
}

function renderSummary(allSeries, amount, salary, months, recurring) {
  if (!allSeries.length) {
    $('#metricGrid').innerHTML = metric('Sin datos', '—', 'Ejecutá la actualización de tasas para comparar entidades.');
    return;
  }
  const percentiles = percentileDebtRows(allSeries);
  const last = percentiles.at(-1);
  const capital = recurring ? amount * months : amount;
  const medianRatio = salary > 0 ? last.p50 / salary : null;
  $('#metricGrid').innerHTML = [
    metric('Capital que recibís', money.format(capital), recurring ? `${money.format(amount)} por mes` : 'una sola vez'),
    metric('Deuda mediana P50', money.format(last.p50), medianRatio == null ? 'mediana del mercado' : `${ratio.format(medianRatio)}× tu salario`),
    metric('Referencia P90', money.format(last.p90), '90% de las entidades queda por debajo'),
  ].join('');
  $('#salaryBadge').textContent = `Salario ${money.format(salary)}`;
}

function pathPoints(rows, key, x, y) {
  return rows.map((row) => `${x(row.month)},${y(row[key])}`).join(' ');
}

function renderSelectedLegend(series) {
  const container = $('#selectedLegend');
  if (!series.length) {
    container.innerHTML = '<span class="legend-hint">No hay entidades individuales agregadas. El gráfico muestra sólo la referencia de mercado.</span>';
    return;
  }
  container.innerHTML = series.map((item) => `<button class="entity-chip" type="button" data-entity="${escapeHtml(item.entity)}" style="--chip-color:${entityColor(item.entity)}">
    <i></i><span>${escapeHtml(item.entity)}</span><b aria-hidden="true">×</b><span class="sr-only">Quitar</span>
  </button>`).join('');
  for (const button of container.querySelectorAll('.entity-chip')) {
    button.addEventListener('click', () => {
      state.selected.delete(button.dataset.entity);
      renderEntityOptions();
      calculate();
    });
  }
}

function renderChart(allSeries, salary, months) {
  const chart = $('#chart');
  if (!allSeries.length) {
    chart.innerHTML = '<div class="empty-state">Todavía no hay entidades para graficar.</div>';
    renderSelectedLegend([]);
    return;
  }

  const percentiles = percentileDebtRows(allSeries);
  const chosen = selectedSeries(allSeries);
  const width = 920;
  const height = 440;
  const pad = { left: 78, right: 34, top: 24, bottom: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxSelected = chosen.length ? Math.max(...chosen.map((item) => item.finalDebt)) : 0;
  const maxDebt = Math.max(percentiles.at(-1)?.p90 ?? 0, maxSelected, salary, 1);
  const maxY = maxDebt * 1.1;
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

  const bandPoints = [
    ...percentiles.map((row) => `${x(row.month)},${y(row.p75)}`),
    ...percentiles.slice().reverse().map((row) => `${x(row.month)},${y(row.p25)}`),
  ].join(' ');

  const salaryY = y(salary);
  const salaryLine = `<line class="salary-line" x1="${pad.left}" y1="${salaryY}" x2="${width - pad.right}" y2="${salaryY}"/><text class="salary-label" x="${width - pad.right}" y="${Math.max(14, salaryY - 7)}" text-anchor="end">Salario ${compactMoney(salary)}</text>`;

  const market = `<polygon class="percentile-band" points="${bandPoints}"/>
    <polyline class="percentile-edge" points="${pathPoints(percentiles, 'p10', x, y)}"><title>P10</title></polyline>
    <polyline class="percentile-median" points="${pathPoints(percentiles, 'p50', x, y)}"><title>Mediana P50</title></polyline>
    <polyline class="percentile-edge" points="${pathPoints(percentiles, 'p90', x, y)}"><title>P90</title></polyline>`;

  const lines = chosen.map((item) => `<polyline class="entity-line" style="--line-color:${entityColor(item.entity)}" points="${item.simulation.rows.map((row) => `${x(row.month)},${y(row.outstandingDebt)}`).join(' ')}"><title>${escapeHtml(item.entity)} · CFTEA ${pct.format(item.rate)}% · ${money.format(item.finalDebt)}</title></polyline>`).join('');

  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${market}${salaryLine}${lines}${xLabels}</svg>`;
  const last = percentiles.at(-1);
  chart.setAttribute('aria-label', `Referencia de mercado para ${allSeries.length} entidades. La mediana termina en ${money.format(last.p50)}, P10 en ${money.format(last.p10)} y P90 en ${money.format(last.p90)}. Hay ${chosen.length} entidades individuales seleccionadas y el salario de referencia es ${money.format(salary)}.`);
  renderSelectedLegend(chosen);
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
  $('#chartSubtitle').textContent = `Distribución de ${state.entities.length} entidades durante ${months} meses. Podés superponer entidades individuales desde el filtro.`;

  const allSeries = amount > 0 ? buildAllSeries({ amount, months, recurring }) : [];
  renderSummary(allSeries, amount, salary, months, recurring);
  renderChart(allSeries, salary, months);
}

$('#simulationForm').addEventListener('submit', calculate);
for (const control of ['#amount', '#salary', '#horizonMonths']) $(control).addEventListener('input', calculate);
for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', calculate);
$('#entitySearch').addEventListener('input', renderEntityOptions);
$('#sampleEntities').addEventListener('click', selectSample);
$('#clearEntities').addEventListener('click', clearSelection);
$('#allEntities').addEventListener('click', selectAll);

await loadRates();
calculate();
