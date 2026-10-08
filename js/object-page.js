/**
 * @file object-page.js
 * @description Рендер універсальної картки об'єкта (мін, боєприпасів, IED тощо).
 */

import { getIndexItem, loadObject } from './loader.js';
import { renderAccordion } from './accordion.js';
import {
  collectMedia,
  createLightbox,
  enableLazyImages,
  renderGallery,
  renderVideoList,
} from './gallery.js';
import { DANGER_LABELS } from './filters.js';
import { addToHistory, isFavorite, toggleFavorite } from './storage.js';
import { initTheme } from './theme.js';
import { getObjectIdFromURL, goBack, imasURL, modelURL, normalizeImasId, objectURL, registerServiceWorker } from './router.js';
import { mountSTLViewer } from './stl-viewer.js';

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
 * Перевіряє, чи значення «порожнє» для UI.
 * @param {*} value
 * @returns {boolean}
 */
function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.values(value).every((v) => isEmpty(v));
  }
  return false;
}

/**
 * Форматує значення для відображення.
 * @param {*} value
 * @returns {string}
 */
function formatValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'boolean') return value ? 'так' : 'ні';
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => !isEmpty(v))
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join('; ');
  }
  return String(value);
}

/**
 * Форматує дальність польоту (км) для технічних характеристик.
 * @param {{ min_km?: number, max_km?: number }|null|undefined} range
 * @returns {string}
 */
function formatRangeKm(range) {
  if (!range || typeof range !== 'object') return '';
  const min = range.min_km;
  const max = range.max_km;
  const fmt = (n) => String(n).replace('.', ',');
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`;
  if (max != null) return `до ${fmt(max)}`;
  if (min != null) return `від ${fmt(min)}`;
  return '';
}

/**
 * Будує HTML списку ключ-значення.
 * @param {Array<[string, *]>} pairs
 * @returns {string}
 */
function kvHTML(pairs) {
  const rows = pairs
    .filter(([, value]) => !isEmpty(value))
    .map(
      ([key, value]) => `
        <li>
          <div class="kv-list__key">${escapeHTML(key)}</div>
          <div class="kv-list__value">${escapeHTML(formatValue(value))}</div>
        </li>
      `,
    )
    .join('');
  return rows ? `<ul class="kv-list">${rows}</ul>` : '';
}

/**
 * Будує HTML маркованого списку.
 * @param {unknown[]} items
 * @returns {string}
 */
function bulletsHTML(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<ul class="bullet-list">${items
    .map((item) => `<li>${escapeHTML(item)}</li>`)
    .join('')}</ul>`;
}

/**
 * Збирає 3D-моделі з блоку media.
 * @param {object} media
 * @returns {Array<{src: string, caption: string, alt: string}>}
 */
function collectModels(media = {}) {
  if (!Array.isArray(media.models)) return [];
  return media.models
    .map((item) => {
      if (typeof item === 'string') return { src: item, caption: '', alt: '' };
      if (!item?.src) return null;
      return {
        src: String(item.src),
        caption: item.caption || '',
        alt: item.alt || item.caption || '',
      };
    })
    .filter(Boolean);
}

/**
 * HTML вбудованого STL-переглядача.
 * @param {Array<{src: string, caption: string}>} models
 * @param {string} objectName
 * @returns {string}
 */
function modelsHTML(models, objectName) {
  if (!models.length) return '';
  return models
    .map((model) => {
      const fullscreen = modelURL(model.src, objectName);
      return `
        <div class="stl-embed">
          <div class="stl-viewer" data-stl-src="${escapeHTML(model.src)}" data-stl-fullscreen="${escapeHTML(fullscreen)}"></div>
          <div class="stl-embed__meta">
            ${model.caption ? `<p class="stl-embed__caption">${escapeHTML(model.caption)}</p>` : '<span></span>'}
            <a class="tag tag--link" href="${escapeHTML(fullscreen)}">На весь екран</a>
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Будує HTML посилань.
 * @param {Array<object|string>} refs
 * @returns {string}
 */
function referencesHTML(refs) {
  if (!Array.isArray(refs) || !refs.length) return '';
  const items = refs
    .map((ref) => {
      if (typeof ref === 'string') return `<li>${escapeHTML(ref)}</li>`;
      const title = ref.title || ref.name || ref.url || 'Джерело';
      if (ref.url) {
        return `<li><a href="${escapeHTML(ref.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)}</a></li>`;
      }
      return `<li>${escapeHTML(title)}</li>`;
    })
    .join('');
  return `<ul class="bullet-list">${items}</ul>`;
}

/**
 * Посилання на внутрішній довідник IMAS з кодів у disposal.imas.
 * @param {unknown} codes
 * @returns {string}
 */
function imasLinksHTML(codes) {
  if (!Array.isArray(codes) || !codes.length) return '';
  const links = codes
    .map((code) => {
      const label = String(code);
      const id = normalizeImasId(label);
      if (!id) return `<span class="tag">${escapeHTML(label)}</span>`;
      return `<a class="tag tag--link" href="${imasURL(id)}">${escapeHTML(label)}</a>`;
    })
    .join('');
  return `
    <div class="imas-inline">
      <div class="kv-list__key">IMAS</div>
      <div class="imas-inline__links">${links}</div>
    </div>
  `;
}

/**
 * Секції accordion — універсальні для всіх типів ВНП.
 * @param {object} data
 * @returns {{sections: Array<object>, media: object}}
 */
function buildSections(data) {
  const c = data.classification || {};
  const idn = data.identification || {};
  const tech = data.technical || {};
  const explosive = data.explosive || {};
  const fuze = data.fuze || {};
  const deployment = data.deployment || {};
  const hazards = data.hazards || {};
  const recognition = data.recognition || {};
  const detection = data.detection || {};
  const disposal = data.disposal || {};
  const medical = data.medical || {};
  const history = data.history || {};
  const media = data.media || {};
  const mediaItems = collectMedia(media);
  const models = collectModels(media);

  const galleryContainerId = 'objectGallery';
  const videoContainerId = 'objectVideos';

  const photos = mediaItems.filter((m) => m.type !== 'video');
  const videos = mediaItems.filter((m) => m.type === 'video');

  const galleryHTML = photos.length
    ? `<div class="gallery-grid" id="${galleryContainerId}"></div>`
    : '';

  const videosHTML = videos.length
    ? `<div class="video-list" id="${videoContainerId}"></div>`
    : '';

  const modelHTML = modelsHTML(models, c.name || data.id);

  const sections = [
    {
      id: 'identification',
      title: '📋 Основна інформація',
      open: true,
      contentHTML: [
        kvHTML([
          ['Назва', c.name],
          ['Категорія', c.category],
          ['Тип', c.type],
          ['Сімейство', c.family],
          ['Країна', c.country],
          ['Виробник', c.manufacturer],
          ['Статус', c.status],
          ['На озброєнні з', c.service_since],
          ['Синоніми', idn.aliases],
          ['Призначення', idn.purpose],
        ]),
        idn.description ? `<p>${escapeHTML(idn.description)}</p>` : '',
      ].join(''),
    },
    {
      id: 'model3d',
      title: '🧊 3D-модель',
      contentHTML: modelHTML,
    },
    {
      id: 'technical',
      title: '⚙ Технічні характеристики',
      contentHTML: [
        kvHTML([
          ['Діаметр, мм', tech.dimensions?.diameter_mm],
          ['Висота, мм', tech.dimensions?.height_mm],
          ['Довжина, мм', tech.dimensions?.length_mm],
          ['Ширина, мм', tech.dimensions?.width_mm],
          ['Маса, кг', tech.weight?.total_kg],
          ['Дальність польоту, км', formatRangeKm(tech.range)],
          ['Матеріал корпусу', tech.body?.material],
          ['Колір', tech.body?.color],
          ['Металевий вміст', tech.metal_content],
          ['Тип активації', tech.activation?.type],
          ['Мін. тиск, кг', tech.activation?.pressure_min_kg],
          ['Макс. тиск, кг', tech.activation?.pressure_max_kg],
        ]),
        tech.range?.notes ? `<p>${escapeHTML(tech.range.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'explosive',
      title: '💥 Вибухова речовина',
      contentHTML: [
        kvHTML([
          ['Тип ВР', explosive.type],
          ['Маса ВР, кг', explosive.weight_kg],
        ]),
        explosive.notes ? `<p>${escapeHTML(explosive.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'fuze',
      title: '🔧 Підривники',
      contentHTML: [
        kvHTML([
          ['Тип підривника', fuze.types],
          ['Сумісні підривники', fuze.compatible],
          ['Антиманіпуляція', fuze.anti_handling?.possible],
        ]),
        fuze.anti_handling?.description
          ? `<p>${escapeHTML(fuze.anti_handling.description)}</p>`
          : '',
        bulletsHTML(fuze.notes ? [fuze.notes] : []),
      ].join(''),
    },
    {
      id: 'deployment',
      title: '🌍 Застосування',
      contentHTML: [
        kvHTML([
          ['Способи встановлення', deployment.laying_methods],
          ['Сумісні носії', deployment.carriers],
          ['Типові місця', deployment.locations],
          ['Застосовувалась у', deployment.used_in],
        ]),
        deployment.notes ? `<p>${escapeHTML(deployment.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'recognition',
      title: '👀 Ознаки',
      contentHTML: [
        bulletsHTML(recognition.main_features || recognition.features),
        recognition.notes ? `<p>${escapeHTML(recognition.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'detection',
      title: '🧲 Виявлення',
      contentHTML: [
        kvHTML([
          ['Металошукач', detection.metal_detector],
          ['Георадар', detection.ground_penetrating_radar],
          ['Візуально', detection.visual],
        ]),
        detection.notes ? `<p>${escapeHTML(detection.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'hazards',
      title: '🚨 Небезпека',
      contentHTML: [
        bulletsHTML(hazards.items || hazards.list),
        kvHTML([
          ['Безпечна відстань (персонал), м', hazards.safe_distance?.personnel_m],
          ['Безпечна відстань (техніка), м', hazards.safe_distance?.equipment_m],
          ['Рекомендоване знешкодження', disposal.recommended],
          ['Ручне знешкодження', disposal.manual_disarming],
        ]),
        imasLinksHTML(disposal.imas),
        hazards.notes ? `<p>${escapeHTML(hazards.notes)}</p>` : '',
        disposal.notes ? `<p>${escapeHTML(disposal.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'medical',
      title: '⛑ Медична інформація',
      contentHTML: [
        bulletsHTML(medical.effects),
        medical.first_aid?.length
          ? `<p><strong>Перша допомога</strong></p>${bulletsHTML(medical.first_aid)}`
          : '',
        medical.notes ? `<p>${escapeHTML(medical.notes)}</p>` : '',
      ].join(''),
    },
    {
      id: 'history',
      title: '📚 Історія',
      contentHTML: [
        history.summary ? `<p>${escapeHTML(history.summary)}</p>` : '',
        kvHTML([
          ['На озброєнні з', history.service_since],
          ['Конфлікти', history.conflicts],
        ]),
      ].join(''),
    },
    {
      id: 'gallery',
      title: '📷 Галерея',
      contentHTML: galleryHTML,
    },
    {
      id: 'videos',
      title: '🎥 Відео',
      contentHTML: videosHTML,
    },
    {
      id: 'references',
      title: '📖 Джерела',
      contentHTML: referencesHTML(data.references),
    },
  ];

  return {
    sections,
    media: {
      photos,
      videos,
      models,
      galleryContainerId,
      videoContainerId,
    },
  };
}

/**
 * Категорії вантажу (те, що викидається з носія).
 */
const PAYLOAD_CATEGORIES = new Set(['Міни', 'Касетні боєприпаси']);

/**
 * Категорії носія (ракета, снаряд, бомба, мінометний постріл).
 */
const CARRIER_CATEGORIES = new Set([
  'Ракети РСЗВ',
  'Ракети',
  'Артилерійські снаряди',
  'Авіабомби',
  'Мінометні міни',
]);

const RELATED_ROLE_ORDER = ['payload', 'carrier', 'fuze', 'related'];

const RELATED_ROLE_LABELS = {
  payload: 'Вантаж',
  carrier: 'Носій',
  fuze: 'Підривник',
  related: 'Споріднені',
};

/**
 * Роль пов’язаного об’єкта відносно поточної картки.
 * @param {string} currentCategory
 * @param {string} relatedCategory
 * @returns {'payload'|'carrier'|'fuze'|'related'}
 */
function relatedRole(currentCategory, relatedCategory) {
  if (relatedCategory === 'Підривники') return 'fuze';
  if (CARRIER_CATEGORIES.has(currentCategory) && PAYLOAD_CATEGORIES.has(relatedCategory)) {
    return 'payload';
  }
  if (PAYLOAD_CATEGORIES.has(currentCategory) && CARRIER_CATEGORIES.has(relatedCategory)) {
    return 'carrier';
  }
  return 'related';
}

/**
 * ID з deployment.related_objects без поточного об’єкта.
 * @param {object} data
 * @returns {string[]}
 */
function collectRelatedIds(data) {
  const ids = data?.deployment?.related_objects;
  if (!Array.isArray(ids)) return [];
  const selfId = data.id;
  return [...new Set(ids.map((id) => String(id).trim()).filter((id) => id && id !== selfId))];
}

/**
 * Компактна картка пов’язаного об’єкта.
 * @param {object} item
 * @param {string} role
 * @returns {string}
 */
function relatedCardHTML(item, role) {
  const thumb = item.thumbnail
    ? `<img src="${escapeHTML(item.thumbnail)}" alt="${escapeHTML(item.name)}" loading="lazy" decoding="async">`
    : `<img src="img/logo.svg" alt="" loading="lazy">`;
  return `
    <a class="object-card object-card--related" href="${objectURL(item.id)}">
      <div class="object-card__media">${thumb}</div>
      <div class="object-card__body">
        <h3 class="object-card__title">${escapeHTML(item.name)}</h3>
        <div class="object-card__meta">${escapeHTML(item.category || '')}${item.type ? ` · ${escapeHTML(item.type)}` : ''}</div>
        <span class="tag">${escapeHTML(RELATED_ROLE_LABELS[role])}</span>
      </div>
    </a>
  `;
}

/**
 * Блок «Вантаж / Носій / Споріднені» під шапкою картки.
 * @param {object} data
 */
async function renderRelated(data) {
  const root = document.getElementById('objectRelated');
  if (!root) return;

  const ids = collectRelatedIds(data);
  if (!ids.length) {
    root.classList.add('is-hidden');
    root.innerHTML = '';
    return;
  }

  const items = (await Promise.all(ids.map((id) => getIndexItem(id)))).filter(Boolean);
  if (!items.length) {
    root.classList.add('is-hidden');
    root.innerHTML = '';
    return;
  }

  const currentCat = data.classification?.category || '';
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const item of items) {
    const role = relatedRole(currentCat, item.category);
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(item);
  }

  root.innerHTML = RELATED_ROLE_ORDER.filter((role) => groups.has(role))
    .map((role) => {
      const cards = groups.get(role).map((item) => relatedCardHTML(item, role)).join('');
      return `
        <div class="related-objects__group">
          <h2 class="related-objects__label">${RELATED_ROLE_LABELS[role]}</h2>
          <div class="related-objects__grid">${cards}</div>
        </div>
      `;
    })
    .join('');
  root.classList.remove('is-hidden');
}

/**
 * Оновлює кнопку «Обране».
 * @param {HTMLElement|null} button
 * @param {string} id
 */
function syncFavoriteButton(button, id) {
  if (!button) return;
  const active = isFavorite(id);
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
  const label = button.querySelector('[data-favorite-label]');
  if (label) {
    label.textContent = active ? 'В обраному' : 'Обране';
  }
}

/**
 * Рендерить шапку картки.
 * @param {object} data
 */
function renderHero(data) {
  const c = data.classification || {};
  const idn = data.identification || {};
  const mediaItems = collectMedia(data.media || {});
  const models = collectModels(data.media || {});
  const cover = mediaItems.find((m) => m.type !== 'video') || mediaItems[0];

  document.title = `${c.name || data.id} — Розмінування України`;

  const title = document.getElementById('objectTitle');
  const meta = document.getElementById('objectMeta');
  const desc = document.getElementById('objectDesc');
  const warning = document.getElementById('objectWarning');
  const heroMedia = document.getElementById('objectHeroMedia');

  if (title) title.textContent = c.name || data.id;

  if (meta) {
    const danger = c.danger_level || 'medium';
    meta.innerHTML = `
      <span class="tag">${escapeHTML(c.category || 'Без категорії')}</span>
      ${c.type ? `<span class="tag">${escapeHTML(c.type)}</span>` : ''}
      <span class="danger-badge" data-level="${escapeHTML(danger)}">${escapeHTML(DANGER_LABELS[danger] || danger)}</span>
      ${models[0] ? `<a class="tag tag--link" href="${escapeHTML(modelURL(models[0].src, c.name || data.id))}">3D-модель</a>` : ''}
    `;
  }

  if (desc) {
    desc.textContent = idn.description || '';
    desc.classList.toggle('is-hidden', !idn.description);
  }

  if (warning) {
    if (idn.warning) {
      warning.textContent = idn.warning;
      warning.classList.remove('is-hidden');
    } else {
      warning.classList.add('is-hidden');
    }
  }

  if (heroMedia) {
    if (cover) {
      heroMedia.innerHTML = `<img src="${escapeHTML(cover.src)}" alt="${escapeHTML(cover.alt || c.name || '')}" loading="eager">`;
    } else {
      heroMedia.innerHTML = `<img src="img/logo.svg" alt="">`;
    }
  }
}

/**
 * Ініціалізація сторінки картки.
 */
async function init() {
  initTheme();
  registerServiceWorker();

  const id = getObjectIdFromURL();
  const loading = document.getElementById('objectLoading');
  const error = document.getElementById('objectError');
  const content = document.getElementById('objectContent');

  document.getElementById('backBtn')?.addEventListener('click', () => goBack());

  const lightbox = createLightbox({
    root: document.getElementById('lightbox'),
    stage: document.getElementById('lightboxStage'),
    caption: document.getElementById('lightboxCaption'),
    closeBtn: document.getElementById('lightboxClose'),
    prevBtn: document.getElementById('lightboxPrev'),
    nextBtn: document.getElementById('lightboxNext'),
  });

  if (!id) {
    loading?.classList.add('is-hidden');
    error?.classList.remove('is-hidden');
    return;
  }

  try {
    const data = await loadObject(id);
    addToHistory(data.id || id);

    renderHero(data);
    await renderRelated(data);

    const favoriteBtn = document.getElementById('favoriteBtn');
    syncFavoriteButton(favoriteBtn, data.id || id);
    favoriteBtn?.addEventListener('click', () => {
      toggleFavorite(data.id || id);
      syncFavoriteButton(favoriteBtn, data.id || id);
    });

    const { sections, media: mediaMeta } = buildSections(data);

    renderAccordion(document.getElementById('objectAccordion'), sections);

    lightbox.setItems(mediaMeta.photos);

    const photoGrid = document.getElementById(mediaMeta.galleryContainerId);
    if (photoGrid) {
      renderGallery(photoGrid, mediaMeta.photos, (index) => {
        lightbox.open(index);
      });
    }

    const videoList = document.getElementById(mediaMeta.videoContainerId);
    if (videoList) {
      renderVideoList(videoList, mediaMeta.videos);
    }

    document.querySelectorAll('[data-stl-src]').forEach((el) => {
      mountSTLViewer(el, {
        src: el.dataset.stlSrc,
        fullscreenHref: el.dataset.stlFullscreen,
        autoRotate: true,
      });
    });

    enableLazyImages(document.getElementById('objectContent'));

    loading?.classList.add('is-hidden');
    content?.classList.remove('is-hidden');
  } catch (err) {
    console.error(err);
    loading?.classList.add('is-hidden');
    error?.classList.remove('is-hidden');
  }
}

init();
