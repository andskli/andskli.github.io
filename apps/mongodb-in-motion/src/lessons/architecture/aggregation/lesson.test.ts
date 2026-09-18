import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLesson } from '../../../learning/lesson-registry.ts';
import type { Topology } from '../types.ts';
test('aggregation computes the same total locally and across partitions', () => {
  for (const topology of ['standalone', 'replica', 'sharded'] as Topology[]) {
    const result = buildLesson('aggregate', topology).steps.at(-1)!.after;
    assert.equal(result.total, 175);
    if (topology === 'sharded') {
      assert.equal(result.partialA, 100);
      assert.equal(result.partialB, 75);
    }
  }
});
