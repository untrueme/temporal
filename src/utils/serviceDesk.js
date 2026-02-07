// Допустимые статусы тикета service desk workflow.
export const STATUS = {
  NEW: 'NEW',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_CUSTOMER: 'WAITING_CUSTOMER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
};

// Переходы статусов по входящим событиям тикета.
export function transitionStatus(current, eventType, payload = {}) {
  switch (eventType) {
    // Назначение переводит тикет в ASSIGNED.
    case 'ASSIGN':
      return STATUS.ASSIGNED;
    // Ответ агента после назначения/переоткрытия -> IN_PROGRESS.
    case 'AGENT_RESPONDED':
      return current === STATUS.ASSIGNED || current === STATUS.REOPENED
        ? STATUS.IN_PROGRESS
        : current;
    // Ответ клиента во WAITING_CUSTOMER возвращает в IN_PROGRESS.
    case 'CUSTOMER_REPLIED':
      return current === STATUS.WAITING_CUSTOMER ? STATUS.IN_PROGRESS : current;
    // Явная установка статуса (если значение валидно).
    case 'SET_STATUS':
      return payload.status && STATUS[payload.status] ? payload.status : current;
    // Resolve фиксирует статус RESOLVED.
    case 'RESOLVE':
      return STATUS.RESOLVED;
    // Reopen фиксирует статус REOPENED.
    case 'REOPEN':
      return STATUS.REOPENED;
    // Close фиксирует статус CLOSED.
    case 'CLOSE':
      return STATUS.CLOSED;
    // Комментарий не меняет статус.
    case 'COMMENT':
      return current;
    // Неизвестные события игнорируем.
    default:
      return current;
  }
}

// Признак терминального состояния workflow тикета.
export function isTerminal(status) {
  return status === STATUS.CLOSED;
}
