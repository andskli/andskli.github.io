import type { LessonIcon, LessonStep } from '../../learning/types.ts';
export type Topology = 'standalone' | 'replica' | 'sharded';
export type Concern = 'local' | 'majority';
export type NodeId =
  'app' | 'r1' | 'r2' | 'a1' | 'a2' | 'a3' | 'b1' | 'b2' | 'b3' | 'c1' | 'c2' | 'c3';
export type LessonId =
  keyof typeof import('../../learning/lesson-registry.ts').architectureLessons;
export interface Doc {
  _id: number;
  tenantId: number;
  item: string;
  amount: number;
  status: 'open' | 'closed';
}
export interface Member {
  alive: boolean;
  role: 'Primary' | 'Secondary';
  /** Teaching version counters for replication progress, not actual oplog timestamps. */
  applied: number;
  durable: number;
  committed: number;
  docs: Doc[];
}
export interface Model {
  members: Record<string, Member>;
  /** The primary of rs-a, where election lessons run; there is no cluster-wide primary. */
  primary: NodeId;
  cacheVersion: number;
  metadataVersion: number;
  rangeOwner: 'A' | 'B';
  migration: 'idle' | 'copying' | 'committed' | 'cleaned';
  votes: number;
  partialA: number | null;
  partialB: number | null;
  total: number | null;
  readResult: string | null;
  acknowledged: boolean;
  collection: string;
  event: string;
}
export interface Flow {
  from: NodeId;
  to: NodeId;
  kind: 'request' | 'response' | 'replication' | 'metadata' | 'migration';
  label: string;
}
export interface Step extends LessonStep<Model> {
  title: string;
  description: string;
  before: Model;
  after: Model;
  flows: Flow[];
  focus: NodeId[];
}
export interface Lesson {
  id: string;
  name: string;
  short: string;
  category: string;
  number: string;
  blurb: string;
  command: string;
  takeaway: string;
  steps: Step[];
}
export interface ArchitectureDefinition {
  id: string;
  name: string;
  short: string;
  number: string;
  category: string;
  blurb: string;
  icon: LessonIcon;
  topologies: Topology[];
  commandKind?: 'notes';
  readConcern?: boolean;
  build: (topology: Topology, concern?: Concern) => Lesson;
  annotations?: (model: Model) => Partial<Record<NodeId, string>>;
}
