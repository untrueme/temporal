import test from 'node:test';
import assert from 'node:assert/strict';
import { depsDone, readyNodes } from '../../src/utils/dag.js';

const nodes = [
  { id: 'a', after: [] },
  { id: 'b', after: ['a'] },
  { id: 'c', after: ['a'] },
];

test('depsDone respects doneish deps', () => {
  const state = {
    a: { status: 'done' },
    b: { status: 'pending' },
    c: { status: 'pending' },
  };
  assert.equal(depsDone(nodes[1], state), true);
});

test('readyNodes returns nodes with deps satisfied', () => {
  const state = {
    a: { status: 'done' },
    b: { status: 'pending' },
    c: { status: 'pending' },
  };
  const ready = readyNodes(nodes, state).map((n) => n.id);
  assert.deepEqual(ready.sort(), ['b', 'c']);
});
