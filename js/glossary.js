/**
 * @file glossary.js
 * @description Довідник скорочень: пошук, фільтри, рендер списку.
 */

import { bindSearchInput, normalize } from './search.js';
import { initTheme } from './theme.js';
import { objectURL, registerServiceWorker } from './router.js';

/** @type {{ id: string, name: string }[]} */
let categories = [];

/** @type {object[]} */
let allItems = [];

/** @type {string} */
let currentQuery = '';

/** @type {string} */
let currentCategory = '';

/** @type {string} */
let currentLevel = '';

const LEVEL_LABELS = {
  basic: 'Базове',
  advanced: 'Для фахівців',
};

/**
 * Екранує HTML.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Відмінювання «скорочення».
 * @param {number} n
 * @returns {string}
 */
function pluralizeAbbr(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'скорочення';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'скорочення';
  return 'скорочень';
}

/**
 * Збирає пошуковий текст для запису.
 * @param {object} item
 * @returns {string}
 */
function buildAbbrHaystack(item) {
  const parts = [
    item.abbr,
    item.full_uk,
    item.full_en,
    item.full_ru_note,
    item.notes,
    item.level,
    ...(item.tags || []),
    ...(item.related || []),
  ];
  return normalize(parts.filter(Boolean).join(' '));
}

/**
 * Перевіряє відповідність пошуковому запиту.
 * @param {object} item
 * @param {string} query
 * @returns {boolean}
 */
function matchesAbbrQuery(item, query) {
  const q = normalize(query);
  if (!q) return true;
  const haystack = item.__searchText || buildAbbrHaystack(item);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Назва категорії за id.
 * @param {string} categoryId
 * @returns {string}
 */
function categoryName(categoryId) {
  return categories.find((c) => c.id === categoryId)?.name || categoryId || '';
}

/**
 * Заповнює select опціями.
 * @param {HTMLSelectElement|null} select
 * @param {{ value: string, label: string }[]} options
 */
function fillSelect(select, options) {
  if (!select) return;
  const current = select.value;
  const keepFirst = select.querySelector('option[value=""]');
  select.innerHTML = '';
  if (keepFirst) {
    select.appendChild(keepFirst);
  } else {
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Усі';
    select.appendChild(all);
  }
  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

/**
 * Рендерить чіпи груп.
 */
function renderCategoryChips() {
  const row = document.getElementById('glossaryCategoryChips');
  if (!row) return;

  const counts = new Map();
  allItems.forEach((item) => {
    if (!item.category) return;
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  });

  row.innerHTML = [
    `<button type="button" class="mini-chip${currentCategory ? '' : ' is-active'}" data-category="">Усі</button>`,
    ...categories.map((cat) => {
      const count = counts.get(cat.id) || 0;
      const active = currentCategory === cat.id ? ' is-active' : '';
      return `
        <button type="button" class="mini-chip${active}" data-category="${escapeHTML(cat.id)}">
          ${escapeHTML(cat.name)}
          <span class="mini-chip__count">${count}</span>
        </button>
      `;
    }),
  ].join('');

  row.querySelectorAll('.mini-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentCategory = chip.dataset.category || '';
      const select = document.getElementById('filterAbbrCategory');
      if (select) select.value = currentCategory;
      refreshList();
      renderCategoryChips();
    });
  });
}

/**
 * Рендерить один запис довідника.
 * @param {object} item
 * @returns {string}
 */
function renderAbbrItem(item) {
  const level = item.level || 'basic';
  const levelLabel = LEVEL_LABELS[level] || level;
  const cat = categoryName(item.category);

  const aliases = [];
  if (item.full_en) aliases.push(`<span class="abbr-card__alias"><span class="abbr-card__alias-label">EN</span> ${escapeHTML(item.full_en)}</span>`);
  if (item.full_ru_note) aliases.push(`<span class="abbr-card__alias"><span class="abbr-card__alias-label">рос.</span> ${escapeHTML(item.full_ru_note)}</span>`);

  const related = (item.related || [])
    .map((id) => `<a class="tag tag--link" href="${objectURL(id)}">${escapeHTML(id)}</a>`)
    .join('');

  const tags = (item.tags || [])
    .slice(0, 4)
    .map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`)
    .join('');

  return `
    <article class="abbr-card" id="abbr-${escapeHTML(item.id)}">
      <div class="abbr-card__head">
        <h3 class="abbr-card__abbr">${escapeHTML(item.abbr)}</h3>
        <div class="abbr-card__badges">
          <span class="level-badge" data-level="${escapeHTML(level)}">${escapeHTML(levelLabel)}</span>
          ${cat ? `<span class="abbr-card__category">${escapeHTML(cat)}</span>` : ''}
        </div>
      </div>
      <p class="abbr-card__full">${escapeHTML(item.full_uk)}</p>
      ${aliases.length ? `<div class="abbr-card__aliases">${aliases.join('')}</div>` : ''}
      ${item.notes ? `<p class="abbr-card__notes">${escapeHTML(item.notes)}</p>` : ''}
      ${item.hub_url
        ? `<p class="abbr-card__hub"><a class="link-btn" href="${escapeHTML(item.hub_url)}">${escapeHTML(item.hub_label || 'Відкрити довідник')}</a></p>`
        : ''}
      ${related ? `<div class="abbr-card__related"><span class="abbr-card__related-label">У каталозі:</span> ${related}</div>` : ''}
      ${tags ? `<div class="abbr-card__tags">${tags}</div>` : ''}
    </article>
  `;
}

/**
 * Фільтрує й оновлює список.
 */
function refreshList() {
  let result = allItems.filter((item) => matchesAbbrQuery(item, currentQuery));

  if (currentCategory) {
    result = result.filter((item) => item.category === currentCategory);
  }
  if (currentLevel) {
    result = result.filter((item) => item.level === currentLevel);
  }

  result = [...result].sort((a, b) =>
    String(a.abbr).localeCompare(String(b.abbr), 'uk', { sensitivity: 'base' }),
  );

  const list = document.getElementById('glossaryList');
  const empty = document.getElementById('glossaryEmpty');
  const count = document.getElementById('glossaryCount');

  if (list) {
    list.innerHTML = result.map(renderAbbrItem).join('');
  }

  if (count) {
    count.textContent = `${result.length} ${pluralizeAbbr(result.length)}`;
  }

  if (empty) {
    empty.classList.toggle('is-hidden', result.length > 0);
  }
}

/**
 * Підсвічує запис з hash (#abbr-muv).
 */
function focusFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return;
  const el = document.getElementById(hash);
  if (!el) return;
  el.classList.add('is-highlighted');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Ініціалізація сторінки довідника.
 */
async function init() {
  initTheme();
  registerServiceWorker();

  const categorySelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('filterAbbrCategory'));
  const levelSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('filterAbbrLevel'));
  const resetBtn = document.getElementById('resetGlossaryFilters');

  categorySelect?.addEventListener('change', () => {
    currentCategory = categorySelect.value || '';
    renderCategoryChips();
    refreshList();
  });

  levelSelect?.addEventListener('change', () => {
    currentLevel = levelSelect.value || '';
    refreshList();
  });

  resetBtn?.addEventListener('click', () => {
    currentCategory = '';
    currentLevel = '';
    currentQuery = '';
    if (categorySelect) categorySelect.value = '';
    if (levelSelect) levelSelect.value = '';
    const search = /** @type {HTMLInputElement|null} */ (document.getElementById('glossarySearch'));
    if (search) search.value = '';
    renderCategoryChips();
    refreshList();
  });

  bindSearchInput(document.getElementById('glossarySearch'), (query) => {
    currentQuery = query;
    refreshList();
  }, { scrollTo: 'glossaryResults' });

  try {
    const response = await fetch('data/abbreviations.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    categories = Array.isArray(data.categories) ? data.categories : [];
    allItems = (Array.isArray(data.items) ? data.items : []).map((item) => ({
      ...item,
      __searchText: buildAbbrHaystack(item),
    }));

    fillSelect(
      categorySelect,
      categories.map((c) => ({ value: c.id, label: c.name })),
    );

    renderCategoryChips();
    refreshList();
    focusFromHash();
  } catch (error) {
    console.error(error);
    const empty = document.getElementById('glossaryEmpty');
    if (empty) {
      empty.textContent = 'Не вдалося завантажити довідник скорочень. Перевірте data/abbreviations.json.';
      empty.classList.remove('is-hidden');
    }
  }
}

init();
