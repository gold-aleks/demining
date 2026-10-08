/**
 * @file updates.js
 * @description PWA: встановлення додатку, оновлення SW і автопідтягування JSON з сервера.
 */

import { clearLoaderCache, loadManifest } from './loader.js';

/**
 * Корінь додатку відносно поточного URL.
 * На сервері: https://smartmetro.pp.ua/mines/ → "/mines/"
 * Локально з кореня сервера → "/"
 * @returns {string}
 */
export function getAppBase() {
  return new URL('./', window.location.href).pathname;
}

const CONTENT_STAMP_KEY = 'eore_content_stamp';
const MANIFEST_CHECK_URL = 'data/index.json';
/** Інтервал фонової перевірки контенту (мс). */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** @type {BeforeInstallPromptEvent|null} */
let deferredInstallPrompt = null;

/** @type {boolean} */
let checkingContent = false;

/** @type {number|null} */
let checkTimer = null;

/**
 * @typedef {object} BeforeInstallPromptEvent
 * @property {Function} prompt
 * @property {Promise<{outcome: string}>} userChoice
 */

/**
 * Формує штамп контенту з сирого JSON маніфесту.
 * Будь-яка зміна data/index.json (version, updated, count, нові категорії) дає новий штамп.
 * @param {string} raw
 * @returns {string}
 */
export function contentStampFromRaw(raw) {
  const text = String(raw || '').replace(/\s+/g, '');
  if (!text) return '';
  // Простий стабільний хеш — без залежності від crypto.subtle (HTTP/старі WebView).
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length.toString(36)}:${(hash >>> 0).toString(36)}`;
}

/**
 * Читає збережений штамп контенту.
 * @returns {string}
 */
function getStoredStamp() {
  try {
    return localStorage.getItem(CONTENT_STAMP_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Зберігає штамп контенту.
 * @param {string} stamp
 */
function setStoredStamp(stamp) {
  try {
    if (stamp) localStorage.setItem(CONTENT_STAMP_KEY, stamp);
  } catch (error) {
    console.warn('updates: не вдалося зберегти штамп', error);
  }
}

/**
 * Просить SW очистити кеш JSON.
 * @returns {Promise<void>}
 */
async function clearDataCache() {
  if (!navigator.serviceWorker?.controller) return;
  try {
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(resolve, 1500);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        resolve();
      };
      navigator.serviceWorker.controller.postMessage(
        { type: 'CLEAR_DATA_CACHE' },
        [channel.port2],
      );
    });
  } catch (error) {
    console.warn('updates: CLEAR_DATA_CACHE failed', error);
  }
}

/**
 * Показує нижній тост.
 * @param {string} message
 * @param {{actionLabel?: string, onAction?: () => void, timeout?: number}} [options]
 * @returns {HTMLElement}
 */
function showToast(message, options = {}) {
  let root = document.getElementById('pwaToast');
  if (!root) {
    root = document.createElement('div');
    root.id = 'pwaToast';
    root.className = 'pwa-toast';
    root.setAttribute('role', 'status');
    root.hidden = true;
    document.body.appendChild(root);
  }

  root.innerHTML = '';
  const text = document.createElement('span');
  text.className = 'pwa-toast__text';
  text.textContent = message;
  root.appendChild(text);

  if (options.actionLabel && options.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pwa-toast__action';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', () => options.onAction?.());
    root.appendChild(btn);
  }

  root.hidden = false;
  root.classList.add('is-visible');

  if (options.timeout) {
    window.setTimeout(() => {
      root.classList.remove('is-visible');
      root.hidden = true;
    }, options.timeout);
  }

  return root;
}

/**
 * Додає кнопку «Встановити» у хедер (якщо браузер дозволяє).
 */
function ensureInstallButton() {
  const actions = document.querySelector('.header-actions');
  if (!actions || document.getElementById('pwaInstallBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'pwaInstallBtn';
  btn.type = 'button';
  btn.className = 'icon-btn is-hidden';
  btn.setAttribute('aria-label', 'Встановити додаток');
  btn.title = 'Встановити';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12"></path>
      <path d="M8 11l4 4 4-4"></path>
      <path d="M4 21h16"></path>
    </svg>
  `;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch {
      /* ignore */
    }
    deferredInstallPrompt = null;
    btn.classList.add('is-hidden');
  });

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    actions.insertBefore(btn, themeBtn);
  } else {
    actions.appendChild(btn);
  }
}

/**
 * Показує/ховає кнопку встановлення.
 * @param {boolean} visible
 */
function setInstallButtonVisible(visible) {
  const btn = document.getElementById('pwaInstallBtn');
  if (!btn) return;
  btn.classList.toggle('is-hidden', !visible);
}

/**
 * Підписується на beforeinstallprompt.
 */
function bindInstallPrompt() {
  ensureInstallButton();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = /** @type {BeforeInstallPromptEvent} */ (event);
    setInstallButtonVisible(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallButtonVisible(false);
    showToast('Додаток встановлено', { timeout: 3500 });
  });
}

/**
 * Застосовує оновлення контенту: чистить кеші й перезавантажує сторінку.
 * @param {string} stamp
 * @param {{silent?: boolean}} [options]
 */
async function applyContentUpdate(stamp, options = {}) {
  setStoredStamp(stamp);
  clearLoaderCache();
  await clearDataCache();

  if (options.silent) {
    window.location.reload();
    return;
  }

  showToast('Доступні нові дані', {
    actionLabel: 'Оновити',
    onAction: () => window.location.reload(),
  });

  // Автооновлення через кілька секунд, якщо користувач не натиснув.
  window.setTimeout(() => window.location.reload(), 4000);
}

/**
 * Завантажує текст ресурсу без HTTP-кешу.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchTextNoStore(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return '';
  return response.text();
}

/**
 * Збирає штамп з маніфесту та індексів категорій (саме вони змінюються при додаванні карток).
 * @returns {Promise<string>}
 */
async function fetchRemoteContentStamp() {
  const manifestRaw = await fetchTextNoStore(MANIFEST_CHECK_URL);
  if (!manifestRaw) return '';

  /** @type {{categories?: Array<{index?: string}>}} */
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    return contentStampFromRaw(manifestRaw);
  }

  const indexUrls = (manifest.categories || [])
    .map((item) => item.index)
    .filter(Boolean);

  // Додаткові JSON, які теж можуть оновлюватись на сервері.
  indexUrls.push('data/abbreviations.json', 'data/imas/index.json');

  const bodies = await Promise.all(
    indexUrls.map((url) => fetchTextNoStore(url).catch(() => '')),
  );

  return contentStampFromRaw([manifestRaw, ...bodies].join('\n'));
}

/**
 * Перевіряє JSON на сервері й підтягує зміни.
 * @param {{forceReload?: boolean}} [options]
 * @returns {Promise<boolean>} true, якщо знайдено оновлення
 */
export async function checkContentUpdate(options = {}) {
  if (!navigator.onLine || checkingContent) return false;
  checkingContent = true;

  try {
    const remoteStamp = await fetchRemoteContentStamp();
    if (!remoteStamp) return false;

    const localStamp = getStoredStamp();

    // Перший запуск після встановлення — лише фіксуємо штамп.
    if (!localStamp) {
      setStoredStamp(remoteStamp);
      return false;
    }

    if (remoteStamp === localStamp) return false;

    await applyContentUpdate(remoteStamp, { silent: Boolean(options.forceReload) });
    return true;
  } catch (error) {
    console.warn('updates: перевірка контенту не вдалася', error);
    return false;
  } finally {
    checkingContent = false;
  }
}

/**
 * Фіксує поточний штамп контенту, якщо ще не збережений.
 * @returns {Promise<void>}
 */
export async function syncContentStampFromCache() {
  if (getStoredStamp()) return;
  try {
    const stamp = navigator.onLine
      ? await fetchRemoteContentStamp()
      : contentStampFromRaw(JSON.stringify(await loadManifest()));
    if (stamp) setStoredStamp(stamp);
  } catch {
    /* ignore */
  }
}

/**
 * Реєструє SW і стежить за оновленням оболонки.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
async function registerAndWatchServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    // На проді корінь — /mines/; локально — каталог поточної сторінки.
    const base = getAppBase();
    const registration = await navigator.serviceWorker.register(`${base}sw.js`, {
      scope: base,
    });

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          // Просимо новий SW стати активним (на випадок, якщо skipWaiting ще не спрацював).
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    // Перезавантаження лише при зміні вже існуючого контролера (не на першій установці SW).
    if (navigator.serviceWorker.controller) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        showToast('Оновлено додаток…', { timeout: 2000 });
        window.location.reload();
      });
    }

    // Періодична перевірка нового sw.js.
    const askUpdate = () => {
      registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') askUpdate();
    });
    window.addEventListener('online', askUpdate);

    return registration;
  } catch (error) {
    console.warn('Service Worker не зареєстровано', error);
    return null;
  }
}

/**
 * Планує фонові перевірки JSON на сервері.
 */
function scheduleContentChecks() {
  const run = () => {
    checkContentUpdate().catch(() => {});
  };

  if (checkTimer) window.clearInterval(checkTimer);
  checkTimer = window.setInterval(run, CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  window.addEventListener('online', run);
  window.addEventListener('focus', run);

  // Невелика затримка після старту, щоб не конкурувати з першим рендером.
  window.setTimeout(run, 2500);
}

/**
 * Повна ініціалізація PWA: SW, install, автооновлення JSON.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function initPWA() {
  bindInstallPrompt();
  const registration = await registerAndWatchServiceWorker();
  // Якщо штампу ще немає (перший запуск офлайн) — зафіксуємо з кешу.
  if (!getStoredStamp()) {
    await syncContentStampFromCache();
  }
  scheduleContentChecks();
  return registration;
}
