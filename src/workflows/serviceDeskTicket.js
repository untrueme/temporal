import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
} from '@temporalio/workflow';
import { STATUS, transitionStatus, isTerminal } from '../utils/serviceDesk.js';

// Доступ к HTTP-activity, через которую workflow дергает handlers app.
const { callHttpHandler } = proxyActivities({
  startToCloseTimeout: '30s',
});

// Workflow одного тикета service desk.
export async function serviceDeskTicket(input) {
  // Нормализуем входные аргументы.
  const {
    ticketId,
    ticket = {},
    policy = {},
    handlers = {},
  } = input;

  // Внутреннее состояние тикета, доступное через query.
  const state = {
    ticketId,
    status: STATUS.NEW,
    history: [],
    flags: {
      firstResponseBreached: false,
      resolveBreached: false,
      reopenedAfterResolve: false,
    },
    assignedAt: null,
    resolvedAt: null,
    updatedAt: new Date().toISOString(),
    policy,
  };

  // Очередь событий, приходящих через signal ticketEvent.
  const eventQueue = [];
  // Определяем signal-имя для внешних событий тикета.
  const ticketEventSignal = defineSignal('ticketEvent');

  // Обработчик signal: просто складываем события в очередь.
  setHandler(ticketEventSignal, (payload) => {
    if (!payload || !payload.type) return;
    eventQueue.push({
      ...payload,
      receivedAt: new Date().toISOString(),
    });
  });

  // Query для чтения состояния тикета из API/UI.
  const getStateQuery = defineQuery('getState');
  setHandler(getStateQuery, () => state);

  // Общая корреляция для всех activity вызовов.
  const correlation = {
    ticketId,
  };

  // Начальная фиксация создания тикета.
  await callHttpHandler({
    baseUrl: handlers.sd,
    action: 'createTicket',
    payload: { ticket, nodeId: 'createTicket' },
    correlation,
  });

  // Начальный triage шаг.
  await callHttpHandler({
    baseUrl: handlers.sd,
    action: 'triage',
    payload: { ticket, nodeId: 'triage' },
    correlation,
  });

  // Таймер SLA первого ответа: эскалирует, если агент не ответил вовремя.
  async function scheduleFirstResponseTimer() {
    if (!policy.firstResponseMs) return;
    await sleep(policy.firstResponseMs);
    if (!state.flags.firstResponseBreached && state.status !== STATUS.CLOSED) {
      if (!state.history.some((evt) => evt.type === 'AGENT_RESPONDED')) {
        state.flags.firstResponseBreached = true;
        await callHttpHandler({
          baseUrl: handlers.sd,
          action: 'escalate',
          payload: { reason: 'first_response_sla', nodeId: 'sla.firstResponse' },
          correlation,
        });
      }
    }
  }

  // Таймер SLA решения: эскалирует, если тикет не RESOLVE к дедлайну.
  async function scheduleResolveTimer() {
    if (!policy.resolveMs) return;
    await sleep(policy.resolveMs);
    if (!state.flags.resolveBreached && state.status !== STATUS.CLOSED) {
      if (!state.history.some((evt) => evt.type === 'RESOLVE')) {
        state.flags.resolveBreached = true;
        await callHttpHandler({
          baseUrl: handlers.sd,
          action: 'escalate',
          payload: { reason: 'resolve_sla', nodeId: 'sla.resolve' },
          correlation,
        });
      }
    }
  }

  // Автозакрытие после RESOLVE, если тикет не REOPEN.
  async function scheduleAutoClose() {
    if (!policy.autoCloseMs) return;
    await sleep(policy.autoCloseMs);
    if (state.status === STATUS.RESOLVED && !state.flags.reopenedAfterResolve) {
      state.status = STATUS.CLOSED;
      state.updatedAt = new Date().toISOString();
      await callHttpHandler({
        baseUrl: handlers.sd,
        action: 'closeTicket',
        payload: { nodeId: 'autoClose' },
        correlation,
      });
    }
  }

  // Обработчик одного события из очереди.
  async function handleEvent(evt) {
    // Фиксируем событие в истории.
    state.history.push({
      type: evt.type,
      data: evt.data,
      actor: evt.actor,
      receivedAt: evt.receivedAt,
    });

    // На ASSIGN запускаем SLA таймеры.
    if (evt.type === 'ASSIGN') {
      state.assignedAt = new Date().toISOString();
      scheduleFirstResponseTimer();
      scheduleResolveTimer();
    }

    // На RESOLVE фиксируем время и ставим таймер автозакрытия.
    if (evt.type === 'RESOLVE') {
      state.resolvedAt = new Date().toISOString();
      scheduleAutoClose();
    }

    // На REOPEN отмечаем флаг переоткрытия после решения.
    if (evt.type === 'REOPEN') {
      state.flags.reopenedAfterResolve = true;
    }

    // Вычисляем следующий статус по state machine.
    const nextStatus = transitionStatus(state.status, evt.type, evt.data || {});
    if (nextStatus !== state.status) {
      state.status = nextStatus;
      state.updatedAt = new Date().toISOString();
      // Пишем изменение статуса в handlers app.
      await callHttpHandler({
        baseUrl: handlers.sd,
        action: 'setStatus',
        payload: { status: nextStatus, nodeId: 'statusChange' },
        correlation,
      });
    }

    // Логируем каждое событие в внешнем сервисе.
    await callHttpHandler({
      baseUrl: handlers.sd,
      action: 'logEvent',
      payload: { eventType: evt.type, data: evt.data, nodeId: 'logEvent' },
      correlation,
    });

    // Для основных бизнес-событий отправляем notify.
    if (['ASSIGN', 'RESOLVE', 'REOPEN', 'CLOSE'].includes(evt.type)) {
      await callHttpHandler({
        baseUrl: handlers.sd,
        action: 'notify',
        payload: { eventType: evt.type, nodeId: 'notify' },
        correlation,
      });
    }

    // Страховка: CLOSE всегда закрывает тикет, даже если transition не сработал.
    if (evt.type === 'CLOSE' && state.status !== STATUS.CLOSED) {
      state.status = STATUS.CLOSED;
      state.updatedAt = new Date().toISOString();
      await callHttpHandler({
        baseUrl: handlers.sd,
        action: 'closeTicket',
        payload: { nodeId: 'closeTicket' },
        correlation,
      });
    }
  }

  // Главный цикл workflow: читаем и применяем события до терминального статуса.
  while (!isTerminal(state.status)) {
    await condition(() => eventQueue.length > 0);
    const evt = eventQueue.shift();
    await handleEvent(evt);
  }

  // Возвращаем финальное состояние тикета.
  return state;
}
