import { proxyActivities } from '@temporalio/workflow';

// Делаем activity-доступным внутри child workflow.
const { callHttpHandler } = proxyActivities({
  startToCloseTimeout: '30s',
});

// Унифицированный helper для child workflow: один HTTP вызов и завершение.
async function runChildTask(input, defaultAction, nodeId) {
  // Нормализуем вход.
  const {
    baseUrl,
    docId,
    ticketId,
    tripId,
    candidateId,
    payload = {},
    action = defaultAction,
  } = input || {};
  const resolvedDocId = docId || candidateId;

  // Выполняем вызов handlers app с корреляцией.
  return callHttpHandler({
    baseUrl,
    action,
    payload: {
      ...payload,
      docId: resolvedDocId,
      ticketId,
      tripId,
      candidateId,
      nodeId,
    },
    correlation: { docId: resolvedDocId, ticketId, tripId, nodeId },
  });
}

// Child workflow для выдачи суточных.
export async function perDiemPayout(input) {
  return runChildTask(input, 'perdiem.task.create', 'perDiemPayout');
}

// Child workflow для покупки билетов.
export async function ticketPurchase(input) {
  return runChildTask(input, 'ticket.task.create', 'ticketPurchase');
}

// Child workflow для бронирования отеля.
export async function hotelBooking(input) {
  return runChildTask(input, 'hotel.task.create', 'hotelBooking');
}

// Child workflow для предварительной финпроверки кандидата.
export async function candidateFinanceCheck(input) {
  return runChildTask(input, 'candidate.finance.precheck', 'candidateFinanceCheck');
}

// Child workflow для проверки кандидата службой безопасности.
export async function candidateSecurityCheck(input) {
  return runChildTask(input, 'candidate.security.precheck', 'candidateSecurityCheck');
}
