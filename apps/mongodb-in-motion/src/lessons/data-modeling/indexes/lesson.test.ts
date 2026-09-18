import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelingLesson } from '../../../learning/lesson-registry.ts';
import type { DocumentData } from '../types.ts';
import { compoundEntries, keyIdentity, multikeyEntries } from './operations.ts';
test('nested-field compound keys supply the same ordered result as a scan while leaving document order unchanged', () => {
  const lesson = buildModelingLesson('indexes'),
    scan = lesson.steps[1].after,
    built = lesson.steps[2].after,
    indexed = lesson.steps[3].after;
  assert.deepEqual(
    built.indexView!.entries.map((e) => [e.documentId, ...e.values]),
    [
      ['book', 'books', 24],
      ['sketch', 'books', 36],
      ['tee', 'clothing', 30],
    ],
  );
  assert.deepEqual(built.documents, lesson.steps[0].before.documents);
  assert.deepEqual(indexed.resultData, scan.resultData);
  assert.deepEqual(
    (indexed.resultData as DocumentData[]).map((d) => d._id),
    [101, 104],
  );
  assert.equal(scan.indexView?.documentsChecked, 3);
  assert.equal(indexed.indexView?.documentsChecked, 2);
  assert.equal(indexed.indexView?.matchingKeys, 2);
  assert.deepEqual(indexed.indexView?.visited, ['book', 'sketch']);
});
test('changing an indexed price replaces its key and reorders only the logical index', () => {
  const step = buildModelingLesson('indexes').steps[4];
  const before = step.before.indexView!,
    after = step.after.indexView!;
  assert.deepEqual(
    after.entries.map((e) => [e.documentId, ...e.values]),
    [
      ['sketch', 'books', 36],
      ['book', 'books', 42],
      ['tee', 'clothing', 30],
    ],
  );
  const oldKeys = new Set(before.entries.map(keyIdentity)),
    newKeys = new Set(after.entries.map(keyIdentity));
  assert.equal([...oldKeys].filter((k) => !newKeys.has(k)).length, after.removedKeys);
  assert.equal([...newKeys].filter((k) => !oldKeys.has(k)).length, after.addedKeys);
  assert.equal(after.documentWrites, 1);
  assert.deepEqual(step.before.documents.slice(0, 2), step.after.documents.slice(0, 2));
  assert.deepEqual(
    step.before.documents.map((d) => d.id),
    step.after.documents.map((d) => d.id),
  );
  assert.deepEqual(compoundEntries(step.after.documents), after.entries);
});
test('multikey entries expand distinct array values per document and query results contain each document once', () => {
  const state = buildModelingLesson('indexes').steps[5].after;
  assert.equal(state.indexView?.entries.length, 6);
  assert.equal(state.indexView?.matchingKeys, 2);
  assert.deepEqual(
    (state.resultData as DocumentData[]).map((d) => d._id),
    [101, 104],
  );
  assert.equal((state.resultData as DocumentData[])[0].price, 42);
  (state.documents[0].data.tags as string[]).push('design', 'art');
  assert.equal(multikeyEntries(state.documents).length, 6);
  for (const key of state.indexView!.entries)
    assert.ok(state.documents.some((d) => d.id === key.documentId));
});
