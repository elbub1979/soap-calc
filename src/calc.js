// Расчётное ядро калькулятора. Без DOM — используется и в UI, и в тестах.
// Формулы повторяют soapcalc.net (проверено паритетным тестом на оригинальном коде).
import { OILS } from './oils.js';

export const KOH_TO_NAOH = 40 / 56.1; // молярные массы NaOH / KOH
export const MAX_OILS = 14;

export const UNITS = {
  Pounds: { short: 'lb', toLb: (x) => x, fromLb: (x) => x },
  Ounces: { short: 'oz', toLb: (x) => x / 16, fromLb: (x) => x * 16 },
  Grams: { short: 'g', toLb: (x) => x / 453.592, fromLb: (x) => x * 453.592 },
};

export const WATER_MODES = {
  water_percentage: '% от масел',
  lye_concentration: 'Концентрация щёлочи',
  water_lye_ratio: 'Вода : щёлочь',
};

export const QUALITY_KEYS = ['Hardness', 'Cleansing', 'Conditioning', 'Bubbly', 'Creamy', 'Iodine', 'INS'];
export const FA_KEYS = ['Lauric', 'Myristic', 'Palmitic', 'Stearic', 'Ricinoleic', 'Oleic', 'Linoleic', 'Linolenic'];
export const RANGES = {
  Hardness: { min: 29, max: 54 },
  Cleansing: { min: 12, max: 22 },
  Conditioning: { min: 44, max: 69 },
  Bubbly: { min: 14, max: 46 },
  Creamy: { min: 16, max: 48 },
  Iodine: { min: 41, max: 70 },
  INS: { min: 136, max: 165 },
};

const ALL_PROP_KEYS = [...QUALITY_KEYS, ...FA_KEYS, 'Saturated', 'MonoUnsaturated', 'PolyUnsaturated'];
const EMPTY_PROPS = Object.fromEntries(ALL_PROP_KEYS.map((k) => [k, 0]));

// Ручные значения SoapCalc для масел, чьи свойства не выводятся из 8 жирных кислот
// (воски, чистые кислоты, масла с эруковой кислотой и т.п.).
const OVERRIDES = {
  31: { Conditioning: 98, Creamy: 2, Hardness: 2, INS: 77, Iodine: 92, PolyUnsaturated: 100 },
  65: { Hardness: 100, Cleansing: 100, Bubbly: 100, Lauric: 2, Myristic: 1, INS: 324, Iodine: 1, Saturated: 90 },
  138: { Hardness: 7, Creamy: 6, Conditioning: 93, Oleic: 14, Linoleic: 11, Linolenic: 9, INS: 67, Iodine: 105, Saturated: 6, MonoUnsaturated: 70, PolyUnsaturated: 24 },
  40: { Hardness: 5, Creamy: 1, Conditioning: 95, Oleic: 17, Linoleic: 13, Linolenic: 9, INS: 69, Iodine: 106, Saturated: 7, MonoUnsaturated: 68, PolyUnsaturated: 25 },
  5: { Hardness: 90, Creamy: 50, Conditioning: 50, INS: 84, Iodine: 10 },
  140: { Hardness: 28, Creamy: 3, Conditioning: 72, Myristic: 5, Palmitic: 19, Stearic: 2, Oleic: 23, Linoleic: 2, Linolenic: 1, INS: 69, Iodine: 106, Saturated: 28, MonoUnsaturated: 32, PolyUnsaturated: 40 },
  142: { Hardness: 68, Creamy: 60, Conditioning: 60, INS: 12, Iodine: 106 },
  145: { Hardness: 6, Creamy: 80, Conditioning: 94, Palmitic: 3, Stearic: 2, Oleic: 18, Linoleic: 11, Linolenic: 4, INS: 70, Iodine: 98 },
  149: { Hardness: 6, Cleansing: 2, Creamy: 4, Bubbly: 2, Conditioning: 83, Lauric: 1, Myristic: 1, Palmitic: 2, Stearic: 2, Oleic: 44, Linoleic: 2, Linolenic: 2, INS: 107, Iodine: 68, Saturated: 54, MonoUnsaturated: 42, PolyUnsaturated: 2 },
  101: { Hardness: 54, Creamy: 43, Conditioning: 44, Palmitic: 8, Stearic: 35, Oleic: 42, Linoleic: 2, INS: 153, Iodine: 39, Saturated: 54, MonoUnsaturated: 42, PolyUnsaturated: 2 },
};

// Поправки к данным оригинала. По умолчанию НЕ применяются (цифры совпадают с soapcalc.net);
// включаются опцией { corrected: true }. Для каждой — откуда взято значение и насколько уверенно.
export const CORRECTIONS = {
  140: {
    patch: { Iodine: 169, INS: 16 },
    why: 'Йод 106 / INS 69 в калькуляторе скопированы у рапсового масла; собственная запись Salmon Oil в базе сайта (страница Oil List) даёт 169 / 16.',
    confidence: 'противоречие внутри сайта',
  },
  142: {
    patch: { Iodine: 32 },
    why: 'Йод 106 в калькуляторе; собственная запись Candelilla Wax в базе сайта даёт 32 (INS 12 совпадает).',
    confidence: 'противоречие внутри сайта',
  },
  40: {
    patch: { Creamy: 5 },
    why: 'По формуле сайта Creamy = пальмитиновая + стеариновая = 4 + 1 = 5, а не 1.',
    confidence: 'противоречие с формулой сайта',
  },
  145: {
    patch: { Creamy: 5, Saturated: 5, MonoUnsaturated: 80, PolyUnsaturated: 15 },
    why: 'Creamy 80 противоречит формуле (3 + 2 = 5); масло на ~55–60% состоит из эруковой кислоты (мононенасыщенной), поэтому Sat/Mono/Poly ≈ 5 / 80 / 15 вместо 0 / 0 / 0.',
    confidence: 'формула сайта + литература',
  },
  149: {
    patch: { Hardness: 40, Saturated: 40, MonoUnsaturated: 44, PolyUnsaturated: 4 },
    why: 'Saturated 54 / Mono 42 / Poly 2 точно повторяют Cupuacu Butter и не сходятся с Hardness 6. По литературе пракакси содержит ~20% бегеновой и ~14% лигноцериновой кислот (насыщенные, не входят в 8 учитываемых), олеиновой ~44%.',
    confidence: 'противоречие внутри сайта + литература',
  },
  31: {
    patch: { Saturated: 2, MonoUnsaturated: 80, PolyUnsaturated: 18 },
    why: 'Записано как 100% полиненасыщенное; по литературе масло пенника лугового — в основном мононенасыщенное (эйкозеновая ~60%, эруковая ~15%), полиненасыщенных ~15–20%.',
    confidence: 'литература',
  },
  144: {
    patch: { INS: 88 },
    why: 'INS = 0 в базе; по правилу самого сайта, если значения нет в справочнике, INS оценивается как KOH SAP × 1000 − йод = 144 − 56 = 88.',
    confidence: 'правило сайта',
  },
};

const OIL_BY_ID = new Map(OILS.map((o) => [o.id, o]));
export const findOil = (id) => OIL_BY_ID.get(id);

export const num = (v, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const isActive = (row) => row && row.id != null;

/**
 * Нормализует строки рецепта: { id, amount (%), weight }.
 * Если заданы проценты — они главные и должны давать 100%.
 * Иначе проценты считаются из весов, а общий вес = сумма весов.
 */
export function resolveOils(rows, oilWeight) {
  const active = rows.filter(isActive);
  const warnings = [];
  let total = num(oilWeight);
  if (active.length === 0) return { activeOils: [], oilWeight: total, warnings, error: 'Не выбрано ни одного масла' };

  const hasPct = active.some((r) => num(r.amount) > 0);
  const hasWt = active.some((r) => num(r.weight) > 0);
  let result;

  if (hasPct) {
    // Как на сайте: если заданы и проценты, и веса, и они расходятся — предупреждаем, считаем по процентам.
    if (hasWt && !(total <= 0 || active.every((r) => Math.abs(num(r.weight) - (num(r.amount) / 100) * total) <= 0.005))) {
      warnings.push('Заданы и проценты, и веса, и они не сходятся; расчёт по процентам.');
    }
    const sum = parseFloat(active.reduce((a, r) => a + num(r.amount), 0).toFixed(1));
    if (sum !== 100) {
      const diff = parseFloat((100 - sum).toFixed(4));
      return {
        activeOils: [], oilWeight: total, warnings,
        error: `Сумма процентов ${sum}%, а не 100%. Нужно ${diff > 0 ? 'добавить' : 'убрать'} ${Math.abs(diff)}%.`,
      };
    }
    result = active;
  } else {
    if (!hasWt) return { activeOils: [], oilWeight: total, warnings, error: 'Не заданы ни проценты, ни веса масел' };
    const sum = active.reduce((a, r) => a + num(r.weight), 0);
    result = active.map((r) => ({ ...r, amount: String((num(r.weight) / sum) * 100) }));
    total = sum;
  }
  return { activeOils: result, oilWeight: total, warnings, error: null };
}

/**
 * Перевод введённых весов в проценты так, как это делает интерфейс soapcalc.net:
 * каждый процент округляется до 0.01, а остаток до 100 отдаётся самому крупному маслу.
 * Щёлочь на сайте считается уже от этих округлённых процентов, поэтому для точного
 * совпадения цифр повторяем это поведение.
 */
export function weightsToPercents(rows) {
  const active = rows.filter(isActive);
  const total = active.reduce((a, r) => a + num(r.weight), 0);
  let maxI = -1, maxV = -1;
  const pcts = active.map((r, i) => {
    const p = total > 0 ? parseFloat(((num(r.weight) / total) * 100).toFixed(2)) : 0;
    if (p > maxV) { maxV = p; maxI = i; }
    return p;
  });
  if (total > 0 && maxI >= 0) {
    const rem = parseFloat((100 - pcts.reduce((a, b) => a + b, 0)).toFixed(2));
    if (rem !== 0) pcts[maxI] = parseFloat((pcts[maxI] + rem).toFixed(2));
  }
  return { total, pcts };
}

/** Количество отдушки. Ratio: oz/lb для фунтов/унций, g/kg для граммов. */
export function fragranceAmount(ratio, oilWeight, unit) {
  const w = num(oilWeight);
  const r = num(ratio);
  if (unit === 'Grams') return { amount: +((w / 1000) * r).toFixed(2), unit: 'Grams' };
  if (unit === 'Ounces') return { amount: +((w / 16) * r).toFixed(3), unit: 'Ounces' };
  return { amount: +(r * w).toFixed(3), unit: 'Ounces' };
}

export function waterFor(mode, value, oilWeight, lye) {
  if (mode === 'water_percentage') return (num(value) / 100) * oilWeight;
  if (mode === 'lye_concentration') {
    const c = num(value) / 100;
    return c > 0 && c < 1 ? ((1 - c) / c) * lye : 0;
  }
  if (mode === 'water_lye_ratio') {
    if (typeof value !== 'string' || !value.includes(':')) return 0;
    const [a, b] = value.split(':').map(Number);
    return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b) * lye : 0;
  }
  return 0;
}

/** Основной расчёт: щёлочь, вода, отдушка (в единицах веса масел; отдушка — в своих). */
export function calcLye({ oilWeight, oilWeightUnit, selectedOils, lyeType, is90KOH, superFat, waterOption, waterValue, fragranceRatio }) {
  const { activeOils, oilWeight: total, warnings, error } = resolveOils(selectedOils, oilWeight);
  if (error || activeOils.length === 0) return { sap: 0, lye: 0, water: 0, fragranceAmount: 0, oilWeight: total, error, warnings };

  const sap = activeOils.reduce((acc, r) => {
    const oil = findOil(r.id);
    if (!oil) { warnings.push(`Масло с id ${r.id} не найдено и пропущено.`); return acc; }
    return acc + (num(r.amount) / 100) * oil.sap;
  }, 0);

  let lye = sap * total;
  if (lyeType === 'NaOH') lye *= KOH_TO_NAOH;
  if (lyeType === 'KOH' && is90KOH) lye /= 0.9;
  lye *= 1 - num(superFat) / 100;

  const water = waterFor(waterOption, waterValue, total, lye);
  const frag = fragranceAmount(fragranceRatio, total, oilWeightUnit);
  return { sap, lye, water, fragranceAmount: frag.amount, fragranceUnit: frag.unit, oilWeight: total, error: null, warnings };
}

export function waterStats({ oilWeight, lyeWeight, waterWeight }) {
  const o = num(oilWeight), l = num(lyeWeight), w = num(waterWeight);
  return {
    waterPercent: o > 0 ? (w / o) * 100 : 0,
    lyeConcentration: l + w > 0 ? (l / (l + w)) * 100 : 0,
    waterLyeRatio: l > 0 ? w / l : 0,
  };
}

/** Свойства одного масла (колонка «One»). opts.corrected — применить CORRECTIONS. */
export function oilProperties(oil, { corrected = false } = {}) {
  const p = { ...EMPTY_PROPS };
  if (OVERRIDES[oil.id]) {
    Object.assign(p, OVERRIDES[oil.id]);
  } else {
    const i = (k) => parseInt(oil[k], 10) || 0;
    const [la, my, pa, st, ri, ol, li, ln] = ['lauric', 'myristic', 'palmitic', 'stearic', 'ricinoleic', 'oleic', 'linoleic', 'linolenic'].map(i);
    Object.assign(p, {
      Hardness: la + my + pa + st,
      Cleansing: la + my,
      Bubbly: la + my + ri,
      Creamy: pa + st + ri,
      Conditioning: ol + li + ln + ri,
      Lauric: la, Myristic: my, Palmitic: pa, Stearic: st, Ricinoleic: ri, Oleic: ol, Linoleic: li, Linolenic: ln,
      Saturated: la + my + pa + st,
      MonoUnsaturated: ol + ri,
      PolyUnsaturated: li + ln,
      INS: oil.INS,
      Iodine: oil.iodine,
    });
  }
  if (corrected && CORRECTIONS[oil.id]) Object.assign(p, CORRECTIONS[oil.id].patch);
  return p;
}

/** Свойства рецепта (колонка «All»): средневзвешенное по процентам, округлено до целых. */
export function recipeProperties(rows, opts = {}) {
  const { activeOils, warnings, error } = resolveOils(rows, 0);
  const props = { ...EMPTY_PROPS };
  if (error || activeOils.length === 0) return { properties: props, error: error || 'Нет масел', warnings };
  const sum = activeOils.reduce((a, r) => a + num(r.amount), 0);
  if (sum === 0) return { properties: props, error: 'Все количества нулевые', warnings };
  for (const r of activeOils) {
    const oil = findOil(r.id);
    if (!oil) { warnings.push(`Масло с id ${r.id} не найдено и пропущено.`); continue; }
    const p = oilProperties(oil, opts);
    const k = num(r.amount) / sum;
    for (const key in props) props[key] += p[key] * k;
  }
  for (const key in props) props[key] = parseFloat(props[key].toFixed(0));
  return { properties: props, error: null, warnings };
}

/** Соотношение насыщенные : ненасыщенные, нормированное к 100. */
export function satUnsat(sat, mono, poly) {
  const unsat = mono + poly;
  const total = sat + unsat;
  if (total === 0) return 'нет данных';
  const rest = 100 - total;
  const r0 = (x) => Math.round(x);
  return `${sat + r0((sat / total) * rest)} : ${unsat + r0((unsat / total) * rest)}`;
}

/** Перевод веса из единицы рецепта в lb / oz / g. */
export function toAllUnits(unit, value) {
  const lb = (UNITS[unit] || UNITS.Pounds).toLb(value);
  return { lb: +lb.toFixed(3), oz: +(lb * 16).toFixed(2), g: +(lb * 453.592).toFixed(2) };
}
