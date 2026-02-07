import { proxyActivities } from '@temporalio/workflow';
import { jsonDAGWorkflow } from './jsonDAGWorkflow.js';

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
  const {
    baseUrl,
    docId,
    candidateId,
    payload = {},
  } = input || {};
  const resolvedDocId = docId || candidateId || payload.candidateId || 'candidate-unknown';
  const requestedSalary = Number(payload.salary ?? payload.cost ?? 0);
  const candidateName = String(payload.candidateName || payload.name || '');

  // Отдельный дочерний процесс финансовой группы: скоринг + ручное согласование 2-of-N.
  const route = {
    nodes: [
      {
        id: 'finance.child.scoring',
        type: 'handler.http',
        label: 'Финансовый скоринг',
        app: 'doc',
        action: 'candidate.finance.precheck',
        payload: {
          candidateName: '{{doc.title}}',
          salary: '{{doc.cost}}',
        },
      },
      {
        id: 'finance.child.approval',
        type: 'approval.kofn',
        label: 'Согласование финансистов',
        members: ['Финансист 1', 'Финансист 2', 'Финансист 3'],
        k: 2,
        required: true,
        after: ['finance.child.scoring'],
        gate: {
          app: 'doc',
          action: 'gate.finance.score',
          payload: {
            stage: 'finance',
            cost: '{{doc.cost}}',
            approvalsRequired: 2,
          },
          passWhen: {
            op: 'eq',
            left: { path: 'result.data.gate.status' },
            right: 'PASS',
          },
          required: true,
        },
      },
      {
        id: 'finance.child.finalize',
        type: 'handler.http',
        label: 'Фиксация решения фингруппы',
        app: 'doc',
        action: 'candidate.finance.group.complete',
        after: ['finance.child.approval'],
        payload: {
          candidateName: '{{doc.title}}',
          salary: '{{doc.cost}}',
        },
      },
    ],
  };

  return jsonDAGWorkflow({
    processType: 'doc.finance',
    docId: resolvedDocId,
    doc: {
      title: candidateName,
      cost: requestedSalary,
      candidateId: resolvedDocId,
    },
    context: {
      docHandlers: baseUrl,
    },
    route,
    handlers: {
      doc: baseUrl,
      default: baseUrl,
    },
  });
}

// Child workflow для проверки кандидата службой безопасности.
export async function candidateSecurityCheck(input) {
  return runChildTask(input, 'candidate.security.precheck', 'candidateSecurityCheck');
}
