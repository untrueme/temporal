import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, transitionStatus } from '../../src/utils/serviceDesk.js';

test('service desk transitions basic flow', () => {
  let status = STATUS.NEW;
  status = transitionStatus(status, 'ASSIGN');
  assert.equal(status, STATUS.ASSIGNED);
  status = transitionStatus(status, 'AGENT_RESPONDED');
  assert.equal(status, STATUS.IN_PROGRESS);
  status = transitionStatus(status, 'RESOLVE');
  assert.equal(status, STATUS.RESOLVED);
  status = transitionStatus(status, 'CLOSE');
  assert.equal(status, STATUS.CLOSED);
});

