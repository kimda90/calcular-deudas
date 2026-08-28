import { createHash } from 'node:crypto';

export const BCRA_PERSONAL_LOANS_URL = 'https://api.bcra.gob.ar/transparencia/v1.0/Prestamos/Personales';

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function stableId(raw) {
  const key = [
    raw.codigoEntidad,
    raw.nombreCompleto,
    raw.nombreCorto,
    raw.denominacion,
    raw.beneficiario,
    raw.plazoMaximoOtorgable,
  ].join('|');
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

export function normalizeBcraResponse(payload, retrievedAt = new Date().toISOString()) {
  if (!payload || Number(payload.status) !== 200 || !Array.isArray(payload.results)) {
    const detail = Array.isArray(payload?.errorMessages) ? payload.errorMessages.join(' ') : 'Respuesta inválida.';
    throw new Error(`El BCRA no devolvió una respuesta válida: ${detail}`);
  }

  const products = payload.results.map((raw) => ({
    id: stableId(raw),
    entityCode: num(raw.codigoEntidad),
    entity: text(raw.descripcionEntidad) ?? 'Entidad sin nombre',
    infoDate: text(raw.fechaInformacion),
    name: text(raw.nombreCompleto) ?? text(raw.nombreCorto) ?? 'Préstamo personal',
    shortName: text(raw.nombreCorto),
    currency: text(raw.denominacion),
    minAmount: num(raw.montoMinimoOtorgable),
    maxAmount: num(raw.montoMaximoOtorgable),
    maxTermMonths: num(raw.plazoMaximoOtorgable),
    minMonthlyIncome: num(raw.ingresoMinimoMensual),
    minEmploymentMonths: num(raw.antiguedadLaboralMinimaMeses),
    maxAge: num(raw.edadMaximaSolicitada),
    installmentIncomeRatioPct: num(raw.relacionCuotaIngreso),
    beneficiary: text(raw.beneficiario),
    maxPrepaymentFeePct: num(raw.cargoMaximoCancelacionAnticipada),
    teaPct: num(raw.tasaEfectivaAnualMaxima),
    rateType: text(raw.tipoTasa),
    cfteaPct: num(raw.costoFinancieroEfectivoTotalMaximo),
    initialInstallmentPer10000: num(raw.cuotaInicial),
    territory: text(raw.territorioValidez),
    moreInfo: text(raw.masInformacion),
  }));

  products.sort((a, b) =>
    a.entity.localeCompare(b.entity, 'es') ||
    a.name.localeCompare(b.name, 'es') ||
    String(a.beneficiary ?? '').localeCompare(String(b.beneficiary ?? ''), 'es')
  );

  return {
    version: 1,
    source: 'BCRA — Régimen de Transparencia',
    sourceUrl: BCRA_PERSONAL_LOANS_URL,
    retrievedAt,
    productCount: products.length,
    scope: 'Todos los préstamos personales devueltos por el endpoint del BCRA en la fecha de descarga.',
    products,
  };
}

export function buenosAiresDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
