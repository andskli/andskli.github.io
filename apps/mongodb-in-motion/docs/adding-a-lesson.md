# Adding a lesson

Start with a question the learner should be able to answer, then choose the model:

- **Data modeling** uses documents, collection trays, relationships, query results, and optional workload/index displays.
- **Architecture** uses processes, replica-set state, routing metadata, and flows between nodes.

The models are deliberately separate. They share playback, step identity, and snapshot ownership, not one universal database simulator.

## Find the right example

| You want to illustrate                        | Start here                                   |
| --------------------------------------------- | -------------------------------------------- |
| Fields and nested data                        | `src/lessons/data-modeling/documents/`       |
| Related documents and read options            | `src/lessons/data-modeling/references/`      |
| Read/write tradeoffs                          | `src/lessons/data-modeling/access-patterns/` |
| Index behavior and comparison shortcuts       | `src/lessons/data-modeling/indexes/`         |
| Copies and acknowledgements                   | `src/lessons/architecture/replication/`      |
| An operation with a configurable read concern | `src/lessons/architecture/secondary-reads/`  |
| Routing metadata and per-node annotations     | `src/lessons/architecture/config-servers/`   |

Paths are relative to this app directory.

## Structure a data-modeling lesson

Create `src/lessons/data-modeling/your-topic/`. Keep example documents in `fixtures.ts`, the narrative in `lesson.ts`, and substantive data operations in `operations.ts` when they merit their own tests. Small scenarios do not need an operations file.

A fixture factory returns fresh state each time. Use the helpers in `builder.ts` so mutable fixture data is cloned:

```ts
// fixtures.ts
import { doc, initial } from '../builder.ts';

export function createInitialState() {
  return initial([
    doc(
      'product',
      'Notebook',
      'products',
      'book',
      { _id: 1, name: 'Notebook', price: 24 },
      [0, 0],
    ),
  ]);
}
```

The lesson module owns the labels, source, steps, layout, icon, and shortcuts:

```ts
// lesson.ts
import { createModelingBuilder, tray } from '../builder.ts';
import type { ModelingDefinition, ModelingLesson } from '../types.ts';
import { createInitialState } from './fixtures.ts';

const metadata = {
  id: 'product-price',
  number: '07',
  name: 'Update a price',
  short: 'Change one field',
  heading: 'A document can change.',
  blurb: 'Follow an update to one product.',
  collection: 'shop.products',
  source: 'https://www.mongodb.com/docs/manual/core/document/',
};

export function build(): ModelingLesson {
  const { steps, add } = createModelingBuilder(createInitialState());

  add({
    id: 'update-price',
    title: 'Update one field',
    description: 'The product keeps its identity while its price changes.',
    code: `db.products.updateOne(
  { _id: 1 },
  { $set: { price: 30 } }
)`,
    update: (state) => {
      state.documents[0].data.price = 30;
      state.focus = ['product'];
      state.highlights = ['price'];
      state.result = 'The price is now 30';
    },
  });

  return {
    ...metadata,
    steps,
    trays: [tray('products', 'products', '1 DOCUMENT', 0, 0, 11, 7.2)],
    takeaway: 'An update can change selected fields in one document.',
    presentation: { worldWidth: 25, minHeight: 10.6 },
  };
}

export const lesson: ModelingDefinition = {
  ...metadata,
  icon: 'document',
  build,
};
```

Keep step IDs stable when editing titles or inserting steps. Optional comparison buttons use `shortcuts: [{ label: 'Update price', stepId: 'update-price' }]` and `layout: 'practice'`; they never depend on a step's array position. The registry test rejects a shortcut pointing to a missing step.

`add()` captures independent before/after snapshots. Its update callback can mutate the builder's working state; never mutate returned snapshots, shared fixtures, or state inside the renderer. Keep sample query results separate from stored documents.

## Register it once

Import the lesson in `src/learning/lesson-registry.ts` and add it to `modelingLessons` using its ID as the key. Object order determines navigation order. Desktop navigation, mobile navigation, and accepted lesson IDs derive from that registry; no edits to `App.tsx` are needed.

For architecture lessons, register in `architectureLessons` instead. Each `ArchitectureDefinition` specifies `topologies`, so a sharding-only scenario does not appear under One server. `createArchitectureBuilder(topology)` provides the working state, step builder, entry node, and flow helper. Configure `readConcern: true` for the existing local/majority selector or `commandKind: 'notes'` for scenario notes.

A genuinely new interactive option may require a new typed definition field and its control. Do not encode new options in UI checks against a lesson ID.

## Describe the scene

- Documents and positions come from fixtures. Collection platforms come from `trays`.
- Steps provide focus, highlights, relationships, query results, and optional index/workload state.
- Modeling `presentation` supplies camera framing and an optional relationship caption. An index board is created when the initial state includes `indexView`.
- Architecture `annotations(model)` returns plain labels keyed by node ID. Derive values from state; the renderer should not know which lesson is playing.

Reuse existing document kinds and lesson icons where possible. For a new document kind, update `DocumentKind` in `types.ts`, its glyph in `scenes/documents/glyphs.ts`, its color in `scenes/documents/textures.ts`, and its inspector icon in `components/inspectors/document-icons.ts`. New navigation icons belong in `components/icons.ts` and the `LessonIcon` type. New geometry belongs under `scenes/documents/` or `scenes/cluster/`, never in lesson operations.

## Verify the behavior

Add `lesson.test.ts` beside the lesson. Test the MongoDB concept: which documents changed, what the query returned, what a majority can see, or which node owns a range. Assert rewind isolation and consistency boundaries when relevant. Use stable step IDs to find the transition you are testing rather than numeric offsets.

```sh
npm run format
npm run format:check
npm test
npm run build:site
```

`npm test` discovers nested tests. Shared tests also check every registered lesson, unique step IDs, shortcut destinations, and snapshot isolation. The architecture invariant test checks that flows only use nodes visible in the selected topology.

From the Zola repository root, run `make mongodb-in-motion`, then build or serve Zola. Check the new lesson at `/mongodb-in-motion/` on desktop and mobile: play/pause, previous/next, replay, keyboard controls, inspectors, code examples, and any new options.
