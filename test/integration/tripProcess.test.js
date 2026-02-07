import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startRuntime, stopRuntime, poll } from '../helpers/runtime.js';

let runtime;

const makeRoute = (endDateIso, reportDelayMs) => ({
  nodes: [
    {
      id: 'manager.approval',
      type: 'approval.kofn',
      members: ['manager1'],
      k: 1,
    },
    {
      id: 'finance.approval',
      type: 'approval.kofn',
      members: ['finance1'],
      k: 1,
      guard: {
        op: 'gt',
        left: { path: 'doc.budget' },
        right: 1000,
      },
    },
    {
      id: 'child.ticket',
      type: 'child.start',
      workflowType: 'ticketPurchase',
      input: {
        baseUrl: '{{context.tripHandlers}}',
        tripId: '{{doc.tripId}}',
      },
      guard: {
        op: 'eq',
        left: { path: 'doc.needTickets' },
        right: true,
      },
      after: ['manager.approval', 'finance.approval'],
    },
    {
      id: 'child.hotel',
      type: 'child.start',
      workflowType: 'hotelBooking',
      input: {
        baseUrl: '{{context.tripHandlers}}',
        tripId: '{{doc.tripId}}',
      },
      guard: {
        op: 'eq',
        left: { path: 'doc.needHotel' },
        right: true,
      },
      after: ['manager.approval', 'finance.approval'],
    },
    {
      id: 'child.perdiem',
      type: 'child.start',
      workflowType: 'perDiemPayout',
      input: {
        baseUrl: '{{context.tripHandlers}}',
        tripId: '{{doc.tripId}}',
      },
      guard: {
        op: 'eq',
        left: { path: 'doc.needPerDiem' },
        right: true,
      },
      after: ['manager.approval', 'finance.approval'],
    },
    {
      id: 'wait.endDate',
      type: 'timer.until',
      at: endDateIso,
      after: ['child.ticket', 'child.hotel', 'child.perdiem'],
    },
    {
      id: 'notify.report',
      type: 'handler.http',
      app: 'trip',
      action: 'report.request',
      after: ['wait.endDate'],
    },
    {
      id: 'report.wait',
      type: 'event.wait',
      eventName: 'REPORT_SUBMITTED',
      setVars: {
        reportSubmitted: true,
      },
      after: ['notify.report'],
    },
    {
      id: 'report.delay',
      type: 'timer.delay',
      ms: reportDelayMs,
      after: ['notify.report'],
    },
    {
      id: 'report.escalate',
      type: 'handler.http',
      app: 'trip',
      action: 'report.escalate',
      guard: {
        op: 'ne',
        left: { path: 'context.reportSubmitted' },
        right: true,
      },
      after: ['report.delay'],
    },
    {
      id: 'trip.close',
      type: 'handler.http',
      app: 'trip',
      action: 'trip.close',
      after: ['report.wait'],
    },
  ],
});

before(async () => {
  runtime = await startRuntime();
});

after(async () => {
  await stopRuntime(runtime);
});

test('trip process skips finance when budget <= 1000 and runs child workflows', async () => {
  const endDate = new Date(Date.now() + 200).toISOString();
  const route = makeRoute(endDate, 200);

  const startRes = await fetch(`${runtime.apiUrl}/process/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tripId: 'trip-low',
      doc: {
        tripId: 'trip-low',
        budget: 800,
        needTickets: true,
        needHotel: false,
        needPerDiem: true,
      },
      context: { reportSubmitted: false },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/process/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'manager.approval', actor: 'manager1', decision: 'approve' }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/process/${workflowId}/progress`);
    const data = await res.json();
    if (
      data.context?.steps?.['child.ticket']?.status === 'done' &&
      data.context?.steps?.['child.perdiem']?.status === 'done'
    ) {
      return data;
    }
    return null;
  }, { timeoutMs: 8000, intervalMs: 200 });

  assert.equal(progress.context.steps['finance.approval'].status, 'skipped');
  assert.equal(progress.context.steps['child.ticket'].status, 'done');
  assert.equal(progress.context.steps['child.perdiem'].status, 'done');

  await fetch(`${runtime.apiUrl}/process/${workflowId}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventName: 'REPORT_SUBMITTED', data: { by: 'traveler' } }),
  });

  const finalProgress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/process/${workflowId}/progress`);
    const data = await res.json();
    if (data.context?.steps?.['trip.close']?.status === 'done') return data;
    return null;
  }, { timeoutMs: 8000, intervalMs: 200 });

  assert.equal(finalProgress.context.steps['trip.close'].status, 'done');
});

test('trip process escalates when report not submitted', async () => {
  const endDate = new Date(Date.now() + 200).toISOString();
  const route = makeRoute(endDate, 200);

  const startRes = await fetch(`${runtime.apiUrl}/process/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tripId: 'trip-escalate',
      doc: {
        tripId: 'trip-escalate',
        budget: 700,
        needTickets: false,
        needHotel: false,
        needPerDiem: false,
      },
      context: { reportSubmitted: false },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/process/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'manager.approval', actor: 'manager1', decision: 'approve' }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/process/${workflowId}/progress`);
    const data = await res.json();
    if (data.context?.steps?.['report.escalate']?.status === 'done') {
      return data;
    }
    return null;
  }, { timeoutMs: 8000, intervalMs: 200 });

  assert.equal(progress.context.steps['report.escalate'].status, 'done');

  await fetch(`${runtime.apiUrl}/process/${workflowId}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ eventName: 'REPORT_SUBMITTED', data: { by: 'traveler' } }),
  });

  const finalProgress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/process/${workflowId}/progress`);
    const data = await res.json();
    if (data.context?.steps?.['trip.close']?.status === 'done') return data;
    return null;
  }, { timeoutMs: 8000, intervalMs: 200 });

  assert.equal(finalProgress.context.steps['trip.close'].status, 'done');
});
