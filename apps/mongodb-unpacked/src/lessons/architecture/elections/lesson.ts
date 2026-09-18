import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'fail',
  number: '04',
  name: 'When a primary fails',
  short: 'An election in motion',
  category: 'Resilience & consistency',
  blurb:
    'Stop a primary. Watch the remaining members elect a replacement and restore the write path.',
};
export function build(topology: Topology): Lesson {
  const { steps, sharded, flow, add } = createArchitectureBuilder(topology);

  const command = `// Stop the primary of rs-a
// Surviving members remain connected
// Both are caught up and electable`;
  const takeaway =
    'An election needs a majority of votes. A shard elects its own primary; a different shard or the config-server primary does not take its place.';
  add({
    id: 'the-primary-goes-offline',
    title: 'The primary goes offline',
    description:
      'A1 stops responding. Writes to this replica set cannot proceed until a new primary is available.',
    flows: [],
    update: (state) => {
      state.members.a1.alive = false;
    },
    focus: ['a1'],
  });
  add({
    id: 'the-survivors-detect-the-failure',
    title: 'The survivors detect the failure',
    description:
      'Heartbeat timeouts trigger an election. This lesson compresses time; actual failover duration varies.',
    flows: [
      flow('a2', 'a1', 'metadata', 'heartbeat timeout'),
      flow('a3', 'a1', 'metadata', 'heartbeat timeout'),
    ],
    update: undefined,
    focus: ['a2', 'a3'],
  });
  add({
    id: 'a-candidate-collects-a-majority',
    title: 'A candidate collects a majority',
    description:
      'A2 has its own vote and receives A3’s vote: two of the three configured voters. Both survivors are caught up and eligible.',
    flows: [flow('a3', 'a2', 'metadata', 'vote for A2')],
    update: (state) => {
      state.votes = 2;
    },
  });
  add({
    id: 'a2-becomes-the-new-primary',
    title: 'A2 becomes the new primary',
    description: 'Its process stays mongod; its role changes from secondary to primary.',
    flows: [],
    update: (state) => {
      state.members.a1.role = 'Secondary';
      state.members.a2.role = 'Primary';
      state.primary = 'a2';
    },
    focus: ['a2'],
  });
  add({
    id: 'the-write-path-recovers',
    title: 'The write path recovers',
    description: sharded
      ? 'mongos discovers the new primary and can send a new write to A2.'
      : 'The driver discovers A2 and can send a new write directly to it.',
    flows: [flow(sharded ? 'r1' : 'app', 'a2', 'request', 'new write')],
  });
  add({
    id: 'a1-rejoins-as-a-secondary',
    title: 'A1 rejoins as a secondary',
    description:
      'The old process comes back, discovers the current primary, and catches up. It does not automatically reclaim leadership.',
    flows: [flow('a2', 'a1', 'replication', 'catch up')],
    update: (state) => {
      state.members.a1.alive = true;
    },
  });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'shield',
  topologies: ['replica', 'sharded'],
  commandKind: 'notes',
  build,
};
