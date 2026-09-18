import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'config',
  number: '07',
  name: 'Inside config servers',
  short: 'The map of the cluster',
  category: 'Behind the cluster',
  blurb:
    'Explore the metadata replica set: its primary, its copies, and the routing map cached by mongos.',
};
export function build(topology: Topology): Lesson {
  const { state, steps, flow, add } = createArchitectureBuilder(topology);

  state.cacheVersion = 0;
  const command = `// Config-server replica set: cfg-rs
// config.collections → shard keys
// config.chunks → ranges & owners
// config.shards → shard membership`;
  const takeaway =
    'Dedicated config servers store cluster metadata. mongos caches the routing map. The balancer coordinates from the config primary; document transfers happen between shards.';
  add({
    id: 'a-replica-set-for-metadata',
    title: 'A replica set for metadata',
    description:
      'C1, C2, and C3 are mongod processes. Their replica set stores the configuration and routing metadata of this cluster.',
    flows: [],
    update: undefined,
    focus: ['c1', 'c2', 'c3'],
  });
  add({
    id: 'metadata-changes-are-replicated',
    title: 'Metadata changes are replicated',
    description:
      'Config-server metadata writes use majority write concern. Copies protect the map of the cluster.',
    flows: [
      flow('c1', 'c2', 'metadata', 'metadata oplog'),
      flow('c1', 'c3', 'metadata', 'metadata oplog'),
    ],
  });
  add({
    id: 'a-router-loads-its-map',
    title: 'A router loads its map',
    description:
      'A starting mongos reads routing metadata with majority read concern. This trace reads from C1.',
    flows: [flow('r1', 'c1', 'metadata', 'load shard map')],
  });
  add({
    id: 'keep-a-routing-cache',
    title: 'Keep a routing cache',
    description:
      'mongos caches the range-to-shard mapping: tenantId below 1000 belongs to A; values from 1000 belong to B.',
    flows: [flow('c1', 'r1', 'metadata', 'routing map · v1')],
    update: (state) => {
      state.cacheVersion = 1;
    },
  });
  add({
    id: 'route-using-the-cache',
    title: 'Route using the cache',
    description:
      'A subsequent tenant 42 query can route directly to shard A. It does not need a config-server read every time.',
    flows: [flow('r1', 'a1', 'request', 'cached route → A')],
  });
  add({
    id: 'the-balancer-has-a-coordinator',
    title: 'The balancer has a coordinator',
    description:
      'The balancer runs on the config-server primary and coordinates range migrations. Shards do the document copying.',
    flows: [],
    update: undefined,
    focus: ['c1', 'a1', 'b1'],
  });
  add({
    id: 'refresh-when-metadata-changes',
    title: 'Refresh when metadata changes',
    description:
      'A metadata change or a StaleConfig response can trigger a routing refresh. The cache is not a permanent copy.',
    flows: [flow('r1', 'c1', 'metadata', 'refresh routing map')],
  });
  add({
    id: 'return-the-current-map',
    title: 'Return the current map',
    description: 'The router updates its cache and continues routing requests.',
    flows: [flow('c1', 'r1', 'metadata', 'current routing metadata')],
  });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'settings',
  topologies: ['sharded'],
  commandKind: 'notes',
  annotations: (model) => ({
    r1: 'cache ' + (model.cacheVersion ? 'v' + model.cacheVersion : 'empty'),
  }),
  build,
};
