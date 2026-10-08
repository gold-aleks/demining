/**
 * @file filters.js
 * @description Фільтрація каталогу за категорією, країною, типом, небезпекою та медіа.
 */

/**
 * Стандартні категорії енциклопедії (для порожніх станів і масштабування).
 */
export const DEFAULT_CATEGORIES = [
  'Міни',
  'Касетні боєприпаси',
  'Артилерійські снаряди',
  'Ракети РСЗВ',
  'Ракети',
  'Авіабомби',
  'Гранати',
  'Реактивні гранати',
  'Мінометні міни',
  'Підривники',
  'IED',
  'БПЛА',
];

/**
 * Відповідність категорії → підтека в data/objects/.
 * Нові JSON кладіть у відповідну теку за цією мапою.
 */
export const CATEGORY_FOLDERS = Object.freeze({
  Міни: 'mines',
  'Касетні боєприпаси': 'cluster',
  'Артилерійські снаряди': 'artillery',
  'Ракети РСЗВ': 'rockets',
  Ракети: 'missiles',
  Авіабомби: 'aerial-bombs',
  Гранати: 'grenades',
  'Реактивні гранати': 'rpg',
  'Мінометні міни': 'mortar',
  Підривники: 'fuzes',
  IED: 'ied',
  БПЛА: 'uav',
});

/**
 * Підписи рівнів небезпеки.
 */
export const DANGER_LABELS = Object.freeze({
  low: 'Низька',
  medium: 'Середня',
  high: 'Висока',
  critical: 'Критична',
});

/**
 * Початковий стан фільтрів.
 * @returns {object}
 */
export function createEmptyFilters() {
  return {
    category: '',
    country: '',
    type: '',
    danger: '',
    hasPhotos: null,
    hasVideos: null,
  };
}

/**
 * Застосовує активні фільтри до списку карток.
 * @param {object[]} items
 * @param {object} filters
 * @returns {object[]}
 */
export function applyFilters(items, filters) {
  if (!Array.isArray(items)) return [];
  const f = filters || createEmptyFilters();

  return items.filter((item) => {
    if (f.category && item.category !== f.category) return false;
    if (f.type && item.type !== f.type) return false;
    if (f.danger && item.danger_level !== f.danger) return false;

    if (f.country) {
      const countries = Array.isArray(item.country) ? item.country : [];
      if (!countries.includes(f.country)) return false;
    }

    if (f.hasPhotos === true && !item.has_photos) return false;
    if (f.hasPhotos === false && item.has_photos) return false;
    if (f.hasVideos === true && !item.has_videos) return false;
    if (f.hasVideos === false && item.has_videos) return false;

    return true;
  });
}

/**
 * Збирає унікальні значення для select-фільтрів.
 * @param {object[]} items
 * @returns {{categories: string[], countries: string[], types: string[]}}
 */
export function collectFilterOptions(items) {
  const categories = new Set(DEFAULT_CATEGORIES);
  const countries = new Set();
  const types = new Set();

  (items || []).forEach((item) => {
    if (item.category) categories.add(item.category);
    if (item.type) types.add(item.type);
    (item.country || []).forEach((c) => countries.add(c));
  });

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b, 'uk')),
    countries: [...countries].sort((a, b) => a.localeCompare(b, 'uk')),
    types: [...types].sort((a, b) => a.localeCompare(b, 'uk')),
  };
}

/**
 * Заповнює <select> опціями.
 * @param {HTMLSelectElement|null} select
 * @param {string[]} values
 * @param {string} [allLabel='Усі']
 */
export function fillSelect(select, values, allLabel = 'Усі') {
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = allLabel;
  select.appendChild(all);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if ([...select.options].some((opt) => opt.value === current)) {
    select.value = current;
  }
}

/**
 * Прив'язує UI фільтрів до колбека оновлення.
 * @param {object} elements
 * @param {(filters: object) => void} onChange
 * @returns {{getFilters: Function, setFilters: Function, reset: Function}}
 */
export function bindFilters(elements, onChange) {
  let state = createEmptyFilters();

  const emit = () => onChange({ ...state });

  const {
    category,
    country,
    type,
    danger,
    hasPhotosBtn,
    noPhotosBtn,
    hasVideosBtn,
    noVideosBtn,
    resetBtn,
  } = elements;

  const bindSelect = (el, key) => {
    if (!el) return;
    el.addEventListener('change', () => {
      state[key] = el.value;
      emit();
    });
  };

  bindSelect(category, 'category');
  bindSelect(country, 'country');
  bindSelect(type, 'type');
  bindSelect(danger, 'danger');

  /**
   * Перемикає тристани для boolean-фільтрів (null | true | false).
   * @param {'hasPhotos'|'hasVideos'} key
   * @param {boolean} value
   * @param {HTMLElement|null} onBtn
   * @param {HTMLElement|null} offBtn
   */
  const bindTriToggle = (key, value, onBtn, offBtn) => {
    if (!onBtn && !offBtn) return;
    const sync = () => {
      onBtn?.classList.toggle('is-active', state[key] === true);
      offBtn?.classList.toggle('is-active', state[key] === false);
    };

    onBtn?.addEventListener('click', () => {
      state[key] = state[key] === true ? null : true;
      sync();
      emit();
    });

    offBtn?.addEventListener('click', () => {
      state[key] = state[key] === false ? null : false;
      sync();
      emit();
    });

    sync();
  };

  bindTriToggle('hasPhotos', true, hasPhotosBtn, noPhotosBtn);
  bindTriToggle('hasVideos', true, hasVideosBtn, noVideosBtn);

  resetBtn?.addEventListener('click', () => {
    state = createEmptyFilters();
    if (category) category.value = '';
    if (country) country.value = '';
    if (type) type.value = '';
    if (danger) danger.value = '';
    hasPhotosBtn?.classList.remove('is-active');
    noPhotosBtn?.classList.remove('is-active');
    hasVideosBtn?.classList.remove('is-active');
    noVideosBtn?.classList.remove('is-active');
    emit();
  });

  return {
    getFilters: () => ({ ...state }),
    setFilters: (next) => {
      state = { ...createEmptyFilters(), ...next };
      if (category) category.value = state.category || '';
      if (country) country.value = state.country || '';
      if (type) type.value = state.type || '';
      if (danger) danger.value = state.danger || '';
      hasPhotosBtn?.classList.toggle('is-active', state.hasPhotos === true);
      noPhotosBtn?.classList.toggle('is-active', state.hasPhotos === false);
      hasVideosBtn?.classList.toggle('is-active', state.hasVideos === true);
      noVideosBtn?.classList.toggle('is-active', state.hasVideos === false);
      emit();
    },
    reset: () => resetBtn?.click(),
  };
}
