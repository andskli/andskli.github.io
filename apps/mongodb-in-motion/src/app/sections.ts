import type { Topology } from '../lessons/architecture/types.ts';
/** The permanent main navigation: one lesson domain, or one cluster topology. */
export type MainSection = 'modeling' | Topology | 'features';
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
export const isTopology = (section: MainSection): section is Topology =>
  section !== 'modeling' && section !== 'features';
