import type { LessonIcon, LessonStep, StepShortcut } from '../../learning/types.ts';
export type ModelingId =
  keyof typeof import('../../learning/lesson-registry.ts').modelingLessons;
export type ReferenceMode = 'application' | 'lookup';
export type DataValue =
  string | number | boolean | null | DataValue[] | { [key: string]: DataValue };
export type DocumentData = { [key: string]: DataValue };
export type DocumentKind =
  'document' | 'book' | 'apparel' | 'audio' | 'order' | 'customer' | 'address' | 'page';
export interface ModelingDocument {
  /** Stable scene/relationship key, independent of the BSON document's data._id. */
  id: string;
  title: string;
  collection: string;
  kind: DocumentKind;
  data: DocumentData;
  /** Ground-plane coordinates [x, z] in scene units; the renderer supplies height. */
  position: [number, number];
  /** Use 0 to hide a card; retain its ID in every snapshot so the renderer can reuse it. */
  scale: number;
  /** `view` is an application response, not another persisted document. */
  storage: 'document' | 'draft' | 'view';
}
export interface CollectionTray {
  id: string;
  label: string;
  detail: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}
export interface Relationship {
  /** Endpoints refer to ModelingDocument.id, not data._id. */
  from: string;
  to: string;
  label: string;
  active: boolean;
}
export interface IndexEntry {
  documentId: string;
  values: DataValue[];
}
/** Logical keys and illustrative work counters, not MongoDB explain output or disk layout. */
export interface IndexView {
  present: boolean;
  name: string;
  fields: string[];
  entries: IndexEntry[];
  selectedKeys: string[];
  operation: 'idle' | 'scan' | 'build' | 'seek' | 'maintain' | 'multikey';
  visited: string[];
  matchingKeys: number | null;
  documentsChecked: number | null;
  documentWrites: number | null;
  removedKeys: number;
  addedKeys: number;
  note: string;
}
export interface WorkloadView {
  reads: number;
  writes: number;
  phase: string;
  note: string;
}
export interface ModelingState {
  /** Declare all cards and relationships in the first snapshot, including initially hidden ones. */
  documents: ModelingDocument[];
  focus: string[];
  highlights: string[];
  /** null = no query applied; [] = a query ran and matched nothing. */
  matches: string[] | null;
  indexView?: IndexView;
  workload?: WorkloadView;
  relationships: Relationship[];
  query: string;
  result: string;
  resultData: DataValue | null;
}
export interface ModelingStep extends LessonStep<ModelingState> {
  title: string;
  description: string;
  code: string;
  before: ModelingState;
  after: ModelingState;
}
/** Orthographic framing in world units; independent of the viewport's pixel dimensions. */
export interface ModelingPresentation {
  worldWidth: number;
  minHeight: number;
  relationshipCaption?: string;
}
export interface ModelingLesson {
  presentation: ModelingPresentation;
  id: string;
  number: string;
  name: string;
  short: string;
  heading: string;
  blurb: string;
  takeaway: string;
  collection: string;
  trays: CollectionTray[];
  steps: ModelingStep[];
  source: string;
}
export interface ModelingDefinition {
  id: string;
  number: string;
  name: string;
  short: string;
  heading: string;
  blurb: string;
  collection: string;
  source: string;
  icon: LessonIcon;
  layout?: 'practice' | 'reference';
  referenceResolution?: boolean;
  shortcuts?: StepShortcut[];
  build: (mode?: ReferenceMode) => ModelingLesson;
}
