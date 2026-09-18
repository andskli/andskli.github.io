import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLesson } from '../../../learning/lesson-registry.ts';
test('secondary local and majority reads expose different versions from the same initial state', () => {
  const local = buildLesson('secondary', 'sharded', 'local'),
    majority = buildLesson('secondary', 'sharded', 'majority');
  assert.deepEqual(local.steps[0].before, majority.steps[0].before);
  assert.equal(local.steps.at(-1)!.after.readResult, 'v2 · amount: 45');
  assert.equal(majority.steps.at(-1)!.after.readResult, 'v1 · amount: 40');
  assert.equal(majority.steps.at(-1)!.after.members.a2.applied, 2);
  assert.equal(majority.steps.at(-1)!.after.members.a2.committed, 1);
});
