// Безопасный интерпретатор guard DSL (без eval).
export function evalGuard(ctx, guard) {
  // Пустой guard означает "условие истинно".
  if (!guard) return true;
  // Поддерживаем оба имени поля оператора.
  const op = guard.op || guard.operator;

  // Логические композиции условий.
  if (op === 'and') {
    const list = guard.guards || [];
    return list.every((g) => evalGuard(ctx, g));
  }
  if (op === 'or') {
    const list = guard.guards || [];
    return list.some((g) => evalGuard(ctx, g));
  }
  if (op === 'not') {
    return !evalGuard(ctx, guard.guard);
  }

  // Обычная бинарная операция: вычисляем левый/правый операнды.
  const left = resolveOperand(ctx, guard.left);
  const right = resolveOperand(ctx, guard.right);

  // Поддерживаемый набор безопасных операций.
  switch (op) {
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    case 'in':
      return Array.isArray(right) ? right.includes(left) : false;
    case 'exists':
      return left !== undefined && left !== null;
    default:
      throw new Error(`Unsupported guard op: ${op}`);
  }
}

// Операнд может быть литералом или ссылкой вида { path: "doc.cost" }.
export function resolveOperand(ctx, operand) {
  if (operand && typeof operand === 'object' && Object.prototype.hasOwnProperty.call(operand, 'path')) {
    return getPath(ctx, operand.path);
  }
  return operand;
}

// Читает вложенное значение из объекта по dot-path.
export function getPath(obj, path) {
  if (!path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}
