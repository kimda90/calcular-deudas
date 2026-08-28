import { bestProductPerEntity } from './lib/market.js';

const $ = (selector) => document.querySelector(selector);
const pct = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'America/Argentina/Buenos_Aires' });
let entities = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function renderTable() {
  const query = $('#tableSearch').value.trim().toLocaleLowerCase('es');
  const filtered = entities.filter(({ entity, product }) => [entity, product.name, product.shortName, product.beneficiary]
    .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query));

  $('#entitiesTable').innerHTML = filtered.length ? filtered.map(({ entity, rate, product }) => `<tr>
    <td><strong>${escapeHtml(entity)}</strong></td>
    <td>${escapeHtml(product.shortName ?? product.name ?? '—')}</td>
    <td>${escapeHtml(product.beneficiary ?? '—')}</td>
    <td class="num"><strong>${pct.format(rate)}%</strong></td>
    <td class="num">${product.teaPct == null ? '—' : `${pct.format(product.teaPct)}%`}</td>
    <td class="num">${product.maxTermMonths == null ? '—' : `${product.maxTermMonths} meses`}</td>
    <td>${escapeHtml(product.infoDate ?? '—')}</td>
  </tr>`).join('') : '<tr><td colspan="7" class="empty-row">No hay resultados.</td></tr>';
}

try {
  const response = await fetch('./data/rates.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const snapshot = await response.json();
  entities = bestProductPerEntity(snapshot.products ?? []);
  const retrieved = snapshot.retrievedAt ? new Date(snapshot.retrievedAt) : null;
  $('#freshness').textContent = retrieved && !Number.isNaN(retrieved.valueOf())
    ? `${entities.length} entidades · ${dateFmt.format(retrieved)}`
    : `${entities.length} entidades`;
  renderTable();
} catch (error) {
  $('#freshness').textContent = 'Sin snapshot BCRA';
  $('#entitiesTable').innerHTML = `<tr><td colspan="7" class="empty-row">No se pudo cargar el snapshot: ${escapeHtml(error.message)}</td></tr>`;
}

$('#tableSearch').addEventListener('input', renderTable);
