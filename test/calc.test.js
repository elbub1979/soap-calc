import test from 'node:test';
import assert from 'node:assert/strict';
import { calcLye, recipeProperties, oilProperties, satUnsat, waterStats, fragranceAmount, toAllUnits, findOil, KOH_TO_NAOH, CORRECTIONS } from '../src/calc.js';
import { OILS } from '../src/oils.js';

const OLIVE = 34, COCONUT76 = 10, PALM = 36, CASTOR = 8;
const rows = (...pairs) => pairs.map(([id, amount]) => ({ id, amount: String(amount), weight: '' }));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const base = {
  oilWeight: 1000, oilWeightUnit: 'Grams', lyeType: 'NaOH', is90KOH: false,
  superFat: 5, waterOption: 'water_percentage', waterValue: '38', fragranceRatio: 30,
  selectedOils: rows([OLIVE, 40], [COCONUT76, 30], [PALM, 30]),
};

test('база: 149 масел, уникальные id, SAP > 0', () => {
  assert.equal(OILS.length, 149);
  assert.equal(new Set(OILS.map((o) => o.id)).size, 149);
  assert.ok(OILS.every((o) => o.sap > 0));
});

test('NaOH: классический рецепт 40/30/30, 1000 г, SF 5%', () => {
  // KOH SAP = 0.4·0.190 + 0.3·0.257 + 0.3·0.199 = 0.2128
  const r = calcLye(base);
  near(r.sap, 0.2128);
  near(r.lye, 0.2128 * 1000 * (40 / 56.1) * 0.95); // ≈ 144.14 г
  near(r.water, 380);
  assert.equal(r.fragranceAmount, 30); // 30 г/кг × 1 кг
});

test('KOH и 90% KOH', () => {
  const koh = calcLye({ ...base, lyeType: 'KOH' });
  near(koh.lye, 212.8 * 0.95);
  const koh90 = calcLye({ ...base, lyeType: 'KOH', is90KOH: true });
  near(koh90.lye, (212.8 / 0.9) * 0.95);
});

test('режимы воды: концентрация и соотношение', () => {
  const lye = calcLye(base).lye;
  near(calcLye({ ...base, waterOption: 'lye_concentration', waterValue: '33' }).water, (0.67 / 0.33) * lye);
  near(calcLye({ ...base, waterOption: 'water_lye_ratio', waterValue: '2:1' }).water, 2 * lye);
  const s = waterStats({ oilWeight: 1000, lyeWeight: 100, waterWeight: 200 });
  near(s.waterPercent, 20); near(s.lyeConcentration, 100 / 3); near(s.waterLyeRatio, 2);
});

test('проценты должны давать 100%', () => {
  const r = calcLye({ ...base, selectedOils: rows([OLIVE, 40], [COCONUT76, 30]) });
  assert.match(r.error, /70%/);
  assert.equal(r.lye, 0);
});

test('режим весов: проценты и общий вес выводятся из весов', () => {
  const sel = [{ id: OLIVE, amount: '', weight: '300' }, { id: CASTOR, amount: '', weight: '100' }];
  const r = calcLye({ ...base, oilWeight: 0, selectedOils: sel });
  assert.equal(r.oilWeight, 400);
  near(r.sap, 0.75 * 0.19 + 0.25 * 0.18);
});

test('свойства масла и рецепта', () => {
  const coco = oilProperties(findOil(COCONUT76));
  assert.equal(coco.Hardness, 48 + 19 + 9 + 3);
  assert.equal(coco.Cleansing, 48 + 19);
  const castor = oilProperties(findOil(CASTOR));
  assert.equal(castor.Bubbly, 90); assert.equal(castor.Creamy, 90);
  assert.equal(oilProperties(findOil(5)).Hardness, 90); // Beeswax — ручное значение
  const { properties: p } = recipeProperties(base.selectedOils);
  assert.equal(p.Iodine, Math.round(0.4 * 85 + 0.3 * 10 + 0.3 * 53));
  assert.equal(p.INS, Math.round(0.4 * 105 + 0.3 * 258 + 0.3 * 145));
});

test('поправки применяются только по запросу', () => {
  const salmon = findOil(140);
  assert.equal(oilProperties(salmon).Iodine, 106);                       // как на сайте
  assert.equal(oilProperties(salmon, { corrected: true }).Iodine, 169);  // из записи базы
  assert.equal(oilProperties(findOil(40), { corrected: true }).Creamy, 5);
  assert.equal(oilProperties(findOil(144), { corrected: true }).INS, 88);
  const sel = rows([140, 50], [OLIVE, 50]);
  assert.equal(recipeProperties(sel).properties.Iodine, Math.round((106 + 85) / 2));
  assert.equal(recipeProperties(sel, { corrected: true }).properties.Iodine, Math.round((169 + 85) / 2));
  assert.deepEqual(Object.keys(CORRECTIONS).map(Number).sort((a, b) => a - b), [31, 40, 140, 142, 144, 145, 149]);
});

test('Sat:Unsat нормируется к 100', () => {
  assert.equal(satUnsat(40, 40, 10), '44 : 56');
  assert.equal(satUnsat(0, 0, 0), 'нет данных');
});

test('отдушка и единицы', () => {
  assert.equal(fragranceAmount(0.6, 2, 'Pounds').amount, 1.2);   // oz
  assert.equal(fragranceAmount(0.6, 32, 'Ounces').amount, 1.2);  // oz
  assert.equal(fragranceAmount(37.5, 500, 'Grams').amount, 18.75);
  assert.deepEqual(toAllUnits('Pounds', 1), { lb: 1, oz: 16, g: 453.59 });
  near(KOH_TO_NAOH, 0.71301, 1e-5);
});
