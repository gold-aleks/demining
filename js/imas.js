/**
 * @file imas.js
 * @description Довідник стандартів IMAS: список, фільтри, детальний витяг.
 */

import { bindSearchInput, normalize } from './search.js';
import { initTheme } from './theme.js';
import {
  getQueryParams,
  glossaryURL,
  imasURL,
  normalizeImasId,
  registerServiceWorker,
} from './router.js';

/** @type {{ id: string, name: string }[]} */
let seriesList = [];

/** @type {object[]} */
let allDocs = [];

/** @type {string} */
let currentQuery = '';

/** @type {string} */
let currentSeries = '';

/** @type {string|null} */
let activeId = null;

/** @type {Map<string, object>} */
const docCache = new Map();

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
 * Відмінювання «стандарт».
 * @param {number} n
 * @returns {string}
 */
function pluralizeDocs(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'стандарт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'стандарти';
  return 'стандартів';
}

/**
 * Пошуковий текст для запису індексу.
 * @param {object} item
 * @returns {string}
 */
function buildDocHaystack(item) {
  const parts = [
    item.code,
    item.id,
    item.title_uk,
    item.title_en,
    item.series,
    ...(item.tags || []),
  ];
  return normalize(parts.filter(Boolean).join(' '));
}

/**
 * Назва серії за id.
 * @param {string} seriesId
 * @returns {string}
 */
function seriesName(seriesId) {
  return seriesList.find((s) => s.id === seriesId)?.name || seriesId || '';
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
 * Рендерить чіпи серій.
 */
function renderSeriesChips() {
  const row = document.getElementById('imasSeriesChips');
  if (!row) return;

  const counts = new Map();
  allDocs.forEach((item) => {
    if (!item.series) return;
    counts.set(item.series, (counts.get(item.series) || 0) + 1);
  });

  row.innerHTML = [
    `<button type="button" class="mini-chip${currentSeries ? '' : ' is-active'}" data-series="">Усі</button>`,
    ...seriesList.map((series) => {
      const count = counts.get(series.id) || 0;
      const active = currentSeries === series.id ? ' is-active' : '';
      return `
        <button type="button" class="mini-chip${active}" data-series="${escapeHTML(series.id)}">
          ${escapeHTML(series.id)} · ${escapeHTML(series.name)}
          <span class="mini-chip__count">${count}</span>
        </button>
      `;
    }),
  ].join('');

  row.querySelectorAll('.mini-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentSeries = chip.dataset.series || '';
      const select = document.getElementById('filterImasSeries');
      if (select) select.value = currentSeries;
      refreshList();
      renderSeriesChips();
    });
  });
}

/**
 * Картка в списку.
 * @param {object} item
 * @returns {string}
 */
function renderListItem(item) {
  const series = seriesName(item.series);
  const active = activeId === item.id ? ' is-active' : '';
  const tags = (item.tags || [])
    .slice(0, 4)
    .map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`)
    .join('');

  return `
    <a class="imas-card${active}" href="${imasURL(item.id)}" data-imas-id="${escapeHTML(item.id)}" id="imas-${escapeHTML(item.id)}">
      <div class="imas-card__head">
        <h3 class="imas-card__code">${escapeHTML(item.code)}</h3>
        ${series ? `<span class="imas-card__series">${escapeHTML(item.series)} · ${escapeHTML(series)}</span>` : ''}
      </div>
      <p class="imas-card__title">${escapeHTML(item.title_uk)}</p>
      ${item.title_en ? `<p class="imas-card__title-en">${escapeHTML(item.title_en)}</p>` : ''}
      ${tags ? `<div class="imas-card__tags">${tags}</div>` : ''}
    </a>
  `;
}

/**
 * Фільтрує й оновлює список.
 */
function refreshList() {
  let result = allDocs.filter((item) => {
    const q = normalize(currentQuery);
    if (!q) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every((token) => (item.__searchText || '').includes(token));
  });

  if (currentSeries) {
    result = result.filter((item) => item.series === currentSeries);
  }

  result = [...result].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), 'en', { numeric: true }),
  );

  const list = document.getElementById('imasList');
  const empty = document.getElementById('imasEmpty');
  const count = document.getElementById('imasCount');

  if (list) {
    list.innerHTML = result.map(renderListItem).join('');
    list.querySelectorAll('[data-imas-id]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const id = link.getAttribute('data-imas-id');
        if (!id) return;
        openDocument(id, true);
      });
    });
  }

  if (count) {
    count.textContent = `${result.length} ${pluralizeDocs(result.length)}`;
  }

  if (empty) {
    empty.classList.toggle('is-hidden', result.length > 0);
  }
}

/**
 * Завантажує повний документ.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function loadDocument(id) {
  const normalized = normalizeImasId(id);
  if (!normalized) return null;
  if (docCache.has(normalized)) return docCache.get(normalized);

  const meta = allDocs.find((d) => d.id === normalized);
  const path = meta?.file || `data/imas/docs/${normalized}.json`;

  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  docCache.set(normalized, data);
  return data;
}

/**
 * Рендерить детальний витяг.
 * @param {object} doc
 * @returns {string}
 */
function renderDetail(doc) {
  const series = doc.series_name_uk || seriesName(doc.series);
  const points = (doc.key_points || [])
    .map((p) => `<li>${escapeHTML(p)}</li>`)
    .join('');
  const fieldNotes = (doc.field_notes || [])
    .map((p) => `<li>${escapeHTML(p)}</li>`)
    .join('');
  const related = (doc.related || [])
    .map((id) => `<a class="tag tag--link" href="${imasURL(id)}">${escapeHTML(`IMAS ${id}`)}</a>`)
    .join('');
  const glossary = (doc.related_glossary || [])
    .map((id) => `<a class="tag tag--link" href="${glossaryURL(id)}">${escapeHTML(id)}</a>`)
    .join('');

  return `
    <article class="imas-detail__card" id="imas-detail-${escapeHTML(doc.id)}">
      <div class="imas-detail__toolbar">
        <button type="button" class="link-btn" id="imasDetailClose">Закрити витяг</button>
        ${doc.official_url
          ? `<a class="link-btn" href="${escapeHTML(doc.official_url)}" target="_blank" rel="noopener noreferrer">Офіційний текст ↗</a>`
          : ''}
      </div>
      <div class="imas-detail__head">
        <h2 class="imas-detail__code" id="imasDetailTitle">${escapeHTML(doc.code)}</h2>
        ${series ? `<span class="imas-detail__series">${escapeHTML(doc.series)} · ${escapeHTML(series)}</span>` : ''}
      </div>
      <h3 class="imas-detail__title">${escapeHTML(doc.title_uk)}</h3>
      ${doc.title_en ? `<p class="imas-detail__title-en">${escapeHTML(doc.title_en)}</p>` : ''}
      ${doc.summary ? `<p class="imas-detail__summary">${escapeHTML(doc.summary)}</p>` : ''}
      ${doc.scope ? `<p class="imas-detail__scope"><strong>Сфера:</strong> ${escapeHTML(doc.scope)}</p>` : ''}
      ${points
        ? `<div class="imas-detail__block"><h4>Ключові положення</h4><ul class="bullet-list">${points}</ul></div>`
        : ''}
      ${fieldNotes
        ? `<div class="imas-detail__block"><h4>Для польового довідника</h4><ul class="bullet-list">${fieldNotes}</ul></div>`
        : ''}
      ${related
        ? `<div class="imas-detail__related"><span class="imas-detail__related-label">Пов’язані IMAS:</span> ${related}</div>`
        : ''}
      ${glossary
        ? `<div class="imas-detail__related"><span class="imas-detail__related-label">У скороченнях:</span> ${glossary}</div>`
        : ''}
      ${doc.disclaimer ? `<p class="imas-detail__disclaimer">${escapeHTML(doc.disclaimer)}</p>` : ''}
    </article>
  `;
}

/**
 * Відкриває документ у панелі деталей.
 * @param {string} id
 * @param {boolean} [pushUrl]
 */
async function openDocument(id, pushUrl = false) {
  const normalized = normalizeImasId(id);
  if (!normalized) return;

  const section = document.getElementById('imasDetailSection');
  const host = document.getElementById('imasDetail');
  if (!section || !host) return;

  try {
    const doc = await loadDocument(normalized);
    if (!doc) throw new Error('Документ не знайдено');

    activeId = normalized;
    host.innerHTML = renderDetail(doc);
    section.classList.remove('is-hidden');

    document.getElementById('imasDetailClose')?.addEventListener('click', () => {
      closeDetail(true);
    });

    host.querySelectorAll('a[href^="imas.html"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href') || '';
        const params = new URLSearchParams(href.split('?')[1] || '');
        const nextId = params.get('id');
        if (!nextId) return;
        event.preventDefault();
        openDocument(nextId, true);
      });
    });

    if (pushUrl) {
      const url = imasURL(normalized);
      window.history.pushState({ imasId: normalized }, '', url);
    }

    refreshList();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);
    host.innerHTML = `
      <div class="empty-state">
        Не вдалося завантажити ${escapeHTML(normalized)}. Перевірте файл у data/imas/docs/.
      </div>
    `;
    section.classList.remove('is-hidden');
  }
}

/**
 * Ховає панель деталей.
 * @param {boolean} [pushUrl]
 */
function closeDetail(pushUrl = false) {
  activeId = null;
  const section = document.getElementById('imasDetailSection');
  const host = document.getElementById('imasDetail');
  if (section) section.classList.add('is-hidden');
  if (host) host.innerHTML = '';
  if (pushUrl) {
    window.history.pushState({}, '', 'imas.html');
  }
  refreshList();
}

/**
 * Ініціалізація сторінки.
 */
async function init() {
  initTheme();
  registerServiceWorker();

  const seriesSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('filterImasSeries'));
  const resetBtn = document.getElementById('resetImasFilters');

  seriesSelect?.addEventListener('change', () => {
    currentSeries = seriesSelect.value || '';
    renderSeriesChips();
    refreshList();
  });

  resetBtn?.addEventListener('click', () => {
    currentSeries = '';
    currentQuery = '';
    if (seriesSelect) seriesSelect.value = '';
    const search = /** @type {HTMLInputElement|null} */ (document.getElementById('imasSearch'));
    if (search) search.value = '';
    renderSeriesChips();
    refreshList();
  });

  bindSearchInput(document.getElementById('imasSearch'), (query) => {
    currentQuery = query;
    refreshList();
  }, { scrollTo: 'imasResults' });

  window.addEventListener('popstate', () => {
    const id = normalizeImasId(getQueryParams().get('id') || '');
    if (id) openDocument(id, false);
    else closeDetail(false);
  });

  try {
    const response = await fetch('data/imas/index.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    seriesList = Array.isArray(data.series) ? data.series : [];
    allDocs = (Array.isArray(data.documents) ? data.documents : []).map((item) => ({
      ...item,
      __searchText: buildDocHaystack(item),
    }));

    const disclaimer = document.getElementById('imasDisclaimer');
    if (disclaimer) {
      disclaimer.textContent =
        data.description ||
        'Стислі освітні витяги. Офіційний текст — на сайті mineactionstandards.org.';
    }

    fillSelect(
      seriesSelect,
      seriesList.map((s) => ({ value: s.id, label: `${s.id} · ${s.name}` })),
    );

    renderSeriesChips();
    refreshList();

    const initialId = normalizeImasId(getQueryParams().get('id') || '');
    if (initialId) {
      await openDocument(initialId, false);
    }
  } catch (error) {
    console.error(error);
    const empty = document.getElementById('imasEmpty');
    if (empty) {
      empty.textContent = 'Не вдалося завантажити довідник IMAS. Перевірте data/imas/index.json.';
      empty.classList.remove('is-hidden');
    }
  }
}

init();
