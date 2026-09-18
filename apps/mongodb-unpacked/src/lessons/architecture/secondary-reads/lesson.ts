import { createArchitectureBuilder } from '../builder.ts';
import type { ArchitectureDefinition, Concern, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'secondary',
  number: '05',
  name: 'Read from a secondary',
  short: 'Preference meets concern',
  category: 'Resilience & consistency',
  blurb:
    'Choose a secondary, then compare its local and majority-committed views of the same document.',
};
export function build(topology: Topology, concern: Concern = 'majority'): Lesson {
  const { state, steps, sharded, flow, add } = createArchitectureBuilder(topology);

  state.members.a1.applied = 2;
  state.members.a2.applied = 2;
  state.members.a1.docs[0].amount = 45;
  state.members.a2.docs[0].amount = 45;
  const command = `db.orders.find({ tenantId: 42 })\n  .readPref("secondary")\n  .readConcern("${concern}")`;
  const takeaway =
    'Read preference chooses where to read. Read concern controls visibility guarantees. Even a majority read can return older data; it does not poll a majority for every query.';
  add({
    id: 'two-views-of-the-same-member',
    title: 'Two views of the same member',
    description:
      'A2 has locally applied v2 (amount 45), while its majority-committed view is still v1 (amount 40). This transient state is frozen for comparison.',
    flows: [],
    update: undefined,
    focus: ['a2'],
  });
  if (sharded)
    add({
      id: 'target-the-right-shard',
      title: 'Target the right shard',
      description: 'The router uses tenantId 42 to select shard A.',
      flows: [flow('app', 'r1', 'request', 'find · secondary')],
    });
  add({
    id: 'read-preference-selects-a2',
    title: 'Read preference selects A2',
    description:
      'secondary read preference selects an eligible secondary. It does not decide which version of the document is visible.',
    flows: [flow(sharded ? 'r1' : 'app', 'a2', 'request', 'read from secondary')],
  });
  add({
    id: 'read-the-committed-view',
    title: concern === 'local' ? 'Read the local view' : 'Read the committed view',
    description:
      concern === 'local'
        ? 'local can return v2 (amount 45). This version is not yet majority-committed and could roll back.'
        : 'majority returns v1 (amount 40), the member’s committed view. Durability does not imply that it is the newest version.',
    flows: [],
    update: (state) => {
      state.readResult = concern === 'local' ? 'v2 · amount: 45' : 'v1 · amount: 40';
    },
    focus: ['a2'],
  });
  if (sharded)
    add({
      id: 'return-through-mongos',
      title: 'Return through mongos',
      description: 'The selected secondary returns its result to the router.',
      flows: [flow('a2', 'r1', 'response', concern === 'local' ? 'v2 · 45' : 'v1 · 40')],
    });
  add({
    id: 'the-application-sees-the-selected-view',
    title: 'The application sees the selected view',
    description:
      concern === 'local'
        ? 'The application gets amount 45 from the local view. Try majority to compare.'
        : 'The application gets amount 40 from the committed view. Try local to compare.',
    flows: [
      flow(
        sharded ? 'r1' : 'a2',
        'app',
        'response',
        concern === 'local' ? 'amount: 45' : 'amount: 40',
      ),
    ],
  });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'layers',
  topologies: ['replica', 'sharded'],
  readConcern: true,
  annotations: (model) => ({
    a2:
      'local v' +
      model.members.a2.applied +
      ' · committed v' +
      model.members.a2.committed,
  }),
  build,
};
