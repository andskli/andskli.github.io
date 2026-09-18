import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLesson } from '../../../learning/lesson-registry.ts';
test('failover elects a surviving member with a majority and the old primary rejoins as secondary', () => {
  const lesson = buildLesson('fail', 'sharded');
  const elected = lesson.steps.find((s) => s.after.primary === 'a2')!.after;
  assert.equal(elected.votes, 2);
  assert.equal(elected.members.a1.alive, false);
  assert.equal(elected.members.a2.role, 'Primary');
  assert.equal(elected.members.b1.role, 'Primary');
  const final = lesson.steps.at(-1)!.after;
  assert.equal(final.members.a1.alive, true);
  assert.equal(final.members.a1.role, 'Secondary');
  assert.equal(
    Object.entries(final.members).filter(
      ([id, m]) => id.startsWith('a') && m.role === 'Primary',
    ).length,
    1,
  );
});
