// Создает дефолтное состояние K-of-N согласования.
export function initApprovalState({ required = 2, members = [] } = {}) {
  return {
    // Сколько уникальных approve нужно получить.
    required,
    // Разрешенные участники голосования.
    members,
    // Список уникальных актеров, которые уже приняли.
    approvedActors: [],
    // Финальное решение для ветки (если был reject/needs_changes).
    decision: null,
    // Кто принял негативное решение.
    decisionActor: null,
    // Комментарий к негативному решению.
    decisionComment: null,
    // UNIX-время последнего обновления состояния.
    updatedAt: null,
  };
}

// Нормализует UI-синонимы решений в внутренние значения.
export function normalizeApprovalDecision(decision) {
  if (decision === 'approve') return 'approve';
  if (decision === 'accept') return 'approve';
  if (decision === 'accepted') return 'approve';
  if (decision === 'reject') return 'reject';
  if (decision === 'decline') return 'reject';
  if (decision === 'rejected') return 'reject';
  if (decision === 'need_changes') return 'needs_changes';
  if (decision === 'needs-change') return 'needs_changes';
  if (decision === 'needs changes') return 'needs_changes';
  return decision;
}

// Применяет одно событие approval к текущему состоянию узла.
export function applyApproval(state, event) {
  // Создаем копию, чтобы не мутировать входные данные напрямую.
  const next = {
    ...state,
    approvedActors: [...state.approvedActors],
  };

  // Пустое событие или без actor не влияет на состояние.
  if (!event || !event.actor) return next;
  const decision = normalizeApprovalDecision(event.decision);

  // Reject/needs_changes финализируют outcome без накопления approve.
  if (decision === 'reject' || decision === 'needs_changes') {
    next.decision = decision;
    next.decisionActor = event.actor || null;
    next.decisionComment = event.comment || null;
    next.updatedAt = Date.now();
    return next;
  }

  // Approve учитываем только от разрешенных членов и только один раз.
  if (decision === 'approve') {
    if (next.members.length > 0 && !next.members.includes(event.actor)) {
      return next;
    }
    if (!next.approvedActors.includes(event.actor)) {
      next.approvedActors.push(event.actor);
      next.updatedAt = Date.now();
    }
  }

  return next;
}

// Проверяет, достигнут ли порог K или пришло негативное решение.
export function approvalSatisfied(state) {
  if (state.decision === 'reject' || state.decision === 'needs_changes') {
    return true;
  }
  return state.approvedActors.length >= state.required;
}

// Вычисляет итоговый outcome по текущему approval-state.
export function approvalOutcome(state) {
  if (state.decision === 'reject') return 'rejected';
  if (state.decision === 'needs_changes') return 'needs_changes';
  if (state.approvedActors.length >= state.required) return 'approved';
  return 'pending';
}
