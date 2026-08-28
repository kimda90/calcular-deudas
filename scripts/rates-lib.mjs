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

function canonicalText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

export function canonicalLoanType(product) {
  const source = canonicalText([
    product?.name ?? product?.nombreCompleto,
    product?.shortName ?? product?.nombreCorto,
    product?.beneficiary ?? product?.beneficiario,
  ].filter(Boolean).join(' '));

  const rules = [
    { key: 'personal-uva', label: 'Personal UVA', pattern: /\buva\b|unidad de valor adquisitivo/ },
    { key: 'personal-sueldo', label: 'Personal con sueldo', pattern: /sueldo|haberes|nomina|acreditacion/ },
    { key: 'personal-jubilados', label: 'Personal jubilados/pensionados', pattern: /jubil|pension/ },
    { key: 'personal-monotributistas', label: 'Personal monotributistas/autónomos', pattern: /monotrib|autonom/ },
    { key: 'personal-empleados', label: 'Personal empleados', pattern: /emplead|relacion de dependencia/ },
    { key: 'personal-profesionales', label: 'Personal profesionales', pattern: /profesional/ },
  ];

  return rules.find(({ pattern }) => pattern.test(source)) ?? {
    key: 'personal-general',
    label: 'Préstamo personal',
  };
}

function rateForProduct(product) {
  return product?.cfteaPct ?? product?.teaPct ?? Number.POSITIVE_INFINITY;
}

function dedupeKey(product) {
  return [
    product.entityCode ?? canonicalText(product.entity),
    product.loanTypeKey,
    canonicalText(product.beneficiary),
    canonicalText(product.currency),
    canonicalText(product.rateType),
  ].join('|');
}

function mergeAliases(products) {
  return [...new Set(products.flatMap((product) => [
    ...(product.aliases ?? []),
    product.name,
    product.shortName,
  ]).filter(Boolean))];
}

export function dedupeLoanTypes(products) {
  const groups = new Map();

  for (const product of products ?? []) {
    const type = canonicalLoanType(product);
    const normalized = {
      ...product,
      loanType: type.label,
      loanTypeKey: type.key,
      aliases: mergeAliases([product]),
      variants: 1,
    };
    const key = dedupeKey(normalized);
    const group = groups.get(key) ?? [];
    group.push(normalized);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const selected = [...group].sort((a, b) => {
      const rateDiff = rateForProduct(a) - rateForProduct(b);
      if (rateDiff !== 0) return rateDiff;
      return String(b.infoDate ?? '').localeCompare(String(a.infoDate ?? ''));
    })[0];

    return {
      ...selected,
      aliases: mergeAliases(group),
      variants: group.length,
    };
  });
}

export function normalizeBcraResponse(payload, retrievedAt = new Date().toISOString()) {
  if (!payload || Number(payload.status) !== 200 || !Array.isArray(payload.results)) {
    const detail = Array.isArray(payload?.errorMessages) ? payload.errorMessages.join(' ') : 'Respuesta inválida.';
    throw new Error(`El BCRA no devolvió una respuesta válida: ${detail}`);
  }

  const rawProducts = payload.results.map((raw) => ({
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

  const products = dedupeLoanTypes(rawProducts);

  products.sort((a, b) =>
    a.entity.localeCompare(b.entity, 'es') ||
    a.loanType.localeCompare(b.loanType, 'es') ||
    String(a.beneficiary ?? '').localeCompare(String(b.beneficiary ?? ''), 'es')
  );

  return {
    version: 2,
    source: 'BCRA — Régimen de Transparencia',
    sourceUrl: BCRA_PERSONAL_LOANS_URL,
    retrievedAt,
    rawProductCount: rawProducts.length,
    productCount: products.length,
    scope: 'Préstamos personales del BCRA deduplicados por entidad, tipo normalizado, beneficiario, moneda y tipo de tasa. Dentro de cada grupo se conserva la menor CFTEA disponible.',
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
