import type { Topology } from '../lessons/architecture/types.ts';
export const titles: Record<Topology, string> = {
  standalone: 'One server. One document.',
  replica: 'Three members. One dataset.',
  sharded: 'The cluster, explained.',
};
export const topologyNames: Record<Topology, string> = {
  standalone: 'One server',
  replica: 'Replica set',
  sharded: 'Sharded cluster',
};
