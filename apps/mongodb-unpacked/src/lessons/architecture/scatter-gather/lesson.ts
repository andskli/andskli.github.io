import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'scatter',
  number: '03',
  name: 'Query every shard',
  short: 'Scatter, then gather',
  category: 'Data in motion',
  blurb:
    'Take away the shard-key filter and watch the same query fan out across the collection.',
};
export function build(topology: Topology): Lesson {
  const { steps, flow, add } = createArchitectureBuilder(topology);

  const command = `db.orders.find({ status: "open" })
  .readPref("primary")`;
  const takeaway =
    'Without a usable shard-key predicate, this query visits all shards holding the collection. Each shard searches its own partition.';
  add({
    id: 'query-by-status',
    title: 'Query by status',
    description:
      'The application asks for open orders. The predicate gives no tenantId range to target.',
    flows: [flow('app', 'r1', 'request', 'status: open')],
  });
  add({
    id: 'scatter-to-both-shards',
    title: 'Scatter to both shards',
    description:
      'mongos opens cursors on the primaries of both shards for this collection.',
    flows: [
      flow('r1', 'a1', 'request', 'find open orders'),
      flow('r1', 'b1', 'request', 'find open orders'),
    ],
  });
  add({
    id: 'each-shard-searches-locally',
    title: 'Each shard searches locally',
    description:
      'A finds two open orders; B finds two more. Secondaries are copies, not extra partitions.',
    flows: [],
    update: undefined,
    focus: ['a1', 'b1'],
  });
  add({
    id: 'gather-the-matches',
    title: 'Gather the matches',
    description: 'The router receives matching documents from each shard.',
    flows: [
      flow('a1', 'r1', 'response', '2 documents'),
      flow('b1', 'r1', 'response', '2 documents'),
    ],
  });
  add({
    id: 'return-the-combined-result',
    title: 'Return the combined result',
    description: 'The application receives four matching orders.',
    flows: [flow('r1', 'app', 'response', '4 open orders')],
    update: (state) => {
      state.readResult = '4 open orders';
    },
  });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'network',
  topologies: ['sharded'],
  build,
};
