/**
 * @file app.js
 * @description Точка входу головної сторінки: каталог, пошук, фільтри, статистика.
 */

import { loadIndex } from './loader.js';
import { bindSearchInput, searchItems } from './search.js';
import {
  applyFilters,
  bindFilters,
  collectFilterOptions,
  DANGER_LABELS,
  fillSelect,
} from './filters.js';
import { getFavorites } from './storage.js';
import { initTheme } from './theme.js';
import { objectURL, registerServiceWorker } from './router.js';

/** @type {object[]} */
let allItems = [];

/** @type {string} */
let currentQuery = '';

/** @type {ReturnType<typeof bindFilters>|null} */
let filterApi = null;

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
 * Рендерить картку об'єкта.
 * @param {object} item
 * @returns {string}
 */
function renderCard(item) {
  const danger = item.danger_level || 'medium';
  const dangerLabel = DANGER_LABELS[danger] || danger;
  const tags = (item.tags || []).slice(0, 3)
    .map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`)
    .join('');

  const thumb = item.thumbnail
    ? `<img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}" loading="lazy" decoding="async">`
    : `<img src="img/logo.svg" alt="" loading="lazy">`;

  return `
    <a class="object-card" href="${objectURL(item.id)}">
      <div class="object-card__media">${thumb}</div>
      <div class="object-card__body">
        <h3 class="object-card__title">${escapeHTML(item.name)}</h3>
        <div class="object-card__meta">${escapeHTML(item.category || '')}${item.type ? ` · ${escapeHTML(item.type)}` : ''}</div>
        <span class="danger-badge" data-level="${escapeHTML(danger)}">${escapeHTML(dangerLabel)}</span>
        <div class="object-card__tags">${tags}</div>
      </div>
    </a>
  `;
}

/**
 * Рендерить сітку карток.
 * @param {HTMLElement|null} container
 * @param {object[]} items
 */
function renderCardGrid(container, items) {
  if (!container) return;
  container.innerHTML = items.map(renderCard).join('');
}

/**
 * Оновлює статистику на головній.
 * @param {object[]} items
 */
function updateStats(items) {
  const categories = new Set(items.map((item) => item.category).filter(Boolean));
  const favorites = getFavorites();

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  setText('statTotal', items.length);
  setText('statCategories', categories.size);
  setText('statFavorites', favorites.length);
}

/**
 * Синхронізує чіпи та випадаючий список категорій з активним фільтром.
 * @param {string} [category]
 */
function syncCategoryUI(category = '') {
  document.querySelectorAll('.category-chip').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.category === category);
  });

  const select = document.getElementById('categorySelect');
  if (select && select.value !== category) {
    select.value = category;
  }
}

/**
 * Застосовує фільтр категорії й прокручує до каталогу.
 * @param {string} category
 */
function applyCategoryFilter(category) {
  filterApi?.setFilters({ category });
  document.getElementById('catalogTitle')?.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Рендерить категорії.
 * @param {object[]} items
 */
function renderCategories(items) {
  const grid = document.getElementById('categoryGrid');
  const select = document.getElementById('categorySelect');
  if (!grid && !select) return;

  const counts = new Map();
  items.forEach((item) => {
    if (!item.category) return;
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  });

  const { categories } = collectFilterOptions(items);

  if (grid) {
    grid.innerHTML = categories
      .map((name) => {
        const count = counts.get(name) || 0;
        return `
          <button type="button" class="category-chip" data-category="${escapeHTML(name)}">
            <span class="category-chip__name">${escapeHTML(name)}</span>
            <span class="category-chip__count">${count} карток</span>
          </button>
        `;
      })
      .join('');

    grid.querySelectorAll('.category-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        applyCategoryFilter(chip.dataset.category || '');
      });
    });
  }

  if (select) {
    const current = filterApi?.getFilters().category || '';
    select.innerHTML = [
      '<option value="">Усі категорії</option>',
      ...categories.map((name) => {
        const count = counts.get(name) || 0;
        return `<option value="${escapeHTML(name)}">${escapeHTML(name)} (${count})</option>`;
      }),
    ].join('');
    select.value = current;
    select.addEventListener('change', () => {
      applyCategoryFilter(select.value || '');
    });
  }

  syncCategoryUI(filterApi?.getFilters().category || '');
}

/**
 * Оновлює каталог згідно з пошуком і фільтрами.
 */
function refreshCatalog() {
  const filters = filterApi?.getFilters() || {};
  let result = searchItems(allItems, currentQuery);
  result = applyFilters(result, filters);

  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('resultsCount');

  renderCardGrid(grid, result);

  if (count) {
    count.textContent = `${result.length} ${pluralizeResults(result.length)}`;
  }

  if (empty) {
    empty.classList.toggle('is-hidden', result.length > 0);
  }
}

/**
 * Відмінювання слова «результат».
 * @param {number} n
 * @returns {string}
 */
function pluralizeResults(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'результат';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'результати';
  return 'результатів';
}

/**
 * Ініціалізація головної сторінки.
 */
async function init() {
  initTheme();
  registerServiceWorker();

  filterApi = bindFilters(
    {
      category: document.getElementById('filterCategory'),
      country: document.getElementById('filterCountry'),
      type: document.getElementById('filterType'),
      danger: document.getElementById('filterDanger'),
      hasPhotosBtn: document.getElementById('filterHasPhotos'),
      noPhotosBtn: document.getElementById('filterNoPhotos'),
      hasVideosBtn: document.getElementById('filterHasVideos'),
      noVideosBtn: document.getElementById('filterNoVideos'),
      resetBtn: document.getElementById('resetFilters'),
    },
    () => {
      syncCategoryUI(filterApi?.getFilters().category || '');
      refreshCatalog();
    },
  );

  bindSearchInput(document.getElementById('searchInput'), (query) => {
    currentQuery = query;
    refreshCatalog();
  }, { scrollTo: 'catalogSection' });

  try {
    const index = await loadIndex();
    allItems = index.objects || [];

    const options = collectFilterOptions(allItems);
    fillSelect(document.getElementById('filterCategory'), options.categories);
    fillSelect(document.getElementById('filterCountry'), options.countries);
    fillSelect(document.getElementById('filterType'), options.types);

    updateStats(allItems);
    renderCategories(allItems);
    refreshCatalog();
  } catch (error) {
    console.error(error);
    const empty = document.getElementById('emptyState');
    if (empty) {
      empty.textContent = 'Не вдалося завантажити базу даних. Перевірте HTTP-сервер, data/index.json і data/indexes/.';
      empty.classList.remove('is-hidden');
    }
  }
}

init();
