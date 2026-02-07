import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIdempotency, snapshotSeenIds } from '../../src/utils/idempotency.js';

test('applyIdempotency dedupes event ids', () => {
  let seen = new Set();
  let res = applyIdempotency(seen, 'evt-1');
  seen = res.seenIds;
  assert.equal(res.applied, true);

  res = applyIdempotency(seen, 'evt-1');
  assert.equal(res.applied, false);
  assert.deepEqual(snapshotSeenIds(res.seenIds), ['evt-1']);
});
