import { clone } from '../../../learning/snapshots.ts';
import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'migrate',
  number: '08',
  name: 'Move a data range',
  short: 'How balancing works',
  category: 'Behind the cluster',
  blurb:
    'Move a range from shard A to shard B. Separate copying documents from changing their owner.',
};
export function build(topology: Topology): Lesson {
  const { steps, flow, add } = createArchitectureBuilder(topology);

  const command = `// Illustrative balancer migration
// Collection: shop.orders
// Range: [0, 500)
// Owner: shard A → shard B`;
  const takeaway =
    'Copying data is not the same as changing ownership. A migration commits new metadata, routers refresh, and the donor later removes orphaned copies.';
  add({
    id: 'choose-a-range-to-move',
    title: 'Choose a range to move',
    description:
      'The balancer coordinates moving tenantId range [0, 500) from shard A to shard B. The three-member sets remain intact.',
    flows: [flow('c1', 'a1', 'metadata', 'move [0, 500)')],
  });
  add({
    id: 'copy-to-the-recipient',
    title: 'Copy to the recipient',
    description:
      'The donor copies matching documents to B. A still owns the range while copying and catch-up take place.',
    flows: [flow('a1', 'b1', 'migration', 'copy 2 documents')],
    update: (state) => {
      state.migration = 'copying';
      state.members.b1.docs.push(
        ...clone(state.members.a1.docs.filter((d) => d.tenantId < 500)),
      );
    },
  });
  add({
    id: 'replicate-on-the-recipient',
    title: 'Replicate on the recipient',
    description:
      'The copied documents are also replicated within shard B. These are replica-set copies, not more shards.',
    flows: [
      flow('b1', 'b2', 'replication', 'recipient oplog'),
      flow('b1', 'b3', 'replication', 'recipient oplog'),
    ],
    update: (state) => {
      state.members.b2.docs = clone(state.members.b1.docs);
      state.members.b3.docs = clone(state.members.b1.docs);
    },
  });
  add({
    id: 'commit-the-ownership-change',
    title: 'Commit the ownership change',
    description:
      'After catch-up and a short critical section, ownership metadata changes to B. The metadata commit is majority protected.',
    flows: [
      flow('c1', 'c2', 'metadata', 'owner: B · v2'),
      flow('c1', 'c3', 'metadata', 'owner: B · v2'),
    ],
    update: (state) => {
      state.rangeOwner = 'B';
      state.metadataVersion = 2;
      state.migration = 'committed';
    },
  });
  add({
    id: 'refresh-routing-metadata',
    title: 'Refresh routing metadata',
    description:
      'mongos refreshes the cached map; requests in the moved range must now go to B.',
    flows: [flow('c1', 'r1', 'metadata', 'routing map · v2')],
    update: (state) => {
      state.cacheVersion = 2;
    },
  });
  add({
    id: 'the-same-key-has-a-new-route',
    title: 'The same key has a new route',
    description:
      'tenantId 42 is unchanged, but the range that contains it now belongs to shard B.',
    flows: [flow('r1', 'b1', 'request', 'tenantId: 42 → B')],
  });
  add({
    id: 'clean-up-the-donor-copies',
    title: 'Clean up the donor copies',
    description:
      'The donor eventually deletes the orphaned documents. This simplified lesson omits concurrent writes and cleanup scheduling.',
    flows: [
      flow('a1', 'a2', 'replication', 'range cleanup'),
      flow('a1', 'a3', 'replication', 'range cleanup'),
    ],
    update: (state) => {
      for (const n of ['a1', 'a2', 'a3'])
        state.members[n].docs = state.members[n].docs.filter((d) => d.tenantId >= 500);
      state.migration = 'cleaned';
    },
  });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'branch',
  topologies: ['sharded'],
  commandKind: 'notes',
  build,
};
