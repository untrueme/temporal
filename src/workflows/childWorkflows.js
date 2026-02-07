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
    tripId,
    payload = {},
    action = defaultAction,
  } = input || {};

  // Выполняем вызов handlers app с корреляцией.
  return callHttpHandler({
    baseUrl,
    action,
    payload: { ...payload, tripId, nodeId },
    correlation: { tripId, nodeId },
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
