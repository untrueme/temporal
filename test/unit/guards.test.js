import test from 'node:test';
import assert from 'node:assert/strict';
import { evalGuard } from '../../src/utils/guards.js';

const ctx = {
  doc: { cost: 150, status: 'DRAFT' },
  vars: { region: 'EU' },
};

test('evalGuard supports comparisons and paths', () => {
  assert.equal(
    evalGuard(ctx, { op: 'gt', left: { path: 'doc.cost' }, right: 100 }),
    true,
  );
  assert.equal(
    evalGuard(ctx, { op: 'eq', left: { path: 'vars.region' }, right: 'EU' }),
    true,
  );
});

test('evalGuard supports logical ops', () => {
  assert.equal(
    evalGuard(ctx, {
      op: 'and',
      guards: [
        { op: 'gt', left: { path: 'doc.cost' }, right: 100 },
        { op: 'eq', left: { path: 'doc.status' }, right: 'DRAFT' },
      ],
    }),
    true,
  );
});
