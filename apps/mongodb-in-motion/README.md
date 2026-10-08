# MongoDB in Motion

A standalone 3D educational app explaining MongoDB from document design to distributed architecture. Six data-modeling lessons introduce BSON documents, polymorphism, embedding, references, access patterns, and indexes; eight architecture lessons explore processes, replica sets, routers, and shards; a Features section follows individual MongoDB capabilities, starting with change streams; a Use cases section shows how they combine, starting with an operational data layer.

## Run

Requires Node.js 22.18+ (Node.js 24 or newer recommended).

```sh
npm ci
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173/mongodb-in-motion/. The preview binds only to localhost.

```sh
npm test       # Behavioral model tests
npm run build # Type-check and create dist/
npm run preview -- --port 4173
```

Preview the production build at http://127.0.0.1:4173/mongodb-in-motion/.

## Zola integration

From the repository root, `make mongodb-in-motion` installs locked dependencies, checks formatting, runs tests, and builds into `static/mongodb-in-motion/` using `npm run build:site`. The shared `make apps` target includes this app; `make build`, `make serve`, and both GitHub Actions jobs use it before Zola. Generated output is ignored by Git; edit and commit the source here.

`vite.config.ts` sets the deployment base to `/mongodb-in-motion/`. The default `npm run build` still writes to `dist/`, which can be hosted under `/mongodb-in-motion/` on any static web server. No database or application backend is required. Serve it over HTTP rather than opening `index.html` as a file. The UI uses Google Fonts when available and system font fallbacks otherwise.

## Analytics

`index.html` includes the same GoatCounter page-view snippet as the blog, pointing to `andskli.goatcounter.com`. Zola does not apply its shared head template to this standalone HTML. Visits appear under `/mongodb-in-motion/`; lesson changes are in-page interactions and do not send additional events.

## Explore

- Use the permanent main navigation: **Data modeling**, **One server**, **Replica set**, **Sharded cluster**, **Features**, and **Use cases**. The sidebar and mobile lesson picker show lessons for the selected section. Returning to Data modeling remembers the last selected modeling lesson.
- Play, pause, rewind, step forward, change playback speed, or replay any lesson.
- Drag the scene to orbit; scroll to zoom. Use the fit-view button to return home.
- Select a process or use **Components** to inspect its role, locally applied documents, or routing metadata.
- Enable **Follow** to move the camera along the operation.
- Open **Code** to see the mongosh example or scenario notes.
- Keyboard shortcuts outside controls: Space plays/pauses, arrows step, Escape closes overlays.

## Data modeling lessons

The Data modeling section uses a shop example with document, book, apparel, audio, order, address, customer, application-page, and index visuals. Each lesson has its own 3D collection trays, highlighted document fields, playback stages, inspectable data, and mongosh examples for the current step.

1. **Documents & fields:** identity, typed BSON values, nested objects, arrays, and schema validation.
2. **Polymorphic documents:** related product variants in one collection, shared-field queries, type-specific queries, and intentional validation.
3. **Embed related data:** move checkout address input into an order, add a bounded array of purchased-item snapshots, and show an atomic update of status and shipping city.
4. **Reference documents:** two orders point to a shared customer ID. Switch between application reads and `$lookup`, inspect the returned data separately from stored documents, update a shared profile, and resolve it again.

5. **Access patterns:** compare a three-read product page with a layout that embeds bounded details and projects the requested fields. Show separate inventory writes, a stale rendered response, an explicit refresh, and the consistency tradeoff.
6. **Indexes & queries:** compare a forced collection scan with a compound index on a nested category field and price. Inspect ordered keys, follow locators to documents, update an indexed price, and explore the extra entries produced by a multikey tags index.

Select a document in 3D or use **Documents** in the header to read its full contents. **View result** opens the illustrated operation's output. The mobile lesson picker follows the active main-navigation section. Modeling lessons are independent of deployment topology.

## Architecture lessons

1. Write and replicate, including majority acknowledgement before the third member catches up.
2. Route a targeted query using a shard key.
3. Scatter a query across the collection's shards and gather results.
4. Elect a new primary after a failure; rejoin the old primary as a secondary.
5. Compare secondary reads with `local` and `majority` read concern.
6. Split an aggregation, compute partial sums, and merge a result.
7. Explore config-server replication, routing metadata, caching, and the balancer coordinator.
8. Copy a data range, commit its new ownership, refresh the router, and clean up donor copies.

## Feature lessons

Features are capability-focused lessons with their own model and scene, separate from the document and cluster models.

1. **Change streams:** a producer writes to a primary, each write becomes an oplog entry, and a stream cursor turns matching entries into change events for a consumer. The **Event** panel shows each event exactly as the server would send it (`_id` resume token, `operationType`, `fullDocument`, `updateDescription`). Two selectors change the lesson: `fullDocument` (`default` reports only the update delta; `updateLookup` adds the current document) and the stream pipeline (none, `$match` inserts, or `$match` on `fullDocument.status`). The steps cover inserts, update deltas, deletes, server-side filtering, processing then saving the resume token, a consumer that falls behind, a crash and `resumeAfter` replay, an outage that outlasts the capped oplog (`ChangeStreamHistoryLost`, code 286), and restarting with a resync.

## Use case lessons

Use cases combine features into an outcome, with their own model and scene.

1. **Operational data layer:** one customer is split across a CRM (JSON change feed), a legacy relational database (log-based CDC) and a partner REST/XML API (no change feed, so a micro-batch poll every few minutes). The lesson shows the point-to-point mesh first, then captures each source the way it allows, lands the changes in per-source collections, merges them into one customer document, and unlocks three downstream consumers one at a time: a Customer 360 operational app, real-time analytics, and an AI agent using vector search. The **Value** panel shows the latest change in its native format (relational change record, JSON, or XML), the resulting ODL document, the capabilities unlocked so far, the integration count (3 × 3 = 9 point-to-point, 3 + 3 = 6 through the hub), and the legacy RDBMS load as consumers move off it. Load is also shown as colour: each source system's base pad, label and direct-query lines go green (protected, up to 20%), amber (busy, up to 50%) or red (overloaded), and the pad pulses while it is red, so the lesson shows the ODL shielding the systems of record. The **ODL level** selector follows the Atlas Architecture Center levels: _read-only_ (a read replica), _enriched_ (adds reference data, a derived indicator and provenance), and _read-write_ (accepts writes, with the outbox/saga caveat).

## Source structure

The app separates lesson content, deterministic model operations, playback, React UI, and Three.js rendering. Start with [Adding a lesson](docs/adding-a-lesson.md) for a complete example and the extension workflow.

```text
src/
  app/                  Application shell and the four domain players
  learning/             Lesson registry, step contracts, playback, keyboard controls
  lessons/
    architecture/       Eight scenarios, topology helpers, model types and fixtures
    data-modeling/      Six scenarios, document types and shared fixture helpers
      indexes/          lesson.ts, fixtures.ts, operations.ts, lesson.test.ts
    features/           Capability lessons, model types, step builder and sources
      change-streams/   lesson.ts, operations.ts (oplog, stream, resume), lesson.test.ts
    use-cases/          Use-case lessons, model types, step builder and sources
      odl/              lesson.ts, operations.ts (CDC, micro-batch, merge, unlock), lesson.test.ts
  components/
    navigation/         Main sections, sidebar, mobile picker
    playback/           Timeline, transport and scenario comparison controls
    inspectors/         Components, documents, query results, indexes, change events and ODL value
  scenes/
    cluster/            Cluster renderer, procedural objects, layout and palette
    documents/          Document renderer, glyph catalog and canvas textures
    features/           Change-stream renderer: oplog rail, cursor and token markers
    use-cases/          ODL renderer: sources, ingestion lanes, the layer and consumers
    shared/             Canvas lifecycle and resource disposal
  styles/               Formatted styles grouped by responsibility
```

- A lesson owns its narrative, sample data, operations, options, source links, scene annotations, and named steps. Metadata lives beside the lesson, and the registry supplies navigation.
- Builders capture isolated before/after snapshots. Rendering projects state without changing the model. The shared playback reducer owns time, play/pause, seeking, speed, and replay; domain models remain separate.
- Comparison buttons reference stable step IDs, so changing step order does not redirect a button to a different operation.
- Tests live beside the behavior they verify. Registry and playback tests live in `learning/`. Type checking rejects unused local variables/imports.
- Prettier keeps TypeScript, JSX, CSS, JSON, HTML, and Markdown readable. Run `npm run format` after editing; `npm run format:check` is included in the site build.
- CSS import order in `styles/index.css` preserves the shared styles and responsive overrides. Keep that order when moving rules.

```sh
npm run format       # Apply the repository's app formatting
npm run format:check # Check formatting without changing files
npm test             # Discover all nested behavioral tests
```

## Refactor validation

The refactor retained all 16 original behavioral tests and added tests for playback transitions, named-step shortcuts, registry contracts, and state-derived annotations. All 44 supported lesson/option combinations were also compared with the original implementation: narration, commands, initial state, every before/after snapshot, and flow instructions were unchanged.

## Fidelity boundaries

This is an independent educational simulation. It does not run MongoDB binaries, accept arbitrary queries, implement the wire protocol, or reproduce all distributed-systems edge cases. Network and election timing is illustrative. Moving markers represent logical operations rather than measured bytes.

Data-modeling lessons use fixed illustrative operations, not a query engine or live validation. The access-pattern redesign is a completed design comparison, not an automatic migration. The index board shows logical keys and document labels, not physical B-tree pages or storage addresses. Index counts are illustrative; matching keys are not claimed to equal totalKeysExamined. Hints force teaching comparisons, while actual optimizer choices and timings require explain() on representative data. The default _id index remains present; the tags lesson adds an index without dropping the compound index. Canvas cards abbreviate longer values; inspectors show the complete modeled documents. References use integer IDs for readability, and the lookup lesson shows result arrays without mutating stored orders. Draft checkout input is not counted as a stored document. Embedding examples are bounded and discuss the 16 MiB document limit, historical snapshots, and manual-reference consistency.

The change-stream lesson uses a deterministic model of a single replica-set primary and one consumer; it does not run a real change stream. Oplog positions (`#101`) are teaching counters, not real cluster timestamps, and resume tokens are fixed-width stand-ins rather than the server's encoded keys. Events omit fields such as `wallTime`. The oplog is capped at seven entries so that rollover is visible; real oplogs are sized in gigabytes and retention depends on write volume. A resume succeeds in the model when the token's position is still retained. After a drained batch the consumer saves the stream's position, as drivers do with `postBatchResumeToken`. Majority-commit visibility, failover, sharded `mongos` merging, invalidate events, and pre/post-images are described but not animated.

The operational-data-layer lesson is a deterministic model, not a running pipeline. It does not execute connectors, Kafka, or SQL; the source change records, XML and code snippets are illustrative, and the Debezium and MongoDB Kafka sink settings are examples rather than a tested configuration. The sources are generic stand-ins (a SaaS CRM, a relational database, a partner API), not specific products. Latency labels ("seconds", "up to 5 min") and the load percentages are illustrative: real load depends on the workload, and each consumer's share of a source's load is a fixed teaching number, and the colour thresholds (20% and 50%) are teaching values, not operational guidance. The integration count assumes every consumer needs every source, which is the worst case for a point-to-point design. One customer is used throughout, so the lesson does not show conflict resolution between sources, schema drift, deletes, or backfill of history. The read-write level mentions the transactional outbox but does not animate the write-back to legacy systems.

Each depicted replica set has three voting, data-bearing members. Config servers use the dedicated-config-server topology. Reads use primary preference unless the secondary-read lesson is selected. The secondary-read example freezes a transient state: a member has locally applied v2 while its majority-committed view remains at v1. Majority read concern does not imply the latest value or a vote on each query.

The aggregation example uses a small `$match`/`$group` pipeline with `allowDiskUse: false`; it merges on mongos. Other pipelines, options, and execution plans can put the merger on a shard. Migration omits concurrent writes, detailed critical-section mechanics, and cleanup scheduling. It distinguishes copied data from committed ownership and final cleanup.

## Sources and inspiration

- [Compound indexes](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-compound/)
- [Multikey indexes](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-multikey/)
- [explain()](https://www.mongodb.com/docs/manual/reference/method/cursor.explain/)

- [BSON documents](https://www.mongodb.com/docs/manual/core/document/)
- [Polymorphic schema pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/polymorphic-data/polymorphic-schema-pattern/)
- [Embedding versus references](https://www.mongodb.com/docs/manual/data-modeling/concepts/embedding-vs-references/)
- [Referenced relationships](https://www.mongodb.com/docs/manual/tutorial/model-referenced-one-to-many-relationships-between-documents/)
- [$lookup](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/)
- [Schema validation](https://www.mongodb.com/docs/manual/core/schema-validation/)

- [Change streams](https://www.mongodb.com/docs/manual/changeStreams/)
- [Change events](https://www.mongodb.com/docs/manual/reference/change-events/)
- [The oplog](https://www.mongodb.com/docs/manual/core/replica-set-oplog/)

- [Operational data layer reference architecture](https://www.mongodb.com/docs/atlas/architecture/current/deployment-paradigms/reference-architectures/data-layer/)
- [Implementing an operational data layer](https://www.mongodb.com/resources/solutions/use-cases/implementing-an-operational-data-layer)
- [MongoDB Kafka Connector](https://www.mongodb.com/docs/kafka-connector/current/)
- [Atlas Stream Processing](https://www.mongodb.com/docs/atlas/atlas-stream-processing/)
- [Atlas Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)
- [Read preference](https://www.mongodb.com/docs/manual/core/read-preference/)

- [MongoDB replication](https://www.mongodb.com/docs/manual/replication/)
- [MongoDB sharding](https://www.mongodb.com/docs/manual/sharding/)
- [Config servers](https://www.mongodb.com/docs/manual/core/sharded-cluster-config-servers/)
- [Majority read concern](https://www.mongodb.com/docs/manual/reference/read-concern-majority/)
- [Sharded aggregation pipelines](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-sharded-collections/)
- Visual-explainer inspiration: [Redis City by poltora.dev](https://poltora.dev/redis). The code and geometry here were built independently.

MongoDB and its marks belong to MongoDB, Inc. This app is not an official MongoDB product.
