import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'target',
  number: '02',
  name: 'Find a document',
  short: 'One key, one shard',
  category: 'Data in motion',
  blurb:
    'A shard key gives the router an address. Follow a targeted read from the application to its result.',
};
export function build(topology: Topology): Lesson {
  const { steps, entry, sharded, flow, add, reply } = createArchitectureBuilder(topology);

  const command = `db.orders.find({ tenantId: 42 })
  .readPref("primary")`;
  const takeaway = sharded
    ? 'A shard-key predicate can target a specific shard. The replica-set member is then selected using read preference.'
    : 'The driver discovers the primary and reads the matching document from that member.';
  add({
    id: 'ask-for-tenant-42',
    title: 'Ask for tenant 42',
    description: 'This query specifies the shard key and uses primary read preference.',
    flows: [flow('app', entry, 'request', 'find · tenant 42')],
  });
  if (sharded)
    add({
      id: 'use-the-cached-shard-map',
      title: 'Use the cached shard map',
      description:
        'mongos targets shard A without a config-server lookup on this request.',
      flows: [flow('r1', 'a1', 'request', 'target shard A')],
    });
  add({
    id: 'find-the-matching-document',
    title: 'Find the matching document',
    description:
      'The selected mongod executes the query against its local collection and indexes.',
    flows: [],
    update: undefined,
    focus: ['a1'],
  });
  reply('{ tenantId: 42, item: "Field notes", amount: 40 }');
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'search',
  topologies: ['standalone', 'replica', 'sharded'],
  build,
};
