import { getPath } from './guards.js';

// Регекс для случая, когда вся строка — один шаблон {{path}}.
const FULL_TEMPLATE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
// Регекс для подстановок внутри произвольной строки.
const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

// Рекурсивный рендер шаблонов в строках/массивах/объектах.
export function renderTemplate(value, ctx) {
  if (typeof value === 'string') {
    // Если это "чистый" шаблон, возвращаем исходный тип значения (не строку).
    const full = value.match(FULL_TEMPLATE);
    if (full) {
      const resolved = getPath(ctx, full[1].trim());
      return resolved === undefined ? '' : resolved;
    }
    // Иначе выполняем строковые подстановки.
    return value.replace(TEMPLATE, (_, expr) => {
      const resolved = getPath(ctx, expr.trim());
      return resolved === undefined ? '' : String(resolved);
    });
  }

  // Рендер всех элементов массива.
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplate(item, ctx));
  }

  // Рендер всех полей объекта.
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = renderTemplate(val, ctx);
    }
    return out;
  }

  // Примитивы возвращаем как есть.
  return value;
}
