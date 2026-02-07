import test from 'node:test';
import assert from 'node:assert/strict';
import { initApprovalState, applyApproval, approvalOutcome } from '../../src/utils/approvals.js';

test('approval.kofn enforces unique actors', () => {
  let state = initApprovalState({ required: 2, members: ['alice', 'bob', 'carol'] });
  state = applyApproval(state, { actor: 'alice', decision: 'approve' });
  state = applyApproval(state, { actor: 'alice', decision: 'approve' });
  state = applyApproval(state, { actor: 'bob', decision: 'approve' });

  assert.equal(state.approvedActors.length, 2);
  assert.equal(approvalOutcome(state), 'approved');
});

test('approval rejects on reject decision', () => {
  let state = initApprovalState({ required: 2, members: ['alice', 'bob'] });
  state = applyApproval(state, { actor: 'alice', decision: 'reject' });
  assert.equal(approvalOutcome(state), 'rejected');
});

test('approval treats decline as reject', () => {
  let state = initApprovalState({ required: 2, members: ['alice', 'bob'] });
  state = applyApproval(state, { actor: 'alice', decision: 'decline' });
  assert.equal(approvalOutcome(state), 'rejected');
});

test('approval treats accept as approve', () => {
  let state = initApprovalState({ required: 1, members: ['alice', 'bob'] });
  state = applyApproval(state, { actor: 'alice', decision: 'accept' });
  assert.equal(approvalOutcome(state), 'approved');
});

test('approval stores decline comment metadata', () => {
  let state = initApprovalState({ required: 2, members: ['alice', 'bob'] });
  state = applyApproval(state, { actor: 'alice', decision: 'decline', comment: 'missing fields' });
  assert.equal(state.decisionActor, 'alice');
  assert.equal(state.decisionComment, 'missing fields');
});
