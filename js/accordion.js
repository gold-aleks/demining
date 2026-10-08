/**
 * @file accordion.js
 * @description Accordion з плавним відкриттям секцій картки.
 */

/**
 * Створює один елемент accordion.
 * @param {{id: string, title: string, contentHTML: string, open?: boolean}} options
 * @returns {HTMLElement|null}
 */
export function createAccordionItem({ id, title, contentHTML, open = false }) {
  if (!contentHTML || !String(contentHTML).trim()) return null;

  const item = document.createElement('section');
  item.className = 'accordion-item';
  item.dataset.section = id;
  if (open) item.classList.add('is-open');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'accordion-trigger';
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  button.innerHTML = `
    <span class="accordion-trigger__title">${title}</span>
    <svg class="accordion-trigger__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6"></path>
    </svg>
  `;

  const panel = document.createElement('div');
  panel.className = 'accordion-panel';
  panel.innerHTML = `<div class="accordion-panel__inner"><div class="accordion-content">${contentHTML}</div></div>`;

  button.addEventListener('click', () => {
    const isOpen = item.classList.toggle('is-open');
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  item.append(button, panel);
  return item;
}

/**
 * Рендерить список секцій у контейнер. Порожні секції пропускаються.
 * @param {HTMLElement|null} container
 * @param {Array<{id: string, title: string, contentHTML: string, open?: boolean}>} sections
 */
export function renderAccordion(container, sections) {
  if (!container) return;
  container.innerHTML = '';

  (sections || []).forEach((section) => {
    const item = createAccordionItem(section);
    if (item) container.appendChild(item);
  });
}

/**
 * Відкриває секцію за id (якщо існує).
 * @param {HTMLElement|null} container
 * @param {string} sectionId
 */
export function openSection(container, sectionId) {
  if (!container || !sectionId) return;
  const item = container.querySelector(`[data-section="${sectionId}"]`);
  if (!item) return;
  item.classList.add('is-open');
  const button = item.querySelector('.accordion-trigger');
  button?.setAttribute('aria-expanded', 'true');
}
