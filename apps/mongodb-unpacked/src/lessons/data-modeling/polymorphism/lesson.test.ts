import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelingLesson } from '../../../learning/lesson-registry.ts';
test('polymorphic queries select across shared fields and narrow to variant fields without deleting stored documents', () => {
  const lesson = buildModelingLesson('polymorphism');
  const common = lesson.steps[2].after,
    variant = lesson.steps[3].after;
  assert.deepEqual(common.matches, ['book', 'tee']);
  assert.deepEqual(variant.matches, ['book']);
  assert.equal(common.documents.length, 3);
  assert.ok(!('details' in common.documents[1].data));
  assert.ok(!('size' in common.documents[0].data));
  assert.deepEqual(common.documents, lesson.steps[0].before.documents);
});
