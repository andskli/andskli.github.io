import type { LessonIcon, LessonStep } from '../../learning/types.ts';
export type UseCaseId =
  keyof typeof import('../../learning/lesson-registry.ts').useCaseLessons;
export type SourceId = 'crm' | 'rdbms' | 'api';
/** CDC reads a change log; a micro-batch job polls an API that has no log to read. */
export type Method = 'cdc' | 'microBatch';
export type ConsumerId = 'app' | 'analytics' | 'ai';
/** The three ODL maturity levels from the Atlas Architecture Center reference. */
export type OdlLevel = 'read-only' | 'enriched' | 'read-write';
/** Everything the lesson draws. `cdc` and `batch` are the two ingestion lanes. */
export type Part = SourceId | 'cdc' | 'batch' | 'odl' | ConsumerId;
export interface Customer {
  _id: number;
  name?: string;
  email?: string;
  segment?: string;
  plan?: string;
  balance?: number;
  shipment?: { status: string; eta: string };
  region?: string;
  churnRisk?: string;
  /** Provenance: how fresh each source's contribution is. */
  sources?: Partial<Record<SourceId, string>>;
  preferences?: { marketingOptIn: boolean };
  embedding?: number[];
}
export type CustomerFields = Partial<Omit<Customer, '_id'>>;
/** One captured change, shown in the format the source speaks. */
export interface SourceChange {
  id: number;
  source: SourceId;
  method: Method;
  /** Native format: JSON change event, relational change record, or XML. */
  format: 'JSON' | 'Change record' | 'XML';
  raw: string;
  fields: CustomerFields;
}
export interface SourceSystem {
  id: SourceId;
  name: string;
  detail: string;
  method: Method;
  /** Typical end-to-end delay from a source commit to the ODL. Illustrative. */
  latency: string;
  /** Percent load from consumers that still query this system directly. Illustrative. */
  load: number;
  captured: number;
}
export interface Consumer {
  id: ConsumerId;
  name: string;
  detail: string;
  /** false: queries the source systems directly; true: reads the ODL. */
  unlocked: boolean;
}
export interface OdlModel {
  level: OdlLevel;
  /** Parts introduced so far. Sources and consumers are always present. */
  layers: { cdc: boolean; batch: boolean; odl: boolean };
  sources: SourceSystem[];
  /** Changes captured on each lane and not yet written to the ODL. */
  cdc: SourceChange[];
  batch: SourceChange[];
  batchRuns: number;
  batchInterval: string;
  landed: Partial<Record<SourceId, SourceChange>>;
  collections: Record<string, number>;
  customer: Customer | null;
  enriched: boolean;
  acceptsWrites: boolean;
  consumers: Consumer[];
  /** Capabilities unlocked so far, in the order they were unlocked. */
  value: string[];
  lastChange: SourceChange | null;
  /** Point-to-point connections to maintain, or ODL spokes once the hub is live. */
  integrations: number;
  event: string;
}
export interface OdlFlow {
  from: Part;
  to: Part;
  kind: 'cdc' | 'batch' | 'read' | 'write' | 'direct';
  label: string;
}
export interface OdlStep extends LessonStep<OdlModel> {
  code: string;
  flows: OdlFlow[];
  focus: Part[];
}
export interface OdlLesson {
  id: string;
  number: string;
  name: string;
  short: string;
  heading: string;
  blurb: string;
  collection: string;
  takeaway: string;
  source: string;
  steps: OdlStep[];
}
export interface UseCaseDefinition {
  id: string;
  number: string;
  name: string;
  short: string;
  heading: string;
  blurb: string;
  collection: string;
  source: string;
  icon: LessonIcon;
  /** Show the ODL level selector for this lesson. */
  levelOption?: boolean;
  build: (level?: OdlLevel) => OdlLesson;
}
