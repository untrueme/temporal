// Применяет простое правило идемпотентности по eventId.
export function applyIdempotency(seenIds, eventId) {
  // Копируем множество увиденных id, чтобы не мутировать исходное.
  const next = new Set(seenIds || []);
  // Без eventId считаем событие применимым (нечего дедуплицировать).
  if (!eventId) {
    return { applied: true, seenIds: next };
  }
  // Если id уже был, считаем событие дублем.
  if (next.has(eventId)) {
    return { applied: false, seenIds: next };
  }
  // Иначе сохраняем id и помечаем событие как примененное.
  next.add(eventId);
  return { applied: true, seenIds: next };
}

// Возвращает сериализуемый снимок множества seenIds.
export function snapshotSeenIds(seenIds) {
  return [...(seenIds || [])];
}
