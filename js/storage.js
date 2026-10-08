/**
 * @file storage.js
 * @description Робота з Local Storage: історія, обране, тема, остання картка.
 */

const STORAGE_KEYS = Object.freeze({
  history: 'eore_history',
  favorites: 'eore_favorites',
  lastOpened: 'eore_last_opened',
  theme: 'eore_theme',
});

const HISTORY_LIMIT = 20;

/**
 * Безпечне читання JSON з localStorage.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('storage.readJSON failed', key, error);
    return fallback;
  }
}

/**
 * Безпечний запис JSON у localStorage.
 * @param {string} key
 * @param {*} value
 */
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('storage.writeJSON failed', key, error);
  }
}

/**
 * Повертає історію перегляду (масив id, новіші спочатку).
 * @returns {string[]}
 */
export function getHistory() {
  const list = readJSON(STORAGE_KEYS.history, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Додає об'єкт в історію перегляду.
 * @param {string} id
 */
export function addToHistory(id) {
  if (!id) return;
  const next = [id, ...getHistory().filter((item) => item !== id)].slice(0, HISTORY_LIMIT);
  writeJSON(STORAGE_KEYS.history, next);
  setLastOpened(id);
}

/**
 * Повертає список обраного.
 * @returns {string[]}
 */
export function getFavorites() {
  const list = readJSON(STORAGE_KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Перевіряє, чи об'єкт в обраному.
 * @param {string} id
 * @returns {boolean}
 */
export function isFavorite(id) {
  return getFavorites().includes(id);
}

/**
 * Перемикає стан «обране».
 * @param {string} id
 * @returns {boolean} новий стан
 */
export function toggleFavorite(id) {
  if (!id) return false;
  const current = getFavorites();
  const exists = current.includes(id);
  const next = exists ? current.filter((item) => item !== id) : [...current, id];
  writeJSON(STORAGE_KEYS.favorites, next);
  return !exists;
}

/**
 * Зберігає останню відкриту картку.
 * @param {string} id
 */
export function setLastOpened(id) {
  if (!id) return;
  writeJSON(STORAGE_KEYS.lastOpened, id);
}

/**
 * Повертає id останньої відкритої картки.
 * @returns {string|null}
 */
export function getLastOpened() {
  const value = readJSON(STORAGE_KEYS.lastOpened, null);
  return typeof value === 'string' ? value : null;
}

/**
 * Зберігає тему інтерфейсу.
 * @param {'dark'|'light'} theme
 */
export function setTheme(theme) {
  writeJSON(STORAGE_KEYS.theme, theme);
}

/**
 * Повертає збережену тему.
 * @returns {'dark'|'light'|null}
 */
export function getTheme() {
  const value = readJSON(STORAGE_KEYS.theme, null);
  return value === 'light' || value === 'dark' ? value : null;
}
