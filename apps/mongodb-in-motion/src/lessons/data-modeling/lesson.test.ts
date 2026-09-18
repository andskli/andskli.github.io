import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelingLesson, modelingIds } from '../../learning/lesson-registry.ts';
test('modeling snapshots are isolated, rewindable, and have valid reference endpoints', () => {
  for (const id of modelingIds) {
    const lesson = buildModelingLesson(id);
    lesson.steps.forEach((step, i) => {
      if (i) assert.deepEqual(step.before, lesson.steps[i - 1].after);
      assert.notEqual(step.before, step.after);
      for (const edge of step.after.relationships) {
        assert.ok(step.after.documents.some((d) => d.id === edge.from));
        assert.ok(step.after.documents.some((d) => d.id === edge.to));
      }
    });
    lesson.steps[0].after.documents[0].data._id = -1;
    assert.notEqual(lesson.steps[0].before.documents[0].data._id, -1);
    assert.notEqual(lesson.steps[1].before.documents[0].data._id, -1);
    assert.notEqual(buildModelingLesson(id).steps[0].after.documents[0].data._id, -1);
  }
});
