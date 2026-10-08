/**
 * @file loader.js
 * @description Завантаження маніфесту, індексів категорій та карток об'єктів.
 */

import { CATEGORY_FOLDERS } from './filters.js';

const MANIFEST_URL = 'data/index.json';

/** @type {{version?: string, categories?: Array, objects: Array}|null} */
let indexCache = null;

/** @type {object|null} */
let manifestCache = null;

/** @type {Map<string, object>} */
const categoryIndexCache = new Map();

/** @type {Map<string, object>} */
const objectCache = new Map();

/**
 * Будує URL картки за id і категорією.
 * @param {string} id
 * @param {string} [category]
 * @returns {string}
 */
function objectUrl(id, category) {
  const folder = CATEGORY_FOLDERS[category] || 'other';
  return `data/objects/${folder}/${encodeURIComponent(id)}.json`;
}

/**
 * Завантажує JSON за URL.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function fetchJSON(url) {
  // no-cache: перевіряє сервер (або SW network-first), щоб нові JSON підтягувались онлайн.
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Не вдалося завантажити ${url}: ${response.status}`);
  }
  return response.json();
}

/**
 * Завантажує легкий маніфест (список категорій без карток).
 * @param {boolean} [force=false]
 * @returns {Promise<object>}
 */
export async function loadManifest(force = false) {
  if (manifestCache && !force) return manifestCache;
  manifestCache = await fetchJSON(MANIFEST_URL);
  if (!Array.isArray(manifestCache.categories)) {
    manifestCache.categories = [];
  }
  return manifestCache;
}

/**
 * Завантажує індекс однієї категорії за id теки (mines, grenades, …).
 * @param {string} categoryId
 * @param {boolean} [force=false]
 * @returns {Promise<{category?: string, folder?: string, objects: Array}>}
 */
export async function loadCategoryIndex(categoryId, force = false) {
  if (!categoryId) throw new Error('categoryId обовʼязковий');
  const id = String(categoryId).trim();
  if (!force && categoryIndexCache.has(id)) {
    return categoryIndexCache.get(id);
  }

  const manifest = await loadManifest(force);
  const entry = manifest.categories.find((item) => item.id === id);
  if (!entry?.index) {
    throw new Error(`Категорія «${id}» відсутня в маніфесті`);
  }

  const data = await fetchJSON(entry.index);
  if (!Array.isArray(data.objects)) {
    data.objects = [];
  }
  // Гарантуємо category на кожній картці (на випадок неповних записів).
  if (data.category) {
    data.objects.forEach((item) => {
      if (!item.category) item.category = data.category;
    });
  }
  categoryIndexCache.set(id, data);
  return data;
}

/**
 * Завантажує й об'єднує індекси всіх категорій.
 * Повертає той самий контракт, що й раніше: { …manifest, objects: [...] }.
 * @param {boolean} [force=false]
 * @returns {Promise<{version?: string, categories?: Array, objects: Array}>}
 */
export async function loadIndex(force = false) {
  if (indexCache && !force) return indexCache;

  const manifest = await loadManifest(force);
  // count — довідкове; вантажимо всі категорії з полем index.
  // Порожні індекси легкі; так не ламається каталог, якщо count забули оновити.
  const toLoad = manifest.categories.filter((item) => item.index);

  const parts = await Promise.all(
    toLoad.map(async (item) => {
      try {
        return await loadCategoryIndex(item.id, force);
      } catch (error) {
        console.warn('category index failed', item.id, error);
        return { objects: [] };
      }
    }),
  );

  const objects = parts.flatMap((part) => part.objects || []);

  indexCache = {
    ...manifest,
    objects,
  };
  return indexCache;
}

/**
 * Завантажує повну картку об'єкта за id.
 * Шлях: data/objects/{folder}/{id}.json
 * @param {string} id
 * @param {boolean} [force=false]
 * @returns {Promise<object>}
 */
export async function loadObject(id, force = false) {
  if (!id) throw new Error('id обовʼязковий');
  const normalized = String(id).trim();
  if (!force && objectCache.has(normalized)) {
    return objectCache.get(normalized);
  }
  const meta = await getIndexItem(normalized);
  if (!meta) {
    throw new Error(`Об'єкт «${normalized}» відсутній в індексі`);
  }
  const data = await fetchJSON(objectUrl(normalized, meta.category));
  objectCache.set(normalized, data);
  return data;
}

/**
 * Повертає елемент індексу за id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getIndexItem(id) {
  const index = await loadIndex();
  return index.objects.find((item) => item.id === id) || null;
}

/**
 * Попередньо завантажує кілька карток (для масштабування).
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
export async function preloadObjects(ids = []) {
  const tasks = ids.map(async (id) => {
    try {
      return await loadObject(id);
    } catch (error) {
      console.warn('preload failed', id, error);
      return null;
    }
  });
  return (await Promise.all(tasks)).filter(Boolean);
}

/**
 * Очищає кеш у пам'яті (корисно після оновлення SW).
 */
export function clearLoaderCache() {
  indexCache = null;
  manifestCache = null;
  categoryIndexCache.clear();
  objectCache.clear();
}
