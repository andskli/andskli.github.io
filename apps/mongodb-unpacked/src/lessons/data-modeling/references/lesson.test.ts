import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModelingLesson } from '../../../learning/lesson-registry.ts';
import type { DocumentData } from '../types.ts';
import { resolveCustomer } from './operations.ts';
test('lookup produces a result array while the stored order remains a manual reference', () => {
  const lesson = buildModelingLesson('references', 'lookup');
  const joined = lesson.steps[2].after;
  const output = joined.resultData as DocumentData;
  assert.ok(Array.isArray(output.customer));
  assert.equal((output.customer as DocumentData[])[0]._id, 7);
  for (const order of joined.documents.slice(0, 2)) {
    assert.equal(order.data.customerId, 7);
    assert.equal(order.data.customer, undefined);
  }
  assert.deepEqual(joined.documents, lesson.steps[0].before.documents);
});
test('both reference resolution strategies observe an updated shared profile on a subsequent read', () => {
  for (const mode of ['application', 'lookup'] as const) {
    const lesson = buildModelingLesson('references', mode);
    const before = lesson.steps[3].before,
      after = lesson.steps[3].after;
    assert.equal(before.documents[2].data.tier, 'member');
    assert.equal(after.documents[2].data.tier, 'gold');
    assert.deepEqual(before.documents.slice(0, 2), after.documents.slice(0, 2));
    const refreshed = lesson.steps[4].after.resultData as DocumentData[];
    assert.deepEqual(
      refreshed.map((d) => d._id),
      [7001, 7002],
    );
    for (const result of refreshed) {
      const customer =
        mode === 'lookup'
          ? (result.customer as DocumentData[])[0]
          : (result.customer as DocumentData);
      assert.equal(customer.tier, 'gold');
      assert.equal(customer._id, result.customerId);
    }
  }
  assert.equal(resolveCustomer({ customerId: 7 }, []), undefined);
  assert.equal(resolveCustomer({ customerId: '7' }, [{ _id: 7 }]), undefined);
});
