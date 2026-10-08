/**
 * @file theme.js
 * @description Керування темною/світлою темою інтерфейсу.
 */

import { getTheme, setTheme } from './storage.js';

/**
 * Застосовує тему до документа.
 * @param {'dark'|'light'} theme
 */
export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('theme-light', next === 'light');
  document.documentElement.style.setProperty(
    'color-scheme',
    next === 'light' ? 'light' : 'dark',
  );
  setTheme(next);
}

/**
 * Повертає поточну активну тему.
 * @returns {'dark'|'light'}
 */
export function getCurrentTheme() {
  return document.body.classList.contains('theme-light') ? 'light' : 'dark';
}

/**
 * Перемикає тему.
 * @returns {'dark'|'light'}
 */
export function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/**
 * Ініціалізує тему з Local Storage та кнопку перемикання.
 * @param {string} [buttonSelector='#themeToggle']
 */
export function initTheme(buttonSelector = '#themeToggle') {
  const saved = getTheme();
  applyTheme(saved || 'dark');

  const button = document.querySelector(buttonSelector);
  if (!button) return;

  button.addEventListener('click', () => {
    toggleTheme();
  });
}
