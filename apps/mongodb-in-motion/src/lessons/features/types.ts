import type { LessonIcon, LessonStep } from '../../learning/types.ts';
export type FeatureId =
  keyof typeof import('../../learning/lesson-registry.ts').featureLessons;
export type OperationType = 'insert' | 'update' | 'delete';
/** `default` reports only the update delta; `updateLookup` adds the current document. */
export type FullDocumentMode = 'default' | 'updateLookup';
/** Preset $match stages so the effect of a pipeline is visible without a query engine. */
export type FilterMode = 'none' | 'inserts' | 'open';
export interface StreamOptions {
  fullDocument: FullDocumentMode;
  filter: FilterMode;
}
/** The four places the lesson draws: writers, the primary, its oplog, and a consumer. */
export type Part = 'producer' | 'primary' | 'oplog' | 'consumer';
export interface Order {
  _id: number;
  item: string;
  amount: number;
  status: 'open' | 'closed';
}
export type OrderChanges = Partial<Omit<Order, '_id'>>;
/** One retained oplog position. `ts` is a teaching counter, not a real cluster time. */
export interface OplogEntry {
  ts: number;
  op: OperationType;
  /** documentKey._id of the changed order. */
  id: number;
  /** Inserted document, for inserts. */
  doc?: Order;
  /** Fields set by an update. */
  set?: OrderChanges;
}
export interface ChangeEvent {
  ts: number;
  /** The event's _id: an opaque resume token for this oplog position. */
  token: string;
  operationType: OperationType;
  ns: 'shop.orders';
  documentKey: { _id: number };
  /** null means the document no longer exists when updateLookup ran. */
  fullDocument?: Order | null;
  updateDescription?: { updatedFields: OrderChanges; removedFields: string[] };
}
export type ConsumerStatus = 'healthy' | 'slow' | 'offline';
export interface ChangeStreamModel {
  options: StreamOptions;
  orders: Order[];
  /** Retained oplog window, oldest first. Older entries have been overwritten. */
  oplog: OplogEntry[];
  oplogCapacity: number;
  headTs: number;
  streamOpen: boolean;
  /** Last oplog position the stream has scanned. */
  cursorTs: number | null;
  consumer: ConsumerStatus;
  /** Delivered to the consumer but not yet processed; lost if the consumer crashes. */
  inbox: ChangeEvent[];
  processedCount: number;
  /** Position of the resume token the consumer has persisted. */
  savedTs: number | null;
  lastEvent: ChangeEvent | null;
  /** Oplog positions delivered by the most recent step. */
  fresh: number[];
  error: string | null;
  /** Changes the consumer never saw because its token fell out of the oplog. */
  missed: number;
  event: string;
}
export interface FeatureFlow {
  from: Part;
  to: Part;
  kind: 'write' | 'oplog' | 'event' | 'watch';
  label: string;
}
export interface FeatureStep extends LessonStep<ChangeStreamModel> {
  code: string;
  flows: FeatureFlow[];
  focus: Part[];
}
export interface FeatureLesson {
  id: string;
  number: string;
  name: string;
  short: string;
  heading: string;
  blurb: string;
  collection: string;
  takeaway: string;
  source: string;
  steps: FeatureStep[];
}
export interface FeatureDefinition {
  id: string;
  number: string;
  name: string;
  short: string;
  heading: string;
  blurb: string;
  collection: string;
  source: string;
  icon: LessonIcon;
  /** Show the fullDocument / pipeline selectors for this lesson. */
  streamOptions?: boolean;
  build: (options?: StreamOptions) => FeatureLesson;
}
