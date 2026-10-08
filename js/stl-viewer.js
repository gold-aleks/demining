/**
 * @file stl-viewer.js
 * @description Інтерактивний перегляд GLB / STL у браузері (Three.js, без збірки).
 */

import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { STLLoader } from '../vendor/three/STLLoader.js';

const OLIVE = 0x6b7a3a;
const GLTF = new GLTFLoader();
const STL = new STLLoader();
const GLB_MAGIC = 0x46546c67;

/**
 * Чи активна світла тема.
 * @returns {boolean}
 */
function isLightTheme() {
  return document.body.classList.contains('theme-light');
}

/**
 * Колір фону сцени під поточну тему.
 * @returns {number}
 */
function sceneBackground() {
  return isLightTheme() ? 0xe8eef4 : 0x1d2733;
}

/**
 * Розширення з URL або імені файлу.
 * @param {string} value
 * @returns {string}
 */
function fileExtension(value) {
  const clean = String(value || '').split('?')[0];
  const name = clean.split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Чи буфер — бінарний glTF (GLB).
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
function isGLBBuffer(buffer) {
  if (!buffer || buffer.byteLength < 4) return false;
  return new DataView(buffer).getUint32(0, true) === GLB_MAGIC;
}

/**
 * Орієнтує «диск» на площину XZ (Y вгору) і центрує геометрію STL.
 * @param {THREE.BufferGeometry} geometry
 */
function orientFlat(geometry) {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox.getSize(size);

  const axes = [
    { axis: 'x', value: size.x },
    { axis: 'y', value: size.y },
    { axis: 'z', value: size.z },
  ].sort((a, b) => a.value - b.value);

  if (axes[0].axis === 'x') geometry.rotateZ(Math.PI / 2);
  else if (axes[0].axis === 'z') geometry.rotateX(-Math.PI / 2);

  geometry.center();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/**
 * Центрує готову GLB-сцену, не змінюючи орієнтацію.
 * @param {THREE.Object3D} object
 */
function centerObject(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
}

/**
 * Звільняє геометрію, матеріали й текстури об'єкта.
 * @param {THREE.Object3D} object
 */
function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value && value.isTexture) value.dispose();
      });
      material.dispose();
    });
  });
}

/**
 * Будує HTML панелі керування.
 * @param {boolean} showFullscreen
 * @returns {string}
 */
function toolbarHTML(showFullscreen) {
  const btn = (action, label, svg) =>
    `<button type="button" class="stl-viewer__btn" data-stl-action="${action}" title="${label}" aria-label="${label}">${svg}</button>`;

  return `
    <div class="stl-viewer__toolbar" role="toolbar" aria-label="Керування 3D">
      ${btn(
        'autorotate',
        'Автообертання',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 4v6h-6"></path></svg>',
      )}
      ${btn(
        'reset',
        'Скинути ракурс',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path></svg>',
      )}
      ${
        showFullscreen
          ? btn(
              'fullscreen',
              'На весь екран',
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"></path></svg>',
            )
          : ''
      }
    </div>
  `;
}

/**
 * Монтує інтерактивний 3D-переглядач у контейнер.
 * @param {HTMLElement} container
 * @param {{src?: string, buffer?: ArrayBuffer, filename?: string, color?: number, autoRotate?: boolean, fullscreenHref?: string}} [options]
 * @returns {{dispose: () => void, loadFromUrl: (url: string) => Promise<void>, loadFromBuffer: (buffer: ArrayBuffer, filename?: string) => Promise<void>, resetView: () => void}}
 */
/**
 * Порожній API, коли WebGL недоступний — картка сторінки лишається робочою.
 * @param {HTMLElement} container
 * @param {string} message
 * @returns {{ready: Promise<void>, dispose: () => void, loadFromUrl: () => Promise<void>, loadFromBuffer: () => Promise<void>, resetView: () => void}}
 */
function unavailableViewer(container, message) {
  container.classList.add('stl-viewer');
  container.innerHTML = `<div class="stl-viewer__status">${message}</div>`;
  const noop = async () => {};
  return {
    ready: Promise.resolve(),
    dispose() {
      container.innerHTML = '';
    },
    loadFromUrl: noop,
    loadFromBuffer: noop,
    resetView() {},
  };
}

export function mountSTLViewer(container, options = {}) {
  if (!container) {
    throw new Error('STL viewer: контейнер не задано');
  }

  const color = options.color ?? OLIVE;
  let autoRotate = options.autoRotate !== false;
  let disposed = false;
  let model = null;
  let frameId = 0;

  container.classList.add('stl-viewer');
  container.innerHTML = `
    <div class="stl-viewer__stage"></div>
    <div class="stl-viewer__status">Завантаження 3D-моделі…</div>
    ${toolbarHTML(Boolean(options.fullscreenHref))}
  `;

  const stage = container.querySelector('.stl-viewer__stage');
  const status = container.querySelector('.stl-viewer__status');
  const toolbar = container.querySelector('.stl-viewer__toolbar');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    console.warn('STL viewer: WebGL недоступний', error);
    return unavailableViewer(
      container,
      '3D-перегляд недоступний у цьому браузері. Відкрийте модель на весь екран або на іншому пристрої.',
    );
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = false;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneBackground());

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  camera.position.set(180, 140, 180);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = autoRotate;
  controls.autoRotateSpeed = 1.1;
  controls.minDistance = 20;
  controls.maxDistance = 2000;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xd7e3ee, 0x3a3328, 1.15));

  const key = new THREE.DirectionalLight(0xfff4d6, 1.35);
  key.position.set(120, 220, 80);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x9eb6c8, 0.55);
  fill.position.set(-160, 40, -120);
  scene.add(fill);

  const stlMaterial = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.28,
    roughness: 0.52,
    flatShading: false,
  });

  /**
   * Показує статус або ховає його.
   * @param {string} [text]
   */
  function setStatus(text) {
    if (!text) {
      status.hidden = true;
      status.textContent = '';
      return;
    }
    status.hidden = false;
    status.textContent = text;
  }

  /**
   * Підганяє canvas під розмір контейнера.
   */
  function resize() {
    const width = stage.clientWidth || container.clientWidth || 320;
    const height = stage.clientHeight || 280;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  /**
   * Ставить камеру так, щоб уся модель була в кадрі.
   */
  function fitCamera() {
    if (!model) return;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const dist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const offset = dist * 1.22;

    camera.near = Math.max(offset / 200, 0.1);
    camera.far = offset * 40;
    camera.position.set(center.x + offset * 0.72, center.y + offset * 0.55, center.z + offset * 0.72);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = maxDim * 0.4;
    controls.maxDistance = maxDim * 12;
    controls.update();
  }

  /**
   * Замінює поточну модель на сцені.
   * @param {THREE.Object3D} next
   */
  function setModel(next) {
    if (model) {
      scene.remove(model);
      disposeObject(model);
    }
    model = next;
    scene.add(model);
    fitCamera();
    setStatus('');
  }

  /**
   * Будує меш зі STL-геометрії.
   * @param {THREE.BufferGeometry} geometry
   */
  function setSTLGeometry(geometry) {
    orientFlat(geometry);
    const mesh = new THREE.Mesh(geometry, stlMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    setModel(mesh);
  }

  /**
   * Завантажує модель з URL.
   * @param {string} url
   */
  async function loadFromUrl(url) {
    setStatus('Завантаження 3D-моделі…');
    const ext = fileExtension(url);

    if (ext === 'glb' || ext === 'gltf') {
      const gltf = await new Promise((resolve, reject) => {
        GLTF.load(
          url,
          resolve,
          (event) => {
            if (event.total) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setStatus(`Завантаження 3D-моделі… ${pct}%`);
            }
          },
          reject,
        );
      });
      centerObject(gltf.scene);
      setModel(gltf.scene);
      return;
    }

    const geometry = await new Promise((resolve, reject) => {
      STL.load(url, resolve, undefined, reject);
    });
    setSTLGeometry(geometry);
  }

  /**
   * Завантажує модель з буфера.
   * @param {ArrayBuffer} buffer
   * @param {string} [filename]
   */
  async function loadFromBuffer(buffer, filename = '') {
    setStatus('Обробка моделі…');
    const ext = fileExtension(filename);

    if (ext === 'glb' || ext === 'gltf' || (!ext && isGLBBuffer(buffer))) {
      const gltf = await new Promise((resolve, reject) => {
        GLTF.parse(buffer, '', resolve, reject);
      });
      centerObject(gltf.scene);
      setModel(gltf.scene);
      return;
    }

    setSTLGeometry(STL.parse(buffer));
  }

  /**
   * Скидає ракурс камери.
   */
  function resetView() {
    fitCamera();
  }

  /**
   * Синхронізує стан кнопок.
   */
  function syncButtons() {
    toolbar.querySelector('[data-stl-action="autorotate"]')?.classList.toggle('is-active', autoRotate);
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-stl-action]');
    if (!button) return;
    const action = button.dataset.stlAction;

    if (action === 'autorotate') {
      autoRotate = !autoRotate;
      controls.autoRotate = autoRotate;
    } else if (action === 'reset') {
      resetView();
    } else if (action === 'fullscreen' && options.fullscreenHref) {
      window.location.href = options.fullscreenHref;
    }
    syncButtons();
  });

  const onTheme = () => {
    scene.background = new THREE.Color(sceneBackground());
  };
  const themeObserver = new MutationObserver(onTheme);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);

  let visible = true;
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    },
    { threshold: 0.05 },
  );
  io.observe(container);

  /**
   * Кадр анімації.
   */
  function tick() {
    if (disposed) return;
    frameId = requestAnimationFrame(tick);
    if (!visible) return;
    controls.autoRotate = autoRotate;
    controls.update();
    renderer.render(scene, camera);
  }

  resize();
  requestAnimationFrame(() => {
    resize();
    requestAnimationFrame(resize);
  });
  window.addEventListener('resize', resize);
  syncButtons();
  tick();

  const boot = (async () => {
    try {
      if (options.buffer) {
        await loadFromBuffer(options.buffer, options.filename);
        return;
      }
      if (options.src) {
        await loadFromUrl(options.src);
      } else {
        setStatus('Оберіть GLB- або STL-файл');
      }
    } catch (error) {
      console.error(error);
      const fileProtocol = window.location.protocol === 'file:';
      setStatus(
        fileProtocol
          ? 'Відкрийте сайт через локальний сервер або виберіть файл моделі нижче.'
          : 'Не вдалося завантажити 3D-модель.',
      );
    }
  })();

  return {
    ready: boot,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      themeObserver.disconnect();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      stlMaterial.dispose();
      if (model) {
        scene.remove(model);
        disposeObject(model);
      }
      renderer.dispose();
      renderer.domElement.remove();
      container.innerHTML = '';
    },
    loadFromUrl,
    loadFromBuffer,
    resetView,
  };
}
