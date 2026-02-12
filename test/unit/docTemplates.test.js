import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocTemplateRegistry,
  normalizeDocType,
  validateDocRoute,
} from '../../src/utils/docTemplates.js';

test('normalizeDocType accepts valid values and rejects invalid', () => {
  assert.equal(normalizeDocType('Candidate_Hiring'), 'candidate_hiring');
  assert.equal(normalizeDocType('contractor-fasttrack'), 'contractor-fasttrack');
  assert.equal(normalizeDocType(''), '');
  assert.equal(normalizeDocType('!!!'), '');
  assert.equal(normalizeDocType('a'), '');
});

test('validateDocRoute validates structure and unique node ids', () => {
  assert.doesNotThrow(() => {
    validateDocRoute({
      nodes: [{ id: 'a', type: 'handler.http' }, { id: 'b', type: 'approval.kofn' }],
    });
  });

  assert.throws(
    () =>
      validateDocRoute({
        nodes: [{ id: 'a', type: 'handler.http' }, { id: 'a', type: 'approval.kofn' }],
      }),
    /duplicated node id/
  );
});

test('template registry provides defaults and isolates returned objects', () => {
  const registry = createDocTemplateRegistry();
  const items = registry.list();
  assert.ok(items.length >= 2);
  assert.ok(items.some((item) => item.docType === 'candidate_hiring'));

  const template = registry.get('candidate_hiring');
  assert.ok(template);
  const firstNodeId = template.route.nodes[0].id;
  template.route.nodes[0].id = 'mutated.node';

  const freshTemplate = registry.get('candidate_hiring');
  assert.equal(freshTemplate.route.nodes[0].id, firstNodeId);
});

test('template registry upsert creates custom docType template', () => {
  const registry = createDocTemplateRegistry([]);
  const saved = registry.upsert({
    docType: 'invoice_approval',
    name: 'Счет на оплату',
    description: 'Тестовый шаблон',
    route: {
      nodes: [
        { id: 'invoice.intake', type: 'handler.http', action: 'invoice.create' },
        { id: 'invoice.approval', type: 'approval.kofn', after: ['invoice.intake'], members: ['A'], k: 1 },
      ],
    },
  });

  assert.equal(saved.docType, 'invoice_approval');
  assert.equal(saved.route.nodes.length, 2);
  assert.equal(registry.get('invoice_approval').name, 'Счет на оплату');
});

