/**
 * @file search.js
 * @description Миттєвий клієнтський пошук по індексу карток.
 */

/**
 * Нормалізує рядок для порівняння.
 * @param {unknown} value
 * @returns {string}
 */
export function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Збирає пошуковий текст з картки індексу.
 * @param {object} item
 * @returns {string}
 */
function buildHaystack(item) {
  const parts = [
    item.id,
    item.name,
    item.category,
    item.type,
    ...(item.country || []),
    ...(item.tags || []),
    ...(item.synonyms || []),
  ];
  return normalize(parts.filter(Boolean).join(' '));
}

/**
 * Перевіряє відповідність запиту.
 * @param {object} item
 * @param {string} query
 * @returns {boolean}
 */
export function matchesQuery(item, query) {
  const q = normalize(query);
  if (!q) return true;
  const haystack = item.__searchText || buildHaystack(item);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Фільтрує масив карток за пошуковим запитом.
 * @param {object[]} items
 * @param {string} query
 * @returns {object[]}
 */
export function searchItems(items, query) {
  if (!Array.isArray(items)) return [];
  const prepared = items.map((item) => ({
    ...item,
    __searchText: buildHaystack(item),
  }));
  return prepared.filter((item) => matchesQuery(item, query));
}

/**
 * Знаходить елемент для автоскролу.
 * @param {string|HTMLElement|null|undefined} target
 * @returns {HTMLElement|null}
 */
function resolveScrollTarget(target) {
  if (!target) return null;
  if (typeof target === 'string') {
    return document.getElementById(target) || document.querySelector(target);
  }
  return target;
}

/**
 * Плавно прокручує до контейнера результатів.
 * @param {string|HTMLElement|null|undefined} target
 */
function scrollToResults(target) {
  const el = resolveScrollTarget(target);
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * Підключає миттєвий пошук до input.
 * Enter і кнопка «Пошук» одразу застосовують запит і скролять до результатів.
 * @param {HTMLInputElement|null} input
 * @param {(query: string) => void} onChange
 * @param {number|{delay?: number, scrollTo?: string|HTMLElement|null}} [options=120]
 */
export function bindSearchInput(input, onChange, options = 120) {
  if (!input || typeof onChange !== 'function') return () => {};

  const delay = typeof options === 'number' ? options : (options.delay ?? 120);
  const scrollTo = typeof options === 'object' ? options.scrollTo : null;

  let timer = 0;
  const apply = (shouldScroll = false) => {
    window.clearTimeout(timer);
    onChange(input.value);
    if (shouldScroll) {
      input.blur();
      scrollToResults(scrollTo);
    }
  };

  const onInput = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => apply(false), delay);
  };

  const onSubmit = (event) => {
    event.preventDefault();
    apply(true);
  };

  const onKeydown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    apply(true);
  };

  const form = input.closest('form');
  const submitBtn = form
    ? null
    : input.closest('.search-box')?.querySelector('.search-box__submit');

  input.addEventListener('input', onInput);
  if (form) {
    form.addEventListener('submit', onSubmit);
  } else {
    input.addEventListener('keydown', onKeydown);
    submitBtn?.addEventListener('click', onSubmit);
  }

  return () => {
    window.clearTimeout(timer);
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKeydown);
    form?.removeEventListener('submit', onSubmit);
    submitBtn?.removeEventListener('click', onSubmit);
  };
}
