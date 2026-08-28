export function rateForProduct(product) {
  return product?.cfteaPct ?? product?.teaPct ?? null;
}

export function bestProductPerEntity(products = []) {
  const byEntity = new Map();
  for (const product of products) {
    const rate = rateForProduct(product);
    if (!product?.entity || !Number.isFinite(rate) || rate < 0) continue;
    if (product.currency && !product.currency.toLocaleLowerCase('es').includes('peso')) continue;
    const current = byEntity.get(product.entity);
    if (!current || rate < current.rate) {
      byEntity.set(product.entity, { entity: product.entity, rate, product });
    }
  }
  return [...byEntity.values()].sort((a, b) => a.rate - b.rate || a.entity.localeCompare(b.entity, 'es'));
}

export function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const clamped = Math.min(1, Math.max(0, Number(q)));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function percentileDebtRows(series, quantiles = [0.1, 0.25, 0.5, 0.75, 0.9]) {
  if (!series.length) return [];
  const rowCount = Math.min(...series.map((item) => item.simulation.rows.length));
  return Array.from({ length: rowCount }, (_, index) => {
    const month = series[0].simulation.rows[index].month;
    const values = series.map((item) => item.simulation.rows[index].outstandingDebt);
    const row = { month };
    for (const q of quantiles) row[`p${Math.round(q * 100)}`] = quantile(values, q);
    return row;
  });
}

export function representativeEntityNames(entities, quantiles = [0.25, 0.5, 0.75]) {
  if (!entities.length) return [];
  const sorted = entities.slice().sort((a, b) => a.rate - b.rate || a.entity.localeCompare(b.entity, 'es'));
  const names = [];
  for (const q of quantiles) {
    const index = Math.round((sorted.length - 1) * Math.min(1, Math.max(0, q)));
    const name = sorted[index]?.entity;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}
