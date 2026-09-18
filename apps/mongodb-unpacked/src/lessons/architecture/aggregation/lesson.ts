import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'aggregate',
  number: '06',
  name: 'Run an aggregation',
  short: 'Local work, shared result',
  category: 'Data in motion',
  blurb:
    'Filter orders, calculate partial sums, and follow the results into a final merge.',
};
export function build(topology: Topology): Lesson {
  const { steps, entry, sharded, flow, add } = createArchitectureBuilder(topology);

  const command = `db.orders.aggregate([
  { $match: { status: "open" } },
  { $group: { _id: null,
      total: { $sum: "$amount" } } }
], { allowDiskUse: false })`;
  const takeaway = sharded
    ? 'This small pipeline merges at mongos. Other stages, options, and execution plans can place the merger on a shard. explain() reveals the actual split.'
    : 'The selected mongod runs the pipeline locally: filter the documents, then aggregate their values.';
  add({
    id: 'submit-an-aggregation',
    title: 'Submit an aggregation',
    description:
      'Find open orders, then sum their amounts. The input collection contains four open orders.',
    flows: [flow('app', entry, 'request', '$match → $group')],
  });
  if (sharded)
    add({
      id: 'split-the-work-across-shards',
      title: 'Split the work across shards',
      description:
        'The status predicate cannot target a tenant range, so both shards receive the shard-side pipeline.',
      flows: [
        flow('r1', 'a1', 'request', '$match + partial $group'),
        flow('r1', 'b1', 'request', '$match + partial $group'),
      ],
    });
  add({
    id: 'filter-and-sum-locally',
    title: 'Filter and sum locally',
    description: sharded
      ? 'Shard A sums 40 + 60 = 100. Shard B sums 25 + 50 = 75. Closed orders are filtered out.'
      : 'The server filters out closed orders and sums 40 + 60 + 25 + 50 = 175.',
    flows: [],
    update: (state) => {
      state.partialA = state.members.a1.docs
        .filter((d) => d.status === 'open')
        .reduce((n, d) => n + d.amount, 0);
      if (sharded)
        state.partialB = state.members.b1.docs
          .filter((d) => d.status === 'open')
          .reduce((n, d) => n + d.amount, 0);
    },
    focus: sharded ? ['a1', 'b1'] : ['a1'],
  });
  if (sharded)
    add({
      id: 'send-partial-results-to-the-merger',
      title: 'Send partial results to the merger',
      description:
        'The shards send their partial sums instead of sending all input documents.',
      flows: [
        flow('a1', 'r1', 'response', 'subtotal: 100'),
        flow('b1', 'r1', 'response', 'subtotal: 75'),
      ],
    });
  add({
    id: 'finish-the-local-group',
    title: sharded ? 'Merge: 100 + 75' : 'Finish the local group',
    description: sharded
      ? 'For this small pipeline with allowDiskUse false, mongos combines the shard results into a total of 175.'
      : 'The group stage produces a single result document.',
    flows: [],
    update: (state) => {
      state.total = (state.partialA ?? 0) + (state.partialB ?? 0);
    },
    focus: [entry],
  });
  add({
    id: 'one-result-reaches-the-application',
    title: 'One result reaches the application',
    description: '{ _id: null, total: 175 }',
    flows: [flow(entry, 'app', 'response', 'total: 175')],
    update: (state) => {
      state.readResult = 'total: 175';
    },
  });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'boxes',
  topologies: ['standalone', 'replica', 'sharded'],
  annotations: (model) => ({
    ...(model.total !== null ? { r1: 'total: ' + model.total } : {}),
    ...(model.partialA !== null ? { a1: 'sum: ' + model.partialA } : {}),
    ...(model.partialB !== null ? { b1: 'sum: ' + model.partialB } : {}),
  }),
  build,
};
