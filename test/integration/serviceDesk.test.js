import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startRuntime, stopRuntime, poll } from '../helpers/runtime.js';

let runtime;

before(async () => {
  runtime = await startRuntime();
});

after(async () => {
  await stopRuntime(runtime);
});

test('service desk triggers first response SLA breach', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/tickets/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ticketId: 'ticket-sla',
      ticket: { title: 'Printer broken' },
      policy: { firstResponseMs: 200, resolveMs: 1000 },
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/tickets/${workflowId}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'ASSIGN', actor: 'dispatcher' }),
  });

  const state = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/tickets/${workflowId}/state`);
    const data = await res.json();
    if (data.flags?.firstResponseBreached) return data;
    return null;
  }, { timeoutMs: 5000, intervalMs: 200 });

  assert.equal(state.flags.firstResponseBreached, true);
});

test('service desk auto-closes after resolve', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/tickets/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ticketId: 'ticket-close',
      ticket: { title: 'VPN issue' },
      policy: { autoCloseMs: 200 },
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/tickets/${workflowId}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'ASSIGN', actor: 'dispatcher' }),
  });
  await fetch(`${runtime.apiUrl}/tickets/${workflowId}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'RESOLVE', actor: 'agent1' }),
  });

  const state = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/tickets/${workflowId}/state`);
    const data = await res.json();
    if (data.status === 'CLOSED') return data;
    return null;
  }, { timeoutMs: 5000, intervalMs: 200 });

  assert.equal(state.status, 'CLOSED');
});
