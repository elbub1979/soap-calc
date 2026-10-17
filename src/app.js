import { OILS } from './oils.js';
import {
  calcLye, recipeProperties, oilProperties, satUnsat, waterStats, toAllUnits, findOil, num,
  UNITS, WATER_MODES, QUALITY_KEYS, FA_KEYS, RANGES, MAX_OILS, KOH_TO_NAOH, CORRECTIONS,
} from './calc.js';

const STORAGE_KEY = 'soap-calc:v1';
const G_PER_KG_PER_OZ_PER_LB = 62.5; // 1 oz/lb = 62.5 г/кг

const QUALITY_INFO = {
  Hardness: ['Твёрдость', 'Чем выше, тем твёрже брусок.'],
  Cleansing: ['Очищение', 'Моет любое мыло, но при высоких значениях сильнее и может сушить.'],
  Conditioning: ['Уход', 'Чем выше, тем больше ухаживающих свойств.'],
  Bubbly: ['Пышная пена', 'Чем выше, тем пышнее и крупнее пена.'],
  Creamy: ['Кремовая пена', 'Чем выше, тем кремовее и стабильнее пена.'],
  Iodine: ['Йодное число', 'Ниже — твёрже брусок; сильно выше 70 — может быть мягким.'],
  INS: ['INS', 'Общепринятый идеал — 160. Оценивает физические качества бруска.'],
};
const FA_NAMES = {
  Lauric: 'Лауриновая 12:0', Myristic: 'Миристиновая 14:0', Palmitic: 'Пальмитиновая 16:0', Stearic: 'Стеариновая 18:0',
  Ricinoleic: 'Рицинолевая 18:1', Oleic: 'Олеиновая 18:1', Linoleic: 'Линолевая 18:2', Linolenic: 'Линоленовая 18:3',
};
const UNIT_RU = { Grams: 'г', Ounces: 'oz', Pounds: 'lb' };
const WATER_DEFAULTS = { water_percentage: '38', lye_concentration: '33', water_lye_ratio: '2:1' };

const defaults = () => ({
  recipeName: '', notes: '',
  lyeType: 'NaOH', is90KOH: false,
  unit: 'Grams', oilWeight: '1000',
  waterOption: 'water_percentage', waterValue: '38',
  superFat: '5', fragrance: '30',
  mode: 'pct',
  corrected: false, // применять CORRECTIONS к свойствам масел
  rows: [], // { id, pct, wt }
  selectedOilId: null,
});

let state = load() || defaults();

// ---------- утилиты ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const trimNum = (x, d = 2) => String(+(+x).toFixed(d));

// Приводит произвольный объект (из localStorage) к корректному состоянию.
function normalizeState(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  const str = (v, fallback) => (v == null ? fallback : String(v));
  d.recipeName = str(s.recipeName, '');
  d.notes = str(s.notes, '');
  d.lyeType = s.lyeType === 'KOH' ? 'KOH' : 'NaOH';
  d.is90KOH = d.lyeType === 'KOH' && !!s.is90KOH;
  d.unit = UNITS[s.unit] ? s.unit : d.unit;
  d.oilWeight = str(s.oilWeight, d.oilWeight);
  d.waterOption = WATER_MODES[s.waterOption] ? s.waterOption : d.waterOption;
  d.waterValue = str(s.waterValue, WATER_DEFAULTS[d.waterOption]);
  d.superFat = str(s.superFat, d.superFat);
  d.fragrance = str(s.fragrance, d.fragrance);
  d.mode = s.mode === 'wt' ? 'wt' : 'pct';
  d.corrected = !!s.corrected;
  d.rows = (Array.isArray(s.rows) ? s.rows : [])
    .filter((r) => r && findOil(+r.id))
    .slice(0, MAX_OILS)
    .map((r) => ({ id: +r.id, pct: str(r.pct, ''), wt: str(r.wt, '') }));
  d.selectedOilId = findOil(+s.selectedOilId) ? +s.selectedOilId : null;
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch { return null; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* приватный режим и т.п. */ }
}

function selectedOilsForCalc() {
  return state.rows.map((r) => (state.mode === 'pct'
    ? { id: r.id, amount: r.pct, weight: '' }
    : { id: r.id, amount: '', weight: r.wt }));
}

function inputForCalc() {
  return {
    oilWeight: num(state.oilWeight), oilWeightUnit: state.unit, selectedOils: selectedOilsForCalc(),
    lyeType: state.lyeType, is90KOH: state.is90KOH, superFat: num(state.superFat),
    waterOption: state.waterOption, waterValue: state.waterValue, fragranceRatio: num(state.fragrance),
  };
}

// ---------- параметры (колонка 1) ----------
function initSettings() {
  $('water-mode').innerHTML = Object.entries(WATER_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  document.querySelectorAll('input[name=lye]').forEach((el) => el.addEventListener('change', () => {
    state.lyeType = el.value;
    if (el.value === 'NaOH') state.is90KOH = false;
    update();
  }));
  $('koh90').addEventListener('change', (e) => { state.is90KOH = e.target.checked; update(); });

  bindText('oil-weight', 'oilWeight');
  $('unit').addEventListener('change', (e) => changeUnit(e.target.value));

  $('water-mode').addEventListener('change', (e) => {
    state.waterOption = e.target.value;
    state.waterValue = WATER_DEFAULTS[e.target.value];
    syncSettings();
    update();
  });
  bindText('water-value', 'waterValue');
  bindText('superfat', 'superFat');
  bindText('fragrance', 'fragrance');
  bindText('recipe-name', 'recipeName');
  bindText('notes', 'notes');

  document.querySelectorAll('input[name=mode]').forEach((el) => el.addEventListener('change', () => changeMode(el.value)));
  $('corrected').addEventListener('change', (e) => { state.corrected = e.target.checked; renderOilInfo(); update(); });
}

function bindText(id, key) {
  $(id).addEventListener('input', (e) => { state[key] = e.target.value; update(); });
}

function syncSettings() {
  document.querySelectorAll('input[name=lye]').forEach((el) => { el.checked = el.value === state.lyeType; });
  $('koh90').checked = state.is90KOH;
  $('koh90').disabled = state.lyeType !== 'KOH';
  $('oil-weight').value = state.oilWeight;
  $('unit').value = state.unit;
  $('water-mode').value = state.waterOption;
  $('water-value').value = state.waterValue;
  $('superfat').value = state.superFat;
  $('fragrance').value = state.fragrance;
  $('recipe-name').value = state.recipeName;
  $('notes').value = state.notes;
  document.querySelectorAll('input[name=mode]').forEach((el) => { el.checked = el.value === state.mode; });
  $('corrected').checked = state.corrected;
}

function changeUnit(unit) {
  const from = UNITS[state.unit], to = UNITS[unit];
  const conv = (v) => (v === '' ? '' : trimNum(to.fromLb(from.toLb(num(v))), unit === 'Grams' ? 2 : 5));
  state.oilWeight = conv(state.oilWeight);
  state.rows.forEach((r) => { r.wt = conv(r.wt); });
  // отдушка: oz/lb ↔ г/кг
  const wasG = state.unit === 'Grams', isG = unit === 'Grams';
  if (wasG !== isG) state.fragrance = trimNum(num(state.fragrance) * (isG ? G_PER_KG_PER_OZ_PER_LB : 1 / G_PER_KG_PER_OZ_PER_LB), 3);
  state.unit = unit;
  syncSettings();
  renderRecipe();
  update();
}

function changeMode(mode) {
  if (mode === state.mode) return;
  if (mode === 'wt') {
    const total = num(state.oilWeight);
    state.rows.forEach((r) => { r.wt = r.pct === '' || total <= 0 ? '' : trimNum((num(r.pct) / 100) * total, 2); });
  } else {
    const total = state.rows.reduce((a, r) => a + num(r.wt), 0);
    state.rows.forEach((r) => { r.pct = total > 0 ? trimNum((num(r.wt) / total) * 100, 2) : ''; });
    if (total > 0) state.oilWeight = trimNum(total, 2);
  }
  state.mode = mode;
  syncSettings();
  renderRecipe();
  update();
}

// ---------- список масел ----------
function renderOilList() {
  const q = $('oil-search').value.trim().toLowerCase();
  const inRecipe = new Set(state.rows.map((r) => r.id));
  const list = OILS.filter((o) => !q || o.name.toLowerCase().includes(q) || (o.inci_name || '').toLowerCase().includes(q));
  $('oil-list').innerHTML = list.map((o) => `
    <li role="option" data-id="${o.id}" aria-selected="${o.id === state.selectedOilId}" class="${inRecipe.has(o.id) ? 'in-recipe' : ''}${CORRECTIONS[o.id] ? ' has-fix' : ''}">
      <span class="name">${esc(o.name)}</span>
      <button type="button" class="add" data-add="${o.id}" title="Добавить в рецепт" aria-label="Добавить ${esc(o.name)}">+</button>
    </li>`).join('') || '<li class="none">Ничего не найдено</li>';
}

function renderOilInfo() {
  const oil = state.selectedOilId != null ? findOil(state.selectedOilId) : null;
  $('oil-info').innerHTML = oil ? `
    <div class="oil-title">${esc(oil.name)}</div>
    <div class="inci">${esc(oil.inci_name || '')}</div>
    <div class="sap"><span>SAP KOH <b>${oil.sap.toFixed(3)}</b></span><span>SAP NaOH <b>${(oil.sap * KOH_TO_NAOH).toFixed(3)}</b></span><span>йод <b>${oil.iodine}</b></span><span>INS <b>${oil.INS}</b></span></div>
    ${correctionNote(oil)}`
    : '<div class="hint">Выберите масло, чтобы увидеть SAP и свойства в колонке «Одно».</div>';
}

// Пояснение к поправке для масла: что меняется и почему.
function correctionNote(oil) {
  const c = CORRECTIONS[oil.id];
  if (!c) return '';
  const diff = Object.entries(c.patch).map(([k, v]) => {
    const orig = oilProperties(oil)[k];
    return `${QUALITY_INFO[k]?.[0] || FA_NAMES[k] || { Saturated: 'Насыщ.', MonoUnsaturated: 'Мононенасыщ.', PolyUnsaturated: 'Полиненасыщ.' }[k] || k}: ${orig} → ${v}`;
  }).join(', ');
  return `<div class="correction">✎ <b>${state.corrected ? 'Исправленные данные применены' : 'Есть поправка (выключена)'}</b>: ${esc(diff)}.<br>${esc(c.why)} <i>(${esc(c.confidence)})</i></div>`;
}

function initOilList() {
  $('oil-search').addEventListener('input', renderOilList);
  const list = $('oil-list');
  list.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { addOil(+add.dataset.add); return; }
    const li = e.target.closest('li[data-id]');
    if (li) selectOil(+li.dataset.id);
  });
  list.addEventListener('dblclick', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li && !e.target.closest('[data-add]')) addOil(+li.dataset.id);
  });
  list.addEventListener('keydown', (e) => {
    const items = [...list.querySelectorAll('li[data-id]')];
    if (!items.length) return;
    const idx = items.findIndex((li) => +li.dataset.id === state.selectedOilId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
      selectOil(+next.dataset.id);
      next.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && state.selectedOilId != null) addOil(state.selectedOilId);
  });
}

function selectOil(id) {
  state.selectedOilId = id;
  $('oil-list').querySelectorAll('li[data-id]').forEach((li) => li.setAttribute('aria-selected', +li.dataset.id === id));
  renderOilInfo();
  update();
}

function addOil(id) {
  state.selectedOilId = id;
  if (state.rows.some((r) => r.id === id)) { flash(`«${findOil(id).name}» уже в рецепте`); return selectOil(id); }
  if (state.rows.length >= MAX_OILS) { flash(`Не больше ${MAX_OILS} масел`); return; }
  state.rows.push({ id, pct: '', wt: '' });
  renderRecipe();
  renderOilList();
  renderOilInfo();
  update();
  const inputs = $('recipe-body').querySelectorAll('input');
  inputs[inputs.length - 1]?.focus();
}

// ---------- состав ----------
function renderRecipe() {
  const key = state.mode === 'pct' ? 'pct' : 'wt';
  $('recipe-body').innerHTML = state.rows.map((r, i) => {
    const oil = findOil(r.id);
    const fix = CORRECTIONS[r.id] ? '<span class="fix-mark" title="Для этого масла есть поправка к данным оригинала">✎ </span>' : '';
    return `<tr data-i="${i}">
      <td class="oil-name" title="${esc(oil?.inci_name || '')}">${fix}${esc(oil?.name || `id ${r.id}`)}</td>
      <td class="num">${key === 'pct' ? `<span class="input"><input type="text" inputmode="decimal" value="${esc(r.pct)}" aria-label="Процент"></span>` : '<span class="derived"></span>'}</td>
      <td class="num">${key === 'wt' ? `<span class="input"><input type="text" inputmode="decimal" value="${esc(r.wt)}" aria-label="Вес"></span>` : '<span class="derived"></span>'}</td>
      <td><button type="button" class="remove" title="Убрать" aria-label="Убрать">−</button></td>
    </tr>`;
  }).join('');
  $('row-count').textContent = state.rows.length;
  $('recipe-empty').hidden = state.rows.length > 0;
  document.querySelectorAll('.unit-label').forEach((el) => { el.textContent = UNIT_RU[state.unit]; });
}

function initRecipe() {
  const body = $('recipe-body');
  body.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    state.rows[+tr.dataset.i][state.mode === 'pct' ? 'pct' : 'wt'] = e.target.value;
    update();
  });
  body.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (tr && e.target.closest('.remove')) {
      state.rows.splice(+tr.dataset.i, 1);
      renderRecipe(); renderOilList(); update();
    } else if (tr && e.target.closest('.oil-name')) selectOil(state.rows[+tr.dataset.i].id);
  });
  $('btn-balance').addEventListener('click', () => {
    if (state.mode !== 'pct' || !state.rows.length) return;
    const last = state.rows[state.rows.length - 1];
    const others = state.rows.slice(0, -1).reduce((a, r) => a + num(r.pct), 0);
    last.pct = trimNum(Math.max(0, 100 - others), 2);
    renderRecipe(); update();
  });
}

// ---------- пересчёт и вывод ----------
function update() {
  $('koh90').disabled = state.lyeType !== 'KOH';
  const input = inputForCalc();
  let res = calcLye(input);
  const opts = { corrected: state.corrected };
  const props = recipeProperties(input.selectedOils, opts);
  const one = state.selectedOilId != null ? oilProperties(findOil(state.selectedOilId), opts) : null;
  $('corrected-note').hidden = !state.corrected;

  renderDerivedColumn(res);
  // Как в оригинале: при некорректных параметрах расчёт не показываем,
  // иначе пустой пережир молча превратится в 0%, а неверная вода — в 0 г.
  const invalid = renderValidation();
  if (invalid && !res.error) res = { ...res, lye: 0, water: 0, fragranceAmount: 0, error: `Исправьте ввод: ${invalid}` };
  renderAmounts(res);
  renderStrip(res);
  renderProps(one, props.error ? null : props.properties);
  renderPrint(res, props.error ? null : props.properties);
  save();
}

// Краткий итог в шапке (на телефоне колонка результата скрыта за вкладкой).
function renderStrip(res) {
  const el = $('strip');
  if (res.error) {
    // Пустой рецепт — не ошибка, а начальное состояние: подсказываем спокойно.
    const quiet = state.rows.length === 0;
    el.className = quiet ? 'strip quiet' : 'strip err';
    el.textContent = quiet ? 'Добавьте масла во вкладке «Масла»' : res.error;
    return;
  }
  const u = UNIT_RU[state.unit];
  const d = state.unit === 'Grams' ? 1 : 3;
  el.className = 'strip';
  el.innerHTML = `<span>${esc(state.lyeType)}: <b>${fmt(res.lye, d)} ${u}</b></span><span>вода: <b>${fmt(res.water, d)} ${u}</b></span><span>масла: ${fmt(res.oilWeight, d)} ${u}</span>`;
}

// Мобильные вкладки: на широких экранах CSS показывает все колонки, класс .active не мешает.
function initTabs() {
  const buttons = [...document.querySelectorAll('.tabbar [data-tab]')];
  const setTab = (name) => {
    document.querySelectorAll('.layout > .col').forEach((c) => c.classList.toggle('active', c.dataset.col === name));
    buttons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    window.scrollTo({ top: 0 });
  };
  buttons.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
}

function renderDerivedColumn(res) {
  const total = state.mode === 'pct' ? num(state.oilWeight) : res.oilWeight;
  let sumPct = 0, sumWt = 0;
  const wtSum = state.rows.reduce((a, r) => a + num(r.wt), 0);
  $('recipe-body').querySelectorAll('tr[data-i]').forEach((tr) => {
    const r = state.rows[+tr.dataset.i];
    const pct = state.mode === 'pct' ? num(r.pct) : (wtSum > 0 ? (num(r.wt) / wtSum) * 100 : 0);
    const wt = state.mode === 'pct' ? (pct / 100) * total : num(r.wt);
    sumPct += pct; sumWt += wt;
    const d = tr.querySelector('.derived');
    if (d) d.textContent = state.mode === 'pct' ? fmt(wt, state.unit === 'Grams' ? 1 : 3) : fmt(pct, 2);
  });
  const tp = $('total-pct');
  tp.textContent = state.rows.length ? `${fmt(sumPct, 2)}%` : '';
  tp.classList.toggle('bad', state.mode === 'pct' && state.rows.length > 0 && +sumPct.toFixed(1) !== 100);
  $('total-wt').textContent = state.rows.length ? fmt(sumWt, state.unit === 'Grams' ? 1 : 3) : '';
  $('btn-balance').hidden = state.mode !== 'pct' || state.rows.length === 0 || +sumPct.toFixed(1) === 100;

  const ow = $('oil-weight');
  ow.disabled = state.mode === 'wt';
  if (state.mode === 'wt') {
    // В режиме «вес» общий вес — производная величина; держим его в state, чтобы экспорт и
    // переключение режимов видели актуальное значение.
    state.oilWeight = trimNum(res.oilWeight || wtSum, 3);
    ow.value = state.oilWeight;
  }
  $('weight-hint').textContent = state.mode === 'wt' ? 'В режиме «вес» общий вес — сумма весов масел.' : '';
}

/** Проверяет параметры; возвращает текст первой блокирующей ошибки или ''. */
function renderValidation() {
  const errors = [];

  const sf = num(state.superFat, NaN);
  let sfMsg = '', sfBad = false;
  if (!Number.isFinite(sf) || sf < -10 || sf > 50) { sfMsg = 'Пережир должен быть от −10% до 50%.'; sfBad = true; }
  else if (sf < 0) sfMsg = 'Отрицательный пережир — избыток щёлочи, только для хозяйственного мыла.';
  else if (sf > 25) sfMsg = 'Рекомендуемый диапазон 0–25%, но больше тоже допускается.';
  setMsg('superfat-msg', sfMsg, sfBad);
  if (sfBad) errors.push('пережир');

  const isG = state.unit === 'Grams';
  const max = isG ? 312.5 : 5;
  const fr = num(state.fragrance, NaN);
  const frBad = state.fragrance !== '' && (!Number.isFinite(fr) || fr < 0 || fr > max);
  setMsg('fragrance-msg', frBad ? `Отдушка: от 0 до ${max} ${isG ? 'г/кг' : 'oz/lb'}.`
    : Number.isFinite(fr) ? `≈ ${fmt((isG ? fr / 10 : (fr / 16) * 100), 2)}% от веса масел` : '', frBad);
  $('fragrance-suffix').textContent = isG ? 'г/кг' : 'oz/lb';
  if (frBad) errors.push('отдушка');

  const mode = state.waterOption;
  const wv = String(state.waterValue).trim();
  const wvNum = parseFloat(wv);
  const waterOk = mode === 'water_lye_ratio'
    ? /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(wv) && num(wv.split(':')[1]) > 0
    : Number.isFinite(wvNum) && wvNum > 0 && wvNum < 100;
  setMsg('water-msg', waterOk ? '' : (mode === 'water_lye_ratio' ? 'Введите соотношение в виде 2:1 или 2.5:1.' : 'Введите процент больше 0 и меньше 100.'), true);
  if (!waterOk) errors.push('вода');

  const ow = num(state.oilWeight, NaN);
  const weightBad = state.mode === 'pct' && !(ow > 0);
  setMsg('weight-msg', weightBad ? 'Вес масел должен быть положительным числом.' : '', true);
  if (weightBad) errors.push('вес масел');

  $('water-suffix').textContent = mode === 'water_lye_ratio' ? '' : '%';
  $('water-value').placeholder = mode === 'water_lye_ratio' ? '2:1' : '';
  $('water-hint').textContent = {
    water_percentage: 'Новичкам 38%, опытные 32–33%.',
    lye_concentration: 'Доля щёлочи в растворе, обычно 27–40%.',
    water_lye_ratio: '2:1 — две части воды на одну щёлочи.',
  }[mode];
  return errors.join(', ');
}

function setMsg(id, text, bad) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('bad', !!bad);
}

function renderAmounts(res) {
  const err = $('error');
  err.hidden = !res.error;
  err.textContent = res.error || '';
  const ws = waterStats({ oilWeight: res.oilWeight, lyeWeight: res.lye, waterWeight: res.water });
  const warnings = [...(res.warnings || [])];
  if (!res.error && res.lye > 0 && ws.lyeConcentration >= 40) {
    warnings.push(`Концентрация щёлочи ${fmt(ws.lyeConcentration, 1)}% — от 40% и выше гидролиз может пройти не полностью (остаётся свободная щёлочь), смесь может «вскипеть». Обычно не выше 40%.`);
  }
  $('warnings').innerHTML = warnings.map((w) => `<div class="alert warn">${esc(w)}</div>`).join('');

  const u = state.unit;
  const fragInRecipeUnit = res.fragranceUnit ? UNITS[u].fromLb(UNITS[res.fragranceUnit].toLb(res.fragranceAmount)) : 0;
  const rows = [
    ['Вода', toAllUnits(u, res.water)],
    [`Щёлочь ${state.lyeType}${state.is90KOH && state.lyeType === 'KOH' ? ' (90%)' : ''}`, toAllUnits(u, res.lye)],
    ['Масла', toAllUnits(u, res.oilWeight)],
    ['Отдушка', toAllUnits(u, fragInRecipeUnit)],
    ['Мыло до сушки', toAllUnits(u, res.oilWeight + res.water + res.lye + fragInRecipeUnit)],
  ];
  // Ключевые цифры крупно — в единицах рецепта.
  const d = u === 'Grams' ? 1 : 3;
  $('hero').innerHTML = res.error ? '' : `
    <div class="hero-item lye"><span class="k">Щёлочь ${esc(state.lyeType)}${state.is90KOH && state.lyeType === 'KOH' ? ' 90%' : ''}</span><span class="v">${fmt(res.lye, d)}<small>${UNIT_RU[u]}</small></span></div>
    <div class="hero-item"><span class="k">Вода</span><span class="v">${fmt(res.water, d)}<small>${UNIT_RU[u]}</small></span></div>`;
  $('amounts-body').innerHTML = rows.map(([label, v], i) => `
    <tr class="${i === 1 ? 'lye' : ''}${i === rows.length - 1 ? ' total' : ''}">
      <th>${label}</th><td class="num">${fmt(v.g, 2)}</td><td class="num">${fmt(v.oz, 2)}</td><td class="num">${fmt(v.lb, 3)}</td>
    </tr>`).join('');

  $('inci').textContent = res.error ? '' : inciList();
  $('stats').innerHTML = res.error ? '' : `
    <dt>Вода, % от масел</dt><dd>${fmt(ws.waterPercent, 2)}%</dd>
    <dt>Концентрация щёлочи</dt><dd>${fmt(ws.lyeConcentration, 2)}%</dd>
    <dt>Вода : щёлочь</dt><dd>${fmt(ws.waterLyeRatio, 2)} : 1</dd>
    <dt>Пережир</dt><dd>${fmt(num(state.superFat), 1)}%</dd>`;
}

// Состав для этикетки: INCI-названия масел по убыванию доли (как на странице итогов soapcalc.net).
function inciList() {
  const wtSum = state.rows.reduce((a, r) => a + num(r.wt), 0);
  const share = (r) => (state.mode === 'pct' ? num(r.pct) : wtSum > 0 ? num(r.wt) / wtSum : 0);
  return [...state.rows].sort((a, b) => share(b) - share(a))
    .map((r) => findOil(r.id)?.inci_name).filter(Boolean).join(', ');
}

function renderProps(one, all) {
  const cell = (v) => (v == null ? '<td class="num muted">—</td>' : `<td class="num">${Math.round(v)}</td>`);
  const status = (k, v) => (v < RANGES[k].min ? 'low' : v > RANGES[k].max ? 'high' : 'ok');
  // Шкала: серая зона — норма, цветная полоса — значение рецепта.
  const head = '<div class="meter head"><span>Показатель</span><span>Норма</span><span></span><span class="m-one">Одно</span><span class="m-val">Рецепт</span></div>';
  $('qualities').innerHTML = head + QUALITY_KEYS.map((k) => {
    const [name, desc] = QUALITY_INFO[k];
    const max = k === 'INS' ? 200 : 100;
    const v = all?.[k];
    const st = all ? status(k, v) : '';
    const track = `<span class="m-track"><b style="left:${(RANGES[k].min / max) * 100}%;width:${((RANGES[k].max - RANGES[k].min) / max) * 100}%"></b>${all ? `<i class="${st}" style="width:${Math.min(100, (Math.max(0, v) / max) * 100)}%"></i>` : ''}</span>`;
    return `<div class="meter" title="${esc(desc)}">
      <span class="m-name">${name}</span><span class="m-range">${RANGES[k].min}–${RANGES[k].max}</span>${track}
      <span class="m-one">${one ? Math.round(one[k]) : '—'}</span>
      <span class="m-val">${all ? `<span class="pill ${st}">${v}</span>` : '<span class="muted">—</span>'}</span>
    </div>`;
  }).join('');

  const faRow = (label, k, cls = '') => `<tr class="${cls}"><th>${label}</th>${cell(one?.[k])}${cell(all?.[k])}</tr>`;
  const su = (p) => (p ? satUnsat(p.Saturated, p.MonoUnsaturated, p.PolyUnsaturated) : '—');
  $('fa-body').innerHTML = FA_KEYS.map((k) => faRow(FA_NAMES[k], k)).join('')
    + faRow('Насыщенные', 'Saturated', 'sep') + faRow('Мононенасыщенные', 'MonoUnsaturated') + faRow('Полиненасыщенные', 'PolyUnsaturated')
    + `<tr class="sep"><th title="Ориентир — около 40:60">Насыщ. : ненасыщ.</th><td class="num">${one ? su(one) : '—'}</td><td class="num">${su(all)}</td></tr>`;
}

function renderPrint(res, all) {
  if (res.error) { $('print-view').innerHTML = `<p>${esc(res.error)}</p>`; return; }
  const u = state.unit;
  const total = res.oilWeight;
  const oilRows = state.rows.map((r, i) => {
    const pct = state.mode === 'pct' ? num(r.pct) : (num(r.wt) / total) * 100;
    const w = toAllUnits(u, (pct / 100) * total);
    return `<tr><td>${i + 1}</td><td>☐</td><td>${esc(findOil(r.id)?.name || '')}</td><td class="num">${fmt(pct, 2)}</td><td class="num">${fmt(w.g, 2)}</td><td class="num">${fmt(w.oz, 2)}</td><td class="num">${fmt(w.lb, 3)}</td></tr>`;
  }).join('');
  $('print-view').innerHTML = `
    <h1>${esc(state.recipeName || 'Рецепт мыла')}</h1>
    <p>${new Date().toLocaleDateString('ru-RU')} · ${state.lyeType}${state.is90KOH && state.lyeType === 'KOH' ? ' 90%' : ''} · пережир ${fmt(num(state.superFat), 1)}%
      · ${$('stats').textContent.replace(/\s+/g, ' ').trim()}</p>
    ${$('amounts-body').closest('table').outerHTML}
    <table class="amounts"><thead><tr><th>#</th><th>✓</th><th>Масло</th><th class="num">%</th><th class="num">г</th><th class="num">oz</th><th class="num">lb</th></tr></thead><tbody>${oilRows}</tbody></table>
    ${all ? `<p>${QUALITY_KEYS.map((k) => `${QUALITY_INFO[k][0]}: <b>${all[k]}</b>`).join(' · ')} · Насыщ.:ненасыщ. ${satUnsat(all.Saturated, all.MonoUnsaturated, all.PolyUnsaturated)}${state.corrected && state.rows.some((r) => CORRECTIONS[r.id]) ? '<br><i>⚠ Свойства рассчитаны по исправленным данным (масла с пометкой ✎ отличаются от soapcalc.net).</i>' : ''}</p>` : ''}
    <p><b>INCI:</b> ${esc(inciList())}</p>
    ${state.notes ? `<h2>Заметки</h2><p class="notes">${esc(state.notes)}</p>` : ''}`;
}

// ---------- импорт / экспорт (совместим с JSON soapcalc.net) ----------
function toExport() {
  const total = num(state.oilWeight);
  return {
    recipeName: state.recipeName, lyeType: state.lyeType, is90KOH: state.is90KOH,
    oilWeightUnit: state.unit, oilWeightValue: total,
    waterOption: state.waterOption, waterValue: state.waterValue,
    superFat: num(state.superFat), fragrance: num(state.fragrance),
    selectedOils: state.rows.map((r) => ({
      id: r.id,
      amount: state.mode === 'pct' ? r.pct : '',
      weight: state.mode === 'pct' ? trimNum((num(r.pct) / 100) * total, 3) : r.wt,
    })),
    additives: '', notes: state.notes,
    // Расширение формата: soapcalc.net это поле игнорирует.
    correctedData: state.corrected,
  };
}

function fromImport(d) {
  const s = defaults();
  s.recipeName = d.recipeName || '';
  s.notes = [d.notes, d.additives].filter(Boolean).join('\n');
  s.lyeType = d.lyeType === 'KOH' ? 'KOH' : 'NaOH';
  s.is90KOH = !!d.is90KOH && s.lyeType === 'KOH';
  s.unit = UNITS[d.oilWeightUnit] ? d.oilWeightUnit : 'Pounds';
  s.oilWeight = String(num(d.oilWeightValue, 1));
  s.waterOption = WATER_MODES[d.waterOption] ? d.waterOption : 'water_percentage';
  s.waterValue = String(d.waterValue ?? WATER_DEFAULTS[s.waterOption]);
  s.superFat = String(num(d.superFat, 5));
  s.fragrance = String(num(d.fragrance, 0));
  s.corrected = !!d.correctedData;
  const oils = (Array.isArray(d.selectedOils) ? d.selectedOils : []).filter((o) => o && o.id != null && findOil(+o.id)).slice(0, MAX_OILS);
  const hasPct = oils.some((o) => num(o.amount) > 0);
  s.mode = hasPct ? 'pct' : 'wt';
  s.rows = oils.map((o) => ({ id: +o.id, pct: hasPct ? String(o.amount ?? '') : '', wt: hasPct ? '' : String(o.weight ?? '') }));
  return s;
}

function initMenu() {
  const btn = $('btn-menu'), menu = $('menu');
  const open = (v) => { menu.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };
  btn.addEventListener('click', () => open(menu.hidden));
  // Пункт выбран (кроме «Сбросить» — у него двухшаговое подтверждение) или клик вне меню — закрываем.
  menu.addEventListener('click', (e) => { if (e.target.closest('[role=menuitem]') && !e.target.closest('#btn-reset')) open(false); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
}

function initFileActions() {
  $('btn-save').addEventListener('click', () => {
    const data = toExport();
    const slug = (state.recipeName || '').trim().toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `${slug || 'soap-recipe'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });
  $('file-load').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      state = fromImport(JSON.parse(await file.text()));
      refreshAll();
      flash('Рецепт загружен');
    } catch (err) {
      flash(`Не удалось загрузить рецепт: ${err.message}`);
    }
  });
  $('btn-print').addEventListener('click', () => window.print());
  $('btn-reset').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const text = btn.querySelector('span');
    if (btn.dataset.armed) {
      state = defaults();
      refreshAll();
      delete btn.dataset.armed; text.textContent = 'Сбросить рецепт';
      $('menu').hidden = true; $('btn-menu').setAttribute('aria-expanded', 'false');
      flash('Рецепт сброшен');
    } else {
      btn.dataset.armed = '1'; text.textContent = 'Точно сбросить?';
      setTimeout(() => { delete btn.dataset.armed; text.textContent = 'Сбросить рецепт'; }, 3000);
    }
  });
}

let flashTimer;
function flash(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function refreshAll() {
  syncSettings();
  renderOilList();
  renderOilInfo();
  renderRecipe();
  update();
}

initSettings();
initOilList();
initRecipe();
initFileActions();
initMenu();
initTabs();
refreshAll();

// PWA: офлайн-кэш и установка на домашний экран. Работает только по http(s);
// в автономном файле (file://) и в сборке service worker не нужен.
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && document.querySelector('link[rel=manifest]')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* не критично */ });
}
