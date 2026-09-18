import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLesson } from '../../../learning/lesson-registry.ts';
test('a majority acknowledgement can precede replication to the third member', () => {
  const lesson = buildLesson('write', 'sharded');
  const acknowledged = lesson.steps.find((s) => s.after.acknowledged)!.after;
  assert.equal(acknowledged.members.a1.durable, 2);
  assert.equal(acknowledged.members.a2.durable, 2);
  assert.equal(acknowledged.members.a3.durable, 1);
  assert.equal(acknowledged.members.a3.docs.length, 3);
  assert.equal(lesson.steps.at(-1)!.after.members.a3.docs.length, 4);
  assert.equal(acknowledged.members.b1.docs.length, 3);
});
