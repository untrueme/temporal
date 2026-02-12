import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startRuntime, stopRuntime, poll } from '../helpers/runtime.js';

let runtime;

const route = {
  nodes: [
    {
      id: 'legal.review',
      type: 'handler.http',
      app: 'doc',
      action: 'legal.review',
    },
    {
      id: 'legal.approval',
      type: 'approval.kofn',
      members: ['alice', 'bob', 'carol'],
      k: 2,
      after: ['legal.review'],
    },
    {
      id: 'finance.check',
      type: 'handler.http',
      app: 'doc',
      action: 'finance.check',
      guard: {
        op: 'gt',
        left: { path: 'doc.cost' },
        right: 100,
      },
    },
    {
      id: 'finance.approval',
      type: 'approval.kofn',
      members: ['fin1', 'fin2'],
      k: 1,
      after: ['finance.check'],
      guard: {
        op: 'gt',
        left: { path: 'doc.cost' },
        right: 100,
      },
    },
    {
      id: 'notify',
      type: 'handler.http',
      app: 'doc',
      action: 'notify',
      after: ['legal.approval', 'finance.approval'],
    },
  ],
};

before(async () => {
  runtime = await startRuntime();
});

after(async () => {
  await stopRuntime(runtime);
});

test('doc workflow skips finance when cost <= 100', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/workflows/doc/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      docId: 'doc-low',
      doc: { cost: 50 },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nodeId: 'legal.approval',
      actor: 'alice',
      decision: 'approve',
    }),
  });

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nodeId: 'legal.approval',
      actor: 'bob',
      decision: 'approve',
    }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/progress`);
    const data = await res.json();
    if (data.context?.steps?.notify?.status === 'done') {
      return data;
    }
    return null;
  });

  assert.equal(progress.context.steps['finance.check'].status, 'skipped');
  assert.equal(progress.context.steps.notify.status, 'done');
});

test('doc workflow runs finance when cost > 100', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/workflows/doc/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      docId: 'doc-high',
      doc: { cost: 150 },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'legal.approval', actor: 'alice', decision: 'approve' }),
  });
  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'legal.approval', actor: 'bob', decision: 'approve' }),
  });

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: 'finance.approval', actor: 'fin1', decision: 'approve' }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/progress`);
    const data = await res.json();
    if (data.context?.steps?.notify?.status === 'done') {
      return data;
    }
    return null;
  });

  assert.equal(progress.context.steps['finance.check'].status, 'done');
  assert.equal(progress.context.steps['finance.approval'].status, 'done');
});

test('doc workflow stops on decline', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/workflows/doc/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      docId: 'doc-decline',
      doc: { cost: 150 },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nodeId: 'legal.approval',
      actor: 'alice',
      decision: 'decline',
      comment: 'не согласовано юристом',
    }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/progress`);
    const data = await res.json();
    if (data.status === 'rejected') {
      return data;
    }
    return null;
  }, { timeoutMs: 6000, intervalMs: 200 });

  assert.equal(progress.status, 'rejected');
  assert.notEqual(progress.context?.steps?.notify?.status, 'done');
});

test('doc workflow continues when decline is on non-required approval', async () => {
  const optionalRoute = {
    nodes: [
      {
        id: 'legal.review',
        type: 'handler.http',
        app: 'doc',
        action: 'legal.review',
      },
      {
        id: 'legal.approval',
        type: 'approval.kofn',
        members: ['alice', 'bob'],
        k: 1,
        required: true,
        after: ['legal.review'],
      },
      {
        id: 'optional.approval',
        type: 'approval.kofn',
        members: ['observer1', 'observer2'],
        k: 1,
        required: false,
      },
      {
        id: 'notify',
        type: 'handler.http',
        app: 'doc',
        action: 'notify',
        after: ['legal.approval', 'optional.approval'],
      },
    ],
  };

  const startRes = await fetch(`${runtime.apiUrl}/workflows/doc/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      docId: 'doc-optional-decline',
      doc: { cost: 50 },
      route: optionalRoute,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nodeId: 'optional.approval',
      actor: 'observer1',
      decision: 'decline',
      comment: 'необязательное замечание',
    }),
  });

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nodeId: 'legal.approval',
      actor: 'alice',
      decision: 'approve',
    }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/progress`);
    const data = await res.json();
    if (data.context?.steps?.notify?.status === 'done') {
      return data;
    }
    return null;
  }, { timeoutMs: 6000, intervalMs: 200 });

  assert.equal(progress.status, 'completed');
  assert.equal(progress.context.steps['optional.approval'].status, 'done');
  assert.equal(progress.context.steps['optional.approval'].result?.outcome, 'rejected');
  assert.equal(progress.context.steps.notify.status, 'done');
});

test('doc workflow rewinds to previous step on need_changes decision', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/workflows/doc/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      docId: 'doc-needs-changes',
      doc: { cost: 150 },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nodeId: 'legal.approval',
      actor: 'alice',
      decision: 'need_changes',
      comment: 'пакет документов неполный',
    }),
  });

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/progress`);
    const data = await res.json();
    if (data.status === 'running' && data.context?.lastNeedChanges?.targetNodeId === 'legal.review') {
      return data;
    }
    return null;
  }, { timeoutMs: 6000, intervalMs: 200 });

  assert.equal(progress.status, 'running');
  assert.equal(progress.context?.lastNeedChanges?.nodeId, 'legal.approval');
  assert.equal(progress.context?.lastNeedChanges?.targetNodeId, 'legal.review');
  assert.equal(progress.abort, null);
});

test('doc workflow terminates on self-withdraw signal', async () => {
  const startRes = await fetch(`${runtime.apiUrl}/workflows/doc/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      docId: 'doc-self-withdraw',
      doc: { cost: 120 },
      route,
    }),
  });
  const startData = await startRes.json();
  const workflowId = startData.workflowId;

  const noReasonRes = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/self-withdraw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      actor: 'candidate',
    }),
  });
  assert.equal(noReasonRes.status, 400);

  const selfWithdrawRes = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/self-withdraw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      actor: 'candidate',
      reason: 'получил контроффер',
    }),
  });
  assert.equal(selfWithdrawRes.status, 200);

  const progress = await poll(async () => {
    const res = await fetch(`${runtime.apiUrl}/workflows/doc/${workflowId}/progress`);
    const data = await res.json();
    if (data.status === 'withdrawn') {
      return data;
    }
    return null;
  }, { timeoutMs: 6000, intervalMs: 200 });

  assert.equal(progress.status, 'withdrawn');
  assert.equal(progress.abort?.reason, 'self_withdrawal');
  assert.equal(progress.abort?.comment, 'получил контроффер');
});
