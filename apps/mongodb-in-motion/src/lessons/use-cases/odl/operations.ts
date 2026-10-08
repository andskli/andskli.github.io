import { clone } from '../../../learning/snapshots.ts';
import type {
  ConsumerId,
  Customer,
  OdlLevel,
  OdlModel,
  SourceChange,
  SourceId,
} from '../types.ts';

export const CUSTOMER_ID = 1001;
export const defaultLevel: OdlLevel = 'enriched';

/**
 * Illustrative share of each source's load that a consumer causes while it still
 * queries that system directly. Real numbers depend entirely on the workload.
 */
export const READS: Record<ConsumerId, Record<SourceId, number>> = {
  app: { crm: 25, rdbms: 30, api: 20 },
  analytics: { crm: 5, rdbms: 45, api: 0 },
  ai: { crm: 10, rdbms: 10, api: 25 },
};
/** How stressed a system of record is, for colour. Thresholds are teaching values. */
export type LoadLevel = 'low' | 'mid' | 'high';
export const LOAD_MID = 20;
export const LOAD_HIGH = 50;
export const loadLevel = (load: number): LoadLevel =>
  load > LOAD_HIGH ? 'high' : load > LOAD_MID ? 'mid' : 'low';
export const loadWord: Record<LoadLevel, string> = {
  low: 'protected',
  mid: 'busy',
  high: 'overloaded',
};

/** Residual load once connected: reading a log, or one poll per interval. */
const CONNECTED_LOAD: Record<SourceId, number> = { crm: 3, rdbms: 3, api: 4 };

/** One change per source, each in the format that system actually speaks. */
export const changes: Record<SourceId, SourceChange> = {
  crm: {
    id: 1,
    source: 'crm',
    method: 'cdc',
    format: 'JSON',
    raw: `{
  "event": "customer.updated",
  "id": "C-1001",
  "changes": {
    "name": "Ada Lindqvist",
    "email": "ada@example.com",
    "segment": "Gold"
  }
}`,
    fields: { name: 'Ada Lindqvist', email: 'ada@example.com', segment: 'Gold' },
  },
  rdbms: {
    id: 2,
    source: 'rdbms',
    method: 'cdc',
    format: 'Change record',
    raw: `{
  "op": "u",
  "source": { "table": "ACCOUNTS", "scn": "8841207" },
  "before": { "PLAN": "BASIC", "BALANCE": 980.0 },
  "after": {
    "CUSTOMER_ID": 1001,
    "PLAN": "PREMIUM",
    "BALANCE": 1240.5
  }
}`,
    fields: { plan: 'Premium', balance: 1240.5 },
  },
  api: {
    id: 3,
    source: 'api',
    method: 'microBatch',
    format: 'XML',
    raw: `<Shipment>
  <CustomerRef>1001</CustomerRef>
  <Status>IN_TRANSIT</Status>
  <Eta>2026-10-12</Eta>
</Shipment>`,
    fields: { shipment: { status: 'In transit', eta: '2026-10-12' } },
  },
};

export function createInitialModel(level: OdlLevel = defaultLevel): OdlModel {
  const model: OdlModel = {
    level,
    layers: { cdc: false, batch: false, odl: false },
    sources: [
      {
        id: 'crm',
        name: 'CRM',
        detail: 'SaaS · JSON',
        method: 'cdc',
        latency: 'seconds',
        load: 0,
        captured: 0,
      },
      {
        id: 'rdbms',
        name: 'Legacy RDBMS',
        detail: 'Tables · redo log',
        method: 'cdc',
        latency: 'seconds',
        load: 0,
        captured: 0,
      },
      {
        id: 'api',
        name: 'Partner API',
        detail: 'REST · XML',
        method: 'microBatch',
        latency: 'up to 5 min',
        load: 0,
        captured: 0,
      },
    ],
    cdc: [],
    batch: [],
    batchRuns: 0,
    batchInterval: '5 min',
    landed: {},
    collections: {},
    customer: null,
    enriched: false,
    acceptsWrites: false,
    consumers: [
      {
        id: 'app',
        name: 'Operational app',
        detail: 'Customer 360',
        unlocked: false,
      },
      {
        id: 'analytics',
        name: 'Analytics',
        detail: 'Live dashboards',
        unlocked: false,
      },
      { id: 'ai', name: 'AI agent', detail: 'RAG on live data', unlocked: false },
    ],
    value: [],
    lastChange: null,
    integrations: 0,
    event: 'Ready',
  };
  model.integrations = model.sources.length * model.consumers.length;
  recomputeLoad(model);
  return model;
}

/** Load on each source: residual connection cost plus consumers that still query it. */
export function recomputeLoad(state: OdlModel) {
  for (const source of state.sources) {
    const connected = source.method === 'cdc' ? state.layers.cdc : state.layers.batch;
    source.load =
      (connected ? CONNECTED_LOAD[source.id] : 0) +
      state.consumers
        .filter((consumer) => !consumer.unlocked)
        .reduce((total, consumer) => total + READS[consumer.id][source.id], 0);
  }
}

/** Log-based CDC picks up committed changes from the CRM feed and the database log. */
export function connectCdc(state: OdlModel) {
  state.layers.cdc = true;
  state.layers.odl = true;
  state.cdc = [clone(changes.crm), clone(changes.rdbms)];
  for (const change of state.cdc)
    state.sources.find((source) => source.id === change.source)!.captured++;
  state.lastChange = clone(changes.rdbms);
  recomputeLoad(state);
}

/** A scheduled poll of the API: it can only report what changed since the last run. */
export function runMicroBatch(state: OdlModel) {
  state.layers.batch = true;
  state.batchRuns++;
  state.batch = [clone(changes.api)];
  state.sources.find((source) => source.id === 'api')!.captured++;
  state.lastChange = clone(changes.api);
  recomputeLoad(state);
}

const COLLECTION: Record<SourceId, string> = {
  crm: 'crm_customers',
  rdbms: 'rdbms_accounts',
  api: 'partner_shipments',
};
export const rawCollections = COLLECTION;

/** Connectors write each lane's changes to a per-source collection. */
export function landChanges(state: OdlModel) {
  for (const change of [...state.cdc, ...state.batch]) {
    state.landed[change.source] = change;
    state.collections[COLLECTION[change.source]] = 1;
  }
  state.cdc = [];
  state.batch = [];
  // With the hub live, consumers need one connection each, plus one per source.
  state.integrations = state.sources.length + state.consumers.length;
  recomputeLoad(state);
}

/** Key order is the order the document reads in. */
export function customerDocument(customer: Customer) {
  const keys: (keyof Customer)[] = [
    '_id',
    'name',
    'email',
    'segment',
    'plan',
    'balance',
    'shipment',
    'region',
    'churnRisk',
    'preferences',
    'embedding',
    'sources',
  ];
  const document: Record<string, unknown> = {};
  for (const key of keys) if (customer[key] !== undefined) document[key] = customer[key];
  return document;
}

/** Merge the three raw collections into one customer document. */
export function unify(state: OdlModel) {
  const customer: Customer = { _id: CUSTOMER_ID };
  for (const id of ['crm', 'rdbms', 'api'] as const)
    Object.assign(customer, clone(state.landed[id]?.fields ?? {}));
  state.customer = customer;
  state.collections.customers = 1;
}

/** Add context from reference data and provenance, without touching any source. */
export function enrich(state: OdlModel) {
  if (!state.customer) throw new Error('Unify the customer before enriching it');
  state.customer.region = 'Nordics';
  state.customer.churnRisk = 'low';
  state.customer.sources = { crm: 'T+2s', rdbms: 'T+1s', api: 'T+4m' };
  state.enriched = true;
}

export function enableWrites(state: OdlModel) {
  state.acceptsWrites = true;
}

/** An application writes straight to the ODL (read-write level only). */
export function writePreference(state: OdlModel) {
  if (!state.acceptsWrites) throw new Error('This ODL level is read-only');
  if (!state.customer) throw new Error('Unify the customer before writing to it');
  state.customer.preferences = { marketingOptIn: false };
}

/** Move a consumer from querying the sources to reading the ODL. */
export function unlock(state: OdlModel, id: ConsumerId, capability: string) {
  if (!state.customer) throw new Error('The ODL has no unified customer to serve yet');
  const consumer = state.consumers.find((candidate) => candidate.id === id)!;
  consumer.unlocked = true;
  if (id === 'ai') state.customer.embedding = [0.12, -0.04, 0.31];
  state.value.push(capability);
  recomputeLoad(state);
}
