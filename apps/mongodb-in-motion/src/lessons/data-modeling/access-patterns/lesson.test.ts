import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelingLesson } from '../../../learning/lesson-registry.ts';
import type { DocumentData } from '../types.ts';
test('the page-shaped layout returns the same screen data using two reads instead of three', () => {
  const lesson = buildModelingLesson('access');
  const initialRead = lesson.steps[1].after,
    projected = lesson.steps[3].after;
  assert.deepEqual(projected.documents[0].data, initialRead.documents[0].data);
  assert.deepEqual(projected.documents[0].data, {
    title: 'Field notes',
    price: 24,
    author: 'A. Rivera',
    available: 8,
  });
  assert.equal(initialRead.workload?.reads, 3);
  assert.equal(projected.workload?.reads, 2);
  assert.equal(
    projected.documents.filter((d) => d.storage === 'document' && d.scale > 0).length,
    2,
  );
  assert.equal(projected.documents[1].data.detailsId, undefined);
  assert.equal((projected.documents[1].data.details as DocumentData).pages, 192);
  const response = projected.resultData as {
    product: DocumentData;
    inventory: DocumentData;
  };
  assert.equal(response.product.internalNotes, undefined);
  assert.equal((response.product.details as DocumentData).pages, undefined);
  assert.equal(response.product._id, 101);
  assert.equal(projected.documents[1].data.internalNotes, 'Supplier review in October');
});
test('stock writes leave the product and rendered response untouched until an explicit refresh', () => {
  const lesson = buildModelingLesson('access'),
    write = lesson.steps[4],
    refresh = lesson.steps[5];
  assert.deepEqual(write.before.documents[1], write.after.documents[1]);
  assert.deepEqual(write.before.documents[0], write.after.documents[0]);
  assert.equal(write.after.documents[3].data.available, 7);
  assert.equal(write.after.documents[0].data.available, 8);
  assert.equal(write.after.workload?.writes, 1);
  assert.equal(refresh.after.documents[0].data.available, 7);
  assert.equal(refresh.after.workload?.reads, 1);
});
