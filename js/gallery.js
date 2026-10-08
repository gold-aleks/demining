/**
 * @file gallery.js
 * @description Галерея медіа з lazy-loading, lightbox та підтримкою YouTube.
 */

/**
 * Екранує HTML-атрибути/текст.
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
 * Витягує YouTube video id з різних форматів URL.
 * Підтримка: watch, shorts, embed, youtu.be, з query-параметрами.
 * @param {string} value
 * @returns {string|null}
 */
export function extractYouTubeId(value) {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();

  // Готовий id (11 символів)
  if (/^[\w-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.searchParams.get('v')) {
        const id = url.searchParams.get('v');
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      // /shorts/ID, /embed/ID, /live/ID, /v/ID
      if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
        const id = parts[1];
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    // не URL — ігноруємо
  }

  const fallback = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/);
  return fallback ? fallback[1] : null;
}

/**
 * Чи є значення YouTube-посиланням / id.
 * @param {string} value
 * @returns {boolean}
 */
export function isYouTubeSource(value) {
  return Boolean(extractYouTubeId(value));
}

/**
 * URL прев'ю YouTube.
 * @param {string} id
 * @returns {string}
 */
export function getYouTubeThumbnail(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * URL embed-плеєра YouTube.
 * @param {string} id
 * @param {{autoplay?: boolean}} [options]
 * @returns {string}
 */
export function getYouTubeEmbedUrl(id, { autoplay = false } = {}) {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (autoplay) params.set('autoplay', '1');
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

/**
 * Нормалізує медіа-елемент до єдиного формату.
 * Підтримує локальні файли та YouTube (provider: "youtube" або URL).
 * @param {object|string} item
 * @param {string} [fallbackType='photo']
 * @returns {{src: string, alt: string, type: string, caption: string, provider: string, youtubeId: string|null, thumb: string|null}|null}
 */
export function normalizeMediaItem(item, fallbackType = 'photo') {
  if (!item) return null;

  if (typeof item === 'string') {
    const youtubeId = extractYouTubeId(item);
    if (youtubeId) {
      return {
        src: item,
        alt: '',
        type: 'video',
        caption: '',
        provider: 'youtube',
        youtubeId,
        thumb: getYouTubeThumbnail(youtubeId),
      };
    }
    return {
      src: item,
      alt: '',
      type: fallbackType,
      caption: '',
      provider: 'local',
      youtubeId: null,
      thumb: null,
    };
  }

  const src = item.src || item.url || item.id || '';
  if (!src && !item.youtubeId) return null;

  const explicitProvider = String(item.provider || '').toLowerCase();
  const youtubeId =
    item.youtubeId ||
    extractYouTubeId(src) ||
    (explicitProvider === 'youtube' ? extractYouTubeId(item.id || '') : null);

  const isYouTube = explicitProvider === 'youtube' || Boolean(youtubeId);

  if (isYouTube && youtubeId) {
    return {
      src: src || `https://www.youtube.com/watch?v=${youtubeId}`,
      alt: item.alt || item.caption || '',
      type: 'video',
      caption: item.caption || item.alt || '',
      provider: 'youtube',
      youtubeId,
      thumb: item.thumb || item.thumbnail || getYouTubeThumbnail(youtubeId),
    };
  }

  return {
    src,
    alt: item.alt || item.caption || '',
    type: item.type || fallbackType,
    caption: item.caption || item.alt || '',
    provider: 'local',
    youtubeId: null,
    thumb: item.thumb || item.thumbnail || null,
  };
}

/**
 * Збирає всі медіа з блоку media картки.
 * @param {object} media
 * @returns {Array<object>}
 */
export function collectMedia(media = {}) {
  const groups = [
    ['photos', 'photo'],
    ['schemes', 'scheme'],
    ['xray', 'xray'],
    ['drawings', 'drawing'],
    ['videos', 'video'],
  ];

  const result = [];
  groups.forEach(([key, type]) => {
    (media[key] || []).forEach((item) => {
      const normalized = normalizeMediaItem(item, type);
      if (normalized) result.push(normalized);
    });
  });
  return result;
}

/**
 * Увімкнення lazy-loading + fade для зображень у контейнері.
 * @param {ParentNode} root
 */
export function enableLazyImages(root = document) {
  const images = root.querySelectorAll('img[loading="lazy"]');
  images.forEach((img) => {
    img.classList.add('lazy-fade');
    if (img.complete) {
      img.classList.add('is-loaded');
      return;
    }
    img.addEventListener(
      'load',
      () => {
        img.classList.add('is-loaded');
      },
      { once: true },
    );
  });
}

/**
 * HTML прев'ю для елемента галереї.
 * @param {object} item
 * @returns {string}
 */
function galleryThumbHTML(item) {
  if (item.provider === 'youtube' && item.youtubeId) {
    const thumb = escapeHTML(item.thumb || getYouTubeThumbnail(item.youtubeId));
    const alt = escapeHTML(item.alt || item.caption || 'YouTube відео');
    return `
      <span class="gallery-item__youtube">
        <img src="${thumb}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <span class="gallery-item__play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M8 5v14l11-7z"></path>
          </svg>
        </span>
        <span class="gallery-item__badge">YouTube</span>
      </span>
    `;
  }

  if (item.type === 'video') {
    return `<video src="${escapeHTML(item.src)}" muted preload="metadata" aria-label="${escapeHTML(item.alt || 'Відео')}"></video>`;
  }

  return `<img src="${escapeHTML(item.src)}" alt="${escapeHTML(item.alt || '')}" loading="lazy" decoding="async">`;
}

/**
 * HTML для lightbox stage.
 * @param {object} item
 * @returns {string}
 */
function lightboxMediaHTML(item) {
  if (item.provider === 'youtube' && item.youtubeId) {
    const embed = escapeHTML(getYouTubeEmbedUrl(item.youtubeId, { autoplay: true }));
    const title = escapeHTML(item.caption || item.alt || 'YouTube відео');
    return `
      <div class="lightbox__embed">
        <iframe
          class="lightbox__media lightbox__iframe"
          src="${embed}"
          title="${title}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
    `;
  }

  if (item.type === 'video') {
    return `<video class="lightbox__media" src="${escapeHTML(item.src)}" controls autoplay></video>`;
  }

  return `<img class="lightbox__media" src="${escapeHTML(item.src)}" alt="${escapeHTML(item.alt || '')}">`;
}

/**
 * HTML одного відео-блока для окремої секції accordion (не галерея).
 * @param {object} item
 * @returns {string}
 */
function videoBlockHTML(item) {
  const caption = escapeHTML(item.caption || item.alt || '');
  const captionHTML = caption
    ? `<p class="video-block__caption">${caption}</p>`
    : '';

  if (item.provider === 'youtube' && item.youtubeId) {
    const embed = escapeHTML(getYouTubeEmbedUrl(item.youtubeId, { autoplay: false }));
    const title = caption || 'YouTube відео';
    return `
      <article class="video-block">
        <div class="video-block__player">
          <iframe
            src="${embed}"
            title="${title}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
        ${captionHTML}
        <p class="video-block__meta">
          <a href="${escapeHTML(item.src)}" target="_blank" rel="noopener noreferrer">Відкрити на YouTube</a>
        </p>
      </article>
    `;
  }

  return `
    <article class="video-block">
      <div class="video-block__player">
        <video src="${escapeHTML(item.src)}" controls preload="metadata" playsinline></video>
      </div>
      ${captionHTML}
    </article>
  `;
}

/**
 * Рендерить окремий список відео (локальні + YouTube) поза галереєю.
 * @param {HTMLElement|null} container
 * @param {Array<object>} items
 */
export function renderVideoList(container, items) {
  if (!container) return;
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = items.map(videoBlockHTML).join('');
}

/**
 * Рендерить сітку галереї.
 * @param {HTMLElement|null} container
 * @param {Array<object>} items
 * @param {(index: number) => void} onOpen
 */
export function renderGallery(container, items, onOpen) {
  if (!container) return '';
  if (!items.length) {
    container.innerHTML = '';
    return '';
  }

  container.innerHTML = items
    .map((item, index) => `
      <button type="button" class="gallery-item" data-index="${index}" aria-label="Відкрити медіа">
        ${galleryThumbHTML(item)}
      </button>
    `)
    .join('');

  container.querySelectorAll('.gallery-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      onOpen?.(index);
    });
  });

  enableLazyImages(container);
  return container.innerHTML;
}

/**
 * Створює контролер lightbox.
 * @param {object} options
 * @returns {{open: Function, close: Function, setItems: Function}}
 */
export function createLightbox({
  root,
  stage,
  caption,
  closeBtn,
  prevBtn,
  nextBtn,
} = {}) {
  let items = [];
  let current = 0;

  const sync = () => {
    if (!stage) return;
    const item = items[current];
    if (!item) {
      stage.innerHTML = '';
      if (caption) caption.textContent = '';
      return;
    }

    stage.innerHTML = lightboxMediaHTML(item);
    if (caption) caption.textContent = item.caption || item.alt || '';
  };

  const open = (index = 0) => {
    if (!items.length || !root) return;
    current = Math.max(0, Math.min(index, items.length - 1));
    root.hidden = false;
    root.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    sync();
  };

  const close = () => {
    if (!root) return;
    root.classList.remove('is-open');
    root.hidden = true;
    document.body.style.overflow = '';
    // Очищаємо iframe/video, щоб зупинити відтворення.
    if (stage) stage.innerHTML = '';
  };

  const step = (delta) => {
    if (!items.length) return;
    current = (current + delta + items.length) % items.length;
    sync();
  };

  closeBtn?.addEventListener('click', close);
  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));

  root?.addEventListener('click', (event) => {
    if (event.target === root) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!root?.classList.contains('is-open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  return {
    open,
    close,
    setItems: (nextItems) => {
      items = Array.isArray(nextItems) ? nextItems : [];
    },
  };
}
