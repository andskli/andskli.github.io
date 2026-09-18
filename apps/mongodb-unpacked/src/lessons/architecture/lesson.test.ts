import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLesson, lessonIds } from '../../learning/lesson-registry.ts';
import { initialModel, visibleNodes } from './topology.ts';
import type { Topology } from './types.ts';
test('all lessons rewind through isolated snapshots and only use visible nodes', () => {
  for (const topology of ['standalone', 'replica', 'sharded'] as Topology[]) {
    const visible = visibleNodes(topology);
    for (const id of lessonIds(topology)) {
      const lesson = buildLesson(id, topology);
      assert.ok(lesson.steps.length > 0);
      lesson.steps.forEach((step, i) => {
        for (const flow of step.flows) {
          assert.ok(visible.includes(flow.from));
          assert.ok(visible.includes(flow.to));
        }
        if (i) assert.deepEqual(lesson.steps[i - 1].after, step.before);
        assert.notEqual(step.before, step.after);
      });
    }
  }
  const a = initialModel();
  a.members.a1.docs[0].amount = 999;
  assert.equal(initialModel().members.a1.docs[0].amount, 40);
});
