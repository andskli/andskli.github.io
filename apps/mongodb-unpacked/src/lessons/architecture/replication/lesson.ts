import { clone } from '../../../learning/snapshots.ts';
import { createArchitectureBuilder } from '../builder.ts';
import { newDoc } from '../fixtures.ts';
import type { ArchitectureDefinition, Lesson, Topology } from '../types.ts';
export const metadata = {
  id: 'write',
  number: '01',
  name: 'Write & replicate',
  short: 'Follow a document',
  category: 'Data in motion',
  blurb:
    'Send one document into the cluster. Follow its route, its copies, and its acknowledgement.',
};
export function build(topology: Topology): Lesson {
  const { steps, entry, sharded, replicated, flow, add } =
    createArchitectureBuilder(topology);

  const command = `db.orders.insertOne(\n  { tenantId: 42, item: "Desk plant",\n    amount: 35, status: "open" },\n  { writeConcern: { w: ${replicated ? '"majority"' : '1'} } }\n)`;
  const takeaway = replicated
    ? 'Replication creates copies inside one replica set. A majority acknowledgement does not wait for every secondary.'
    : 'mongod stores the document and its indexes. A standalone server has no replica-set copies to fail over to.';
  add({
    id: 'a-document-leaves-the-application',
    title: 'A document leaves the application',
    description: sharded
      ? 'The driver sends the insert to a mongos router.'
      : 'The driver connects directly to mongod; this topology has no mongos.',
    flows: [flow('app', entry, 'request', 'insertOne')],
  });
  if (sharded)
    add({
      id: 'the-shard-key-chooses-a-destination',
      title: 'The shard key chooses a destination',
      description:
        'The cached map places tenantId 42 in shard A. mongos forwards the write to its primary.',
      flows: [flow('r1', 'a1', 'request', 'tenantId: 42')],
    });
  add({
    id: 'the-primary-stores-the-document',
    title: 'The primary stores the document',
    description: replicated
      ? 'mongod applies the write, journals it, and adds a corresponding oplog entry.'
      : 'mongod applies the write and journals it on this server.',
    flows: [],
    update: (state) => {
      state.members.a1.docs.push(clone(newDoc));
      state.members.a1.applied = 2;
      state.members.a1.durable = 2;
    },
    focus: ['a1'],
  });
  if (replicated) {
    add({
      id: 'a-secondary-replicates-the-write',
      title: 'A secondary replicates the write',
      description:
        'A2 receives and applies the oplog entry. This example now has two durable copies out of three voting data-bearing members.',
      flows: [flow('a1', 'a2', 'replication', 'oplog · v2')],
      update: (state) => {
        state.members.a2.docs.push(clone(newDoc));
        state.members.a2.applied = 2;
        state.members.a2.durable = 2;
      },
    });
    add({
      id: 'the-majority-condition-is-met',
      title: 'The majority condition is met',
      description:
        'The primary learns that a majority has durably replicated the write. It can acknowledge before A3 catches up.',
      flows: [],
      update: (state) => {
        state.members.a1.committed = 2;
        state.members.a2.committed = 2;
      },
      focus: ['a1', 'a2'],
    });
  }
  if (sharded)
    add({
      id: 'acknowledgement-reaches-mongos',
      title: 'Acknowledgement reaches mongos',
      description: 'The primary returns a successful write result to the router.',
      flows: [flow('a1', 'r1', 'response', 'acknowledged')],
    });
  add({
    id: 'the-write-is-acknowledged',
    title: 'The write is acknowledged',
    description: replicated
      ? 'The application receives success. The third member is still allowed to lag.'
      : 'The application receives the acknowledgement from this mongod.',
    flows: [flow(entry, 'app', 'response', '{ acknowledged: true }')],
    update: (state) => {
      state.acknowledged = true;
    },
  });
  if (replicated)
    add({
      id: 'the-remaining-secondary-catches-up',
      title: 'The remaining secondary catches up',
      description:
        'A3 replicates the same write independently of the acknowledgement. These are copies of the same document.',
      flows: [flow('a1', 'a3', 'replication', 'oplog · v2')],
      update: (state) => {
        state.members.a3.docs.push(clone(newDoc));
        state.members.a3.applied = 2;
        state.members.a3.durable = 2;
        state.members.a3.committed = 2;
      },
    });
  return { ...metadata, command, takeaway, steps };
}
export const lesson: ArchitectureDefinition = {
  ...metadata,
  icon: 'write',
  topologies: ['standalone', 'replica', 'sharded'],
  build,
};
