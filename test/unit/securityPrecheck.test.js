import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerHandlersRoutes } from '../../src/handlersRoutes.js';

async function buildApp() {
  const app = Fastify();
  registerHandlersRoutes(app);
  await app.ready();
  return app;
}

test('security precheck returns failed when required documents are missing', async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });
  const res = await app.inject({
    method: 'POST',
    url: '/handlers/pre.policy.check',
    payload: {
      check: 'security_precheck',
      documents: ['passport'],
      requiredDocuments: ['passport', 'consent'],
      riskTag: 'low',
    },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body?.precheck?.validation, 'failed');
  assert.equal(body?.precheck?.reason, 'missing_required_docs_for_security');
  assert.deepEqual(body?.precheck?.nextParams?.missingDocuments, ['consent']);
});

test('security precheck returns ok when both required documents are provided', async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });
  const res = await app.inject({
    method: 'POST',
    url: '/handlers/pre.policy.check',
    payload: {
      check: 'security_precheck',
      documents: ['passport', 'consent'],
      requiredDocuments: ['passport', 'consent'],
      riskTag: 'low',
    },
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body?.precheck?.validation, 'ok');
  assert.equal(body?.precheck?.reason, 'risk_acceptable');
  assert.deepEqual(body?.precheck?.nextParams?.missingDocuments, []);
});
