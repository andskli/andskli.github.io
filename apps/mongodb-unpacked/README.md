# MongoDB Unpacked

A standalone 3D educational app explaining MongoDB from document design to distributed architecture. Six data-modeling lessons introduce BSON documents, polymorphism, embedding, references, access patterns, and indexes; eight architecture lessons explore processes, replica sets, routers, and shards.

## Run

Requires Node.js 22.18+ (Node.js 24 or newer recommended).

```sh
npm ci
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173/mongodb-unpacked/. The preview binds only to localhost.

```sh
npm test       # Behavioral model tests
npm run build # Type-check and create dist/
npm run preview -- --port 4173
```

Preview the production build at http://127.0.0.1:4173/mongodb-unpacked/.

## Zola integration

From the repository root, `make mongodb-unpacked` installs locked dependencies, checks formatting, runs tests, and builds into `static/mongodb-unpacked/` using `npm run build:site`. The shared `make apps` target includes this app; `make build`, `make serve`, and both GitHub Actions jobs use it before Zola. Generated output is ignored by Git; edit and commit the source here.

`vite.config.ts` sets the deployment base to `/mongodb-unpacked/`. The default `npm run build` still writes to `dist/`, which can be hosted under `/mongodb-unpacked/` on any static web server. No database or application backend is required. Serve it over HTTP rather than opening `index.html` as a file. The UI uses Google Fonts when available and system font fallbacks otherwise.

## Analytics

`index.html` includes the same GoatCounter page-view snippet as the blog, pointing to `andskli.goatcounter.com`. Zola does not apply its shared head template to this standalone HTML. Visits appear under `/mongodb-unpacked/`; lesson changes are in-page interactions and do not send additional events.

## Explore

- Use the permanent main navigation: **Data modeling**, **One server**, **Replica set**, and **Sharded cluster**. The sidebar and mobile lesson picker show lessons for the selected section. Returning to Data modeling remembers the last selected modeling lesson.
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

## Source structure

The app separates lesson content, deterministic model operations, playback, React UI, and Three.js rendering. Start with [Adding a lesson](docs/adding-a-lesson.md) for a complete example and the extension workflow.

```text
src/
  app/                  Application shell and the two domain players
  learning/             Lesson registry, step contracts, playback, keyboard controls
  lessons/
    architecture/       Eight scenarios, topology helpers, model types and fixtures
    data-modeling/      Six scenarios, document types and shared fixture helpers
      indexes/          lesson.ts, fixtures.ts, operations.ts, lesson.test.ts
  components/
    navigation/         Main sections, sidebar, mobile picker
    playback/           Timeline, transport and scenario comparison controls
    inspectors/         Components, documents, query results and indexes
  scenes/
    cluster/            Cluster renderer, procedural objects, layout and palette
    documents/          Document renderer, glyph catalog and canvas textures
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

- [MongoDB replication](https://www.mongodb.com/docs/manual/replication/)
- [MongoDB sharding](https://www.mongodb.com/docs/manual/sharding/)
- [Config servers](https://www.mongodb.com/docs/manual/core/sharded-cluster-config-servers/)
- [Majority read concern](https://www.mongodb.com/docs/manual/reference/read-concern-majority/)
- [Sharded aggregation pipelines](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-sharded-collections/)
- Visual-explainer inspiration: [Redis City by poltora.dev](https://poltora.dev/redis). The code and geometry here were built independently.

MongoDB and its marks belong to MongoDB, Inc. This app is not an official MongoDB product.
