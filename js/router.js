/**
 * @file router.js
 * @description Простий роутер для index.html, object.html?id=..., model.html, glossary.html та imas.html
 */

/**
 * Повертає query-параметри поточного URL.
 * @returns {URLSearchParams}
 */
export function getQueryParams() {
  return new URLSearchParams(window.location.search);
}

/**
 * Читає id об'єкта з URL (?id=TM62M).
 * @returns {string|null}
 */
export function getObjectIdFromURL() {
  const id = getQueryParams().get('id');
  return id ? id.trim() : null;
}

/**
 * Формує URL картки об'єкта.
 * @param {string} id
 * @returns {string}
 */
export function objectURL(id) {
  return `object.html?id=${encodeURIComponent(id)}`;
}

/**
 * Формує URL повноекранного STL-переглядача.
 * @param {string} [src]
 * @param {string} [title]
 * @returns {string}
 */
export function modelURL(src, title) {
  const params = new URLSearchParams();
  if (src) params.set('src', src);
  if (title) params.set('title', title);
  const query = params.toString();
  return query ? `model.html?${query}` : 'model.html';
}

/**
 * Формує URL довідника скорочень (опційно з якорем запису).
 * @param {string} [abbrId]
 * @returns {string}
 */
export function glossaryURL(abbrId) {
  if (!abbrId) return 'glossary.html';
  return `glossary.html#abbr-${encodeURIComponent(abbrId)}`;
}

/**
 * Нормалізує код IMAS («IMAS 09.10», «09.10») → id документа.
 * @param {string} value
 * @returns {string}
 */
export function normalizeImasId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/(\d{2}\.\d{2})/);
  return match ? match[1] : raw.replace(/^imas\s+/i, '').trim();
}

/**
 * Формує URL довідника IMAS (опційно з id стандарту).
 * @param {string} [imasId]
 * @returns {string}
 */
export function imasURL(imasId) {
  const id = normalizeImasId(imasId || '');
  if (!id) return 'imas.html';
  return `imas.html?id=${encodeURIComponent(id)}`;
}

/**
 * Переходить на картку об'єкта.
 * @param {string} id
 */
export function goToObject(id) {
  if (!id) return;
  window.location.href = objectURL(id);
}

/**
 * Повертається на головну (або history.back, якщо можливо).
 * @param {string} [fallback='index.html']
 */
export function goBack(fallback = 'index.html') {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = fallback;
}

/**
 * Реєструє Service Worker, кнопку встановлення PWA та автооновлення JSON.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
  const { initPWA } = await import('./updates.js');
  return initPWA();
}
