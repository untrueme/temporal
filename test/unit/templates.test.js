import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate } from '../../src/utils/templates.js';

const ctx = { doc: { cost: 120 }, vars: { owner: 'Alice' } };

test('renderTemplate replaces tokens in strings', () => {
  const out = renderTemplate('Cost={{doc.cost}} Owner={{vars.owner}}', ctx);
  assert.equal(out, 'Cost=120 Owner=Alice');
});

test('renderTemplate walks objects and arrays', () => {
  const out = renderTemplate({ a: '{{doc.cost}}', b: ['{{vars.owner}}'] }, ctx);
  assert.deepEqual(out, { a: 120, b: ['Alice'] });
});
