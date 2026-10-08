/**
 * @file model-page.js
 * @description Повноекранна веб-обгортка для STL-моделей.
 */

import { mountSTLViewer } from './stl-viewer.js';
import { initTheme } from './theme.js';
import { getQueryParams, goBack, registerServiceWorker } from './router.js';

const DEFAULT_SRC = 'data/models/TM62M.glb';
const DEFAULT_TITLE = 'ТМ-62М';
const MODEL_FILE = /\.(glb|gltf|stl)$/i;

/**
 * Читає файл як ArrayBuffer.
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFile(file) {
  return file.arrayBuffer();
}

async function init() {
  initTheme();
  registerServiceWorker();

  const params = getQueryParams();
  const src = params.get('src') || DEFAULT_SRC;
  const title = params.get('title') || DEFAULT_TITLE;

  document.title = `${title} — 3D-модель`;
  const titleEl = document.getElementById('modelTitle');
  if (titleEl) titleEl.textContent = title;

  document.getElementById('backBtn')?.addEventListener('click', () => goBack());

  const stage = document.getElementById('modelStage');
  const fileInput = document.getElementById('modelFile');
  const dropHint = document.getElementById('modelDropHint');

  const viewer = mountSTLViewer(stage, {
    src,
    autoRotate: true,
  });

  /**
   * Підставляє локальний STL і оновлює заголовок.
   * @param {File} file
   */
  async function openFile(file) {
    if (!file) return;
    const name = file.name.replace(/\.(glb|gltf|stl)$/i, '');
    if (titleEl) titleEl.textContent = name;
    document.title = `${name} — 3D-модель`;
    const buffer = await readFile(file);
    await viewer.loadFromBuffer(buffer, file.name);
  }

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) openFile(file);
  });

  const onDrag = (event) => {
    event.preventDefault();
    stage.classList.toggle('is-drop-target', event.type === 'dragover' || event.type === 'dragenter');
  };

  stage.addEventListener('dragenter', onDrag);
  stage.addEventListener('dragover', onDrag);
  stage.addEventListener('dragleave', () => stage.classList.remove('is-drop-target'));
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    stage.classList.remove('is-drop-target');
    const file = [...(event.dataTransfer?.files || [])].find((item) => MODEL_FILE.test(item.name));
    if (file) openFile(file);
  });

  if (dropHint && window.location.protocol === 'file:') {
    dropHint.textContent =
      'Сторінку відкрито як файл. Щоб модель підвантажилась сама — запустіть локальний сервер, або виберіть GLB / STL нижче.';
  }
}

init();
