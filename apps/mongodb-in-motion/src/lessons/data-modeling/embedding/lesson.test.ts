import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelingLesson } from '../../../learning/lesson-registry.ts';
import type { DocumentData } from '../types.ts';
test('embedding moves draft input into the one stored document and applies both fields atomically', () => {
  const lesson = buildModelingLesson('embedding');
  const embedded = lesson.steps[1].after;
  assert.equal(embedded.documents.filter((d) => d.storage === 'document').length, 1);
  assert.equal(embedded.documents[1].scale, 0);
  assert.equal((embedded.documents[0].data.shipping as DocumentData).city, 'Stockholm');
  const atomic = lesson.steps[3];
  assert.equal(atomic.before.documents[0].data.status, 'draft');
  assert.equal(
    (atomic.before.documents[0].data.shipping as DocumentData).city,
    'Stockholm',
  );
  assert.equal(atomic.after.documents[0].data.status, 'confirmed');
  assert.equal((atomic.after.documents[0].data.shipping as DocumentData).city, 'Uppsala');
  assert.equal((atomic.after.documents[0].data.items as unknown[]).length, 2);
});
