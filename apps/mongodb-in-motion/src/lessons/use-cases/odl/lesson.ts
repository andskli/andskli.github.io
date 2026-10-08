import { createOdlBuilder, flow } from '../builder.ts';
import { useCaseSources } from '../sources.ts';
import type { OdlLesson, OdlLevel, UseCaseDefinition } from '../types.ts';
import {
  CUSTOMER_ID,
  connectCdc,
  createInitialModel,
  defaultLevel,
  enableWrites,
  enrich,
  landChanges,
  runMicroBatch,
  unify,
  unlock,
  writePreference,
} from './operations.ts';

const metadata = {
  id: 'odl',
  number: '01',
  name: 'Operational data layer',
  short: 'One layer, every system',
  heading: 'One layer. Every system.',
  blurb:
    'Bring siloed systems together, then serve apps, analytics and AI without touching the legacy systems.',
  collection: 'ops.customers',
  source: useCaseSources.odl,
};

export const levelNames: Record<OdlLevel, string> = {
  'read-only': 'Read-only',
  enriched: 'Enriched',
  'read-write': 'Read-write',
};

const appFlows = (writes: boolean) => [
  flow('odl', 'app', 'read', 'one read'),
  ...(writes ? [flow('app', 'odl', 'write', 'preferences')] : []),
];

export function build(level: OdlLevel = defaultLevel): OdlLesson {
  const { steps, add } = createOdlBuilder(createInitialModel(level));

  add({
    id: 'customer-data-lives-in-silos',
    title: 'Customer data lives in silos',
    description:
      'One customer is split across a SaaS CRM, a legacy relational database and a partner’s REST/XML API. Each has its own model, access method and owner, so no one can ask a single question about the whole customer.',
    code: `// "Show me customer 1001" today: three systems, three formats
await crm.get('/customers/C-1001')                  // JSON
await rdbms.query('SELECT * FROM ACCOUNTS WHERE CUSTOMER_ID = 1001')  // rows
await partner.get('/shipments?customer=1001')        // XML`,
    focus: ['crm', 'rdbms', 'api'],
  });

  add({
    id: 'point-to-point-does-not-scale',
    title: 'Point-to-point does not scale',
    description: (after) =>
      `Every app integrates with every system it needs: ${after.sources.length} sources × ${after.consumers.length} consumers is ${after.integrations} integrations, each with its own credentials, format and failure mode. Watch the colours: the legacy RDBMS is red, carrying the combined query load (${after.sources[1].load}%), and the other systems are amber. Every dashboard and agent adds more. A tenth source for ten apps would mean 100 integrations.`,
    code: `// Each consumer owns its own connection to each source
app       -> crm, rdbms, api
analytics -> crm, rdbms          // heavy reporting queries on the RDBMS
ai        -> crm, rdbms, api`,
    flows: (['crm', 'rdbms', 'api'] as const).flatMap((source) =>
      (['app', 'analytics', 'ai'] as const).map((consumer) =>
        flow(source, consumer, 'direct', 'direct query'),
      ),
    ),
    focus: ['rdbms'],
  });

  add({
    id: 'cdc-captures-changes',
    title: 'CDC streams the changes',
    description:
      'Change data capture reads the database’s transaction log instead of querying its tables. It sees every committed change in order, including deletes, and adds almost no load to the source. The CRM publishes a change feed the same way. Latency is seconds.',
    code: `// Log-based CDC connector for the relational database (illustrative)
{
  "name": "rdbms-cdc",
  "config": {
    "connector.class": "io.debezium.connector.oracle.OracleConnector",
    "table.include.list": "SALES.ACCOUNTS",
    "topic.prefix": "rdbms"
  }
}`,
    update: connectCdc,
    flows: [
      flow('rdbms', 'cdc', 'cdc', 'redo log'),
      flow('crm', 'cdc', 'cdc', 'change feed'),
    ],
  });

  add({
    id: 'micro-batch-polls-the-api',
    title: 'Micro-batch polls the API',
    description:
      'The partner API only offers REST and XML: no change feed and no log to read. A scheduled job polls it every few minutes with an updatedSince cursor, parses the XML, and keeps only what changed. It works anywhere, but freshness is bounded by the interval.',
    code: `// every 5 minutes
const since = await cursor.get('partner_shipments')
const xml = await partner.get('/shipments?updatedSince=' + since)
const changed = parseXml(xml).filter((s) => s.updated > since)
await cursor.set('partner_shipments', now())`,
    update: runMicroBatch,
    flows: [flow('api', 'batch', 'batch', 'GET /shipments?updatedSince')],
  });

  add({
    id: 'changes-land-in-the-odl',
    title: 'Changes land in MongoDB',
    description: (after) =>
      `Both lanes write into MongoDB, one collection per source, keyed by customer. JSON, relational rows and XML all fit the document model without a schema migration. The hub is live: ${after.integrations} integrations instead of ${after.sources.length * after.consumers.length}, and each source now answers only for its own pipeline.`,
    code: `# MongoDB Kafka sink connector (CDC lane)
connector.class=com.mongodb.kafka.connect.MongoSinkConnector
topics=crm.customers,rdbms.accounts
document.id.strategy=com.mongodb.kafka.connect.sink.processor.id.strategy.PartialValueStrategy
writemodel.strategy=com.mongodb.kafka.connect.sink.writemodel.strategy.ReplaceOneBusinessKeyStrategy

// micro-batch lane: upsert the changed shipments
db.partner_shipments.bulkWrite(changed.map((s) => ({
  replaceOne: { filter: { _id: s.customerId }, replacement: s, upsert: true }
})))`,
    update: landChanges,
    flows: [
      flow('cdc', 'odl', 'cdc', 'sink connector'),
      flow('batch', 'odl', 'batch', 'bulk upsert'),
    ],
  });

  add({
    id: 'one-customer-document',
    title: 'Merge into one customer',
    description:
      'An aggregation merges the three raw collections into a single customer document: CRM profile, account plan and balance, and shipment status side by side. This is the single view that no source system could provide.',
    code: `db.crm_customers.aggregate([
  { $lookup: { from: "rdbms_accounts", localField: "_id", foreignField: "_id", as: "acct" } },
  { $lookup: { from: "partner_shipments", localField: "_id", foreignField: "_id", as: "ship" } },
  { $project: {
      name: 1, email: 1, segment: 1,
      plan: { $first: "$acct.plan" }, balance: { $first: "$acct.balance" },
      shipment: { $first: "$ship.shipment" } } },
  { $merge: { into: "customers", whenMatched: "replace", whenNotMatched: "insert" } }
])`,
    update: unify,
    focus: ['odl'],
  });

  if (level === 'read-only')
    add({
      id: 'a-read-only-layer',
      title: 'A read-only layer',
      description:
        'At this level the ODL is a high-performance read replica: legacy systems stay the only place to write, so there is no risk of the two drifting apart. Consumers get a stable read model, and the sources are shielded from their queries.',
      code: `// Applications read the ODL and write to the system of record
db.customers.findOne({ _id: ${CUSTOMER_ID} })
await rdbms.query('UPDATE ACCOUNTS SET PLAN = ...')   // writes still go here`,
      update: (s) => {
        s.value.push('Stable read model over legacy data');
      },
      focus: ['odl'],
    });
  if (level === 'enriched')
    add({
      id: 'enrich-with-context',
      title: 'Enrich with context',
      description:
        'The enriched level adds what no source holds: a region from reference data, a derived churn indicator, and provenance showing how fresh each source’s contribution is. All of it is added in the ODL, so no upstream system changes.',
      code: `db.customers.updateOne({ _id: ${CUSTOMER_ID} }, { $set: {
  region: "Nordics",                      // from a reference dataset
  churnRisk: "low",                       // derived
  sources: { crm: "T+2s", rdbms: "T+1s", api: "T+4m" }
} })`,
      update: (s) => {
        enrich(s);
        s.value.push('Enriched context: region, risk, provenance');
      },
      focus: ['odl'],
    });
  if (level === 'read-write')
    add({
      id: 'the-odl-accepts-writes',
      title: 'The ODL accepts writes',
      description:
        'At the read-write level, applications can write to the ODL as part of business workflows, so new features stop depending on the legacy system. The cost is two places that hold the truth: keep them consistent with a transactional outbox or a saga, not distributed locks.',
      code: `// Write to the ODL and record the change for the legacy system in one transaction
const session = client.startSession()
await session.withTransaction(async () => {
  await db.customers.updateOne({ _id: ${CUSTOMER_ID} }, { $set: { preferences: { marketingOptIn: false } } }, { session })
  await db.outbox.insertOne({ customerId: ${CUSTOMER_ID}, change: "preferences" }, { session })
})`,
      update: (s) => {
        enableWrites(s);
        s.value.push('Gradual modernization: new features write to the ODL');
      },
      focus: ['odl'],
    });

  add({
    id: 'unlock-customer-360',
    title: 'Unlock: Customer 360 in one read',
    description: (after) =>
      `The operational app reads one document instead of calling three systems${level === 'read-write' ? ', and it can write preferences back' : ''}. The CRM turns green (${after.sources[0].load}%), but the RDBMS is still red (${after.sources[1].load}%): its heavy reporting queries have not moved yet.`,
    code: `db.customers.findOne({ _id: ${CUSTOMER_ID} })`,
    update: (s) => {
      unlock(s, 'app', 'Customer 360 for operational apps');
      if (level === 'read-write') writePreference(s);
    },
    flows: appFlows(level === 'read-write'),
  });

  add({
    id: 'unlock-real-time-analytics',
    title: 'Unlock: real-time analytics',
    description: (after) =>
      `Dashboards aggregate live operational data, steered to secondary members so they do not compete with app traffic. The reporting queries that were 45% of the RDBMS’s load are gone: it turns green at ${after.sources[1].load}%.`,
    code: `db.getMongo().setReadPref("secondaryPreferred")
db.customers.aggregate([
  { $group: { _id: "$plan", customers: { $sum: 1 }, balance: { $sum: "$balance" } } }
])`,
    update: (s) => unlock(s, 'analytics', 'Real-time analytics on live data'),
    flows: [flow('odl', 'analytics', 'read', 'aggregation')],
  });

  add({
    id: 'unlock-ai-agents',
    title: 'Unlock: AI grounded in live data',
    description:
      level === 'read-only'
        ? 'An AI agent retrieves customer context with vector search over the same documents, so answers use current data. With a read-only layer the context is the merged profile only.'
        : 'An AI agent retrieves customer context with vector search over the same documents, so answers use current data. The enriched region, risk and provenance give the model more to ground on.',
    code: `db.customers.aggregate([
  { $vectorSearch: {
      index: "customer_vector_index",
      path: "embedding",
      queryVector: embed("Which Premium customers have a delayed shipment?"),
      numCandidates: 100,
      limit: 5 } },
  { $project: { name: 1, plan: 1, shipment: 1 } }
])`,
    update: (s) => unlock(s, 'ai', 'AI agents grounded in live data'),
    flows: [flow('odl', 'ai', 'read', 'vector search')],
  });

  add({
    id: 'the-hub-replaces-the-mesh',
    title: 'The hub replaces the mesh',
    description: (after) =>
      `${after.integrations} integrations instead of ${after.sources.length * after.consumers.length}, and each new source or consumer adds one, not a row or a column. The systems of record went from red and amber to green (${after.sources.map((s) => s.load + '%').join(' / ')}). Freshness still follows ingestion: seconds for CDC, minutes for the batch job.`,
    code: `// Adding a fourth consumer now needs one connection, not one per source
db.customers.find({ segment: "Gold" })`,
    flows: [
      flow('odl', 'app', 'read', 'one read'),
      flow('odl', 'analytics', 'read', 'aggregation'),
      flow('odl', 'ai', 'read', 'vector search'),
    ],
    focus: ['odl'],
  });

  return {
    ...metadata,
    steps,
    takeaway:
      'An operational data layer does not replace your systems of record. It decouples consumers from them: ingest each source the way it allows (CDC where there is a log, micro-batch where there is only an API), merge into one model, and every app, dashboard or agent reads one place. Integrations fall from sources × consumers to sources + consumers, legacy load drops, and new use cases ship without touching the legacy systems.',
  };
}

export const lesson: UseCaseDefinition = {
  ...metadata,
  icon: 'workflow',
  levelOption: true,
  build,
};
