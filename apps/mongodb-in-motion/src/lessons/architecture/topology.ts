import { clone } from '../../learning/snapshots.ts';
import { docsA, docsB } from './fixtures.ts';
import type { Member, Model, NodeId, Topology } from './types.ts';
// Prefixes are a shared convention for fixtures, labels and scene routing:
// a/b = data replica sets, c = config replica set, r = mongos. `app` is an exception.
export const NODE_IDS: NodeId[] = [
  'app',
  'r1',
  'r2',
  'a1',
  'a2',
  'a3',
  'b1',
  'b2',
  'b3',
  'c1',
  'c2',
  'c3',
];
export function initialModel(topology: Topology = 'sharded'): Model {
  // Allocate the full member roster; visibleNodes determines what each topology shows.
  // Standalone/replica lessons put both shards' fixtures in A to keep the dataset comparable.
  const members: Record<string, Member> = {};
  for (const id of NODE_IDS.filter((id) => /^[abc]/.test(id) && id !== 'app'))
    members[id] = {
      alive: true,
      role: id.endsWith('1') ? 'Primary' : 'Secondary',
      applied: 1,
      durable: 1,
      committed: 1,
      docs: clone(
        id[0] === 'a'
          ? topology === 'sharded'
            ? docsA
            : [...docsA, ...docsB]
          : id[0] === 'b'
            ? docsB
            : [],
      ),
    };
  return {
    members,
    primary: 'a1',
    cacheVersion: 1,
    metadataVersion: 1,
    rangeOwner: 'A',
    migration: 'idle',
    votes: 0,
    partialA: null,
    partialB: null,
    total: null,
    readResult: null,
    acknowledged: false,
    collection: 'shop.orders',
    event: 'Ready',
  };
}
export function visibleNodes(topology: Topology): NodeId[] {
  return topology === 'standalone'
    ? ['app', 'a1']
    : topology === 'replica'
      ? ['app', 'a1', 'a2', 'a3']
      : NODE_IDS;
}
export function nodeTitle(id: NodeId) {
  return id === 'app'
    ? 'Application'
    : id[0] === 'r'
      ? `mongos ${id === 'r1' ? '01' : '02'}`
      : `mongod ${id.toUpperCase()}`;
}
export function nodeSet(id: NodeId) {
  return id[0] === 'a' && id !== 'app'
    ? 'rs-a'
    : id[0] === 'b'
      ? 'rs-b'
      : id[0] === 'c'
        ? 'cfg-rs'
        : null;
}
