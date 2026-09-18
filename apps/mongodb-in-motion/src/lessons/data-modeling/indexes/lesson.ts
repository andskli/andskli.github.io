import { clone } from '../../../learning/snapshots.ts';
import { createModelingBuilder, practiceTray as tray } from '../builder.ts';
import {
  booksByPrice,
  compoundEntries,
  indexInitial,
  keyIdentity,
  multikeyEntries,
  resetCounts,
} from '../indexes/operations.ts';
import { modelingSources } from '../sources.ts';
import type { ModelingDefinition, ModelingLesson } from '../types.ts';
import { createInitialState } from './fixtures.ts';
export const metadata = {
  id: 'indexes',
  number: '06',
  name: 'Indexes & queries',
  short: 'Find less. Maintain more.',
  heading: 'Give a query a shorter path.',
  blurb:
    'Follow a collection scan, an ordered index, and the cost of keeping it current.',
  collection: 'shop.products',
  source: modelingSources.indexes,
};
export function build(): ModelingLesson {
  const { state, steps, add } = createModelingBuilder(createInitialState());

  const trays = [
    tray('products', 'products', '3 STORED DOCUMENTS', -4, 23),
    tray('index', 'query index', 'ORDERED KEYS + DOCUMENT LOCATORS', 12, 7.3, '#8b78ba'),
  ];
  state.indexView = indexInitial();
  const takeaway =
    'Index the actual filter and sort. A compound index orders keys by its field sequence; nested fields use dot notation, and arrays create multikey entries. Indexes add storage and write work. Use explain() and representative workloads to verify the tradeoff.';
  const query = `db.products.find({ "details.category": "books" })
  .sort({ price: 1 })`;
  add({
    id: 'start-from-a-filter-and-a-sort',
    title: 'Start from a filter and a sort',
    description:
      'The catalog requests books ordered by ascending price. It returns complete documents, including name and tags. The collection contains two books and one shirt; the default _id index does not support this filter and sort.',
    code: query,
    update: (state) => {
      state.focus = ['sketch', 'tee', 'book'];
      state.highlights = ['details', 'price'];
      state.query = 'category = books · price ascending';
      state.result = 'Expected order: Field notes 24 → Sketchbook 36';
    },
  });
  add({
    id: 'collection-scan',
    title: 'Scan the collection, then sort',
    description:
      'This illustrative collection scan checks all three documents, keeps the two books, and sorts those matches by price. A hint forces the scan for comparison; a real optimizer may also choose a scan for a tiny collection.',
    code:
      query +
      `
  .hint({ $natural: 1 })`,
    update: (state) => {
      const view = state.indexView!;
      resetCounts(view);
      view.operation = 'scan';
      view.visited = state.documents.map((d) => d.id);
      view.documentsChecked = 3;
      view.note =
        'COLLSCAN + sort, illustrated. Counts describe this model, not measured executionStats.';
      state.matches = ['book', 'sketch'];
      state.focus = state.matches;
      state.resultData = booksByPrice(state.documents);
      state.result = '3 documents checked → 2 books, sorted by price';
    },
  });
  add({
    id: 'build-an-ordered-compound-index',
    title: 'Build an ordered compound index',
    description:
      'Create { "details.category": 1, price: 1 }. The first key is a nested field reached with dot notation. Entries sort by category first and price second. The board shows logical keys and document labels, not physical B-tree pages.',
    code: `db.products.createIndex(
  { "details.category": 1, price: 1 },
  { name: "category_price" }
)`,
    update: (state) => {
      const view = state.indexView!;
      resetCounts(view);
      view.present = true;
      view.entries = compoundEntries(state.documents);
      view.operation = 'build';
      view.note =
        'Logical index keys. Arrows stand for document locators; stored documents do not move.';
      state.matches = null;
      state.focus = ['sketch', 'tee', 'book'];
      state.resultData = null;
      state.result = '3 ordered entries · document order is unchanged';
    },
  });
  add({
    id: 'indexed-read',
    title: 'Use the equality prefix and index order',
    description:
      'The index seeks to category books, where its two entries are already ordered by price. This query still fetches both documents because it returns fields outside the index. The model shows matching keys, not the exact keysExamined counter.',
    code:
      query +
      `
  .hint("category_price")`,
    update: (state) => {
      const view = state.indexView!;
      resetCounts(view);
      view.operation = 'seek';
      const matches = view.entries.filter((entry) => entry.values[0] === 'books');
      view.selectedKeys = matches.map(keyIdentity);
      view.matchingKeys = matches.length;
      view.documentsChecked = matches.length;
      view.visited = matches.map((entry) => entry.documentId);
      view.note =
        'IXSCAN → FETCH, illustrated; this index supplies the requested price order within books.';
      state.matches = view.visited;
      state.focus = view.visited;
      state.resultData = view.visited.map((id) =>
        clone(state.documents.find((d) => d.id === id)!.data),
      );
      state.result = '2 matching keys → 2 document fetches · no extra sort';
    },
  });
  add({
    id: 'an-indexed-value-changes-maintain-the-keys',
    title: 'An indexed value changes: maintain the keys',
    description:
      'Raise Field notes from 24 to 42. The document changes, and this index removes the old (books, 24) entry and inserts (books, 42). Its position changes after Sketchbook. The unchanged _id index is not part of these key-change counts.',
    code: `db.products.updateOne(
  { _id: 101 },
  { $set: { price: 42 } }
)
// category_price: remove (books, 24), add (books, 42).`,
    update: (state) => {
      const view = state.indexView!;
      resetCounts(view);
      state.documents.find((d) => d.id === 'book')!.data.price = 42;
      view.entries = compoundEntries(state.documents);
      view.selectedKeys = view.entries
        .filter((entry) => entry.documentId === 'book')
        .map(keyIdentity);
      view.operation = 'maintain';
      view.documentWrites = 1;
      view.removedKeys = 1;
      view.addedKeys = 1;
      view.note =
        'Illustrated secondary index: one old key removed, one new key added. It also occupies storage.';
      state.matches = null;
      state.focus = ['book'];
      state.highlights = ['price'];
      state.resultData = null;
      state.result = '1 document write + 1 key removed + 1 key added';
    },
  });
  add({
    id: 'arrays-create-multiple-index-entries',
    title: 'Arrays create multiple index entries',
    description:
      'Add a tags index. MongoDB makes it multikey automatically: each distinct tag within a document contributes an entry. Our three documents produce six entries. Querying design finds both books and returns each document once.',
    code: `db.products.createIndex({ tags: 1 }, { name: "tags_1" })
db.products.find({ tags: "design" })
  .sort({ _id: 1 })
  .hint("tags_1")
// category_price still exists; this board now shows tags_1.
// The _id sort is not supplied by this tags-only index.`,
    update: (state) => {
      const view = state.indexView!;
      resetCounts(view);
      view.name = 'tags_1';
      view.fields = ['tags'];
      view.entries = multikeyEntries(state.documents);
      view.operation = 'multikey';
      const matches = view.entries.filter((entry) => entry.values[0] === 'design');
      view.selectedKeys = matches.map(keyIdentity);
      view.visited = [...new Set(matches.map((entry) => entry.documentId))];
      view.matchingKeys = matches.length;
      view.documentsChecked = view.visited.length;
      view.note =
        'The additional tags index is shown. The compound and _id indexes still exist; new writes maintain affected indexes.';
      state.highlights = ['tags'];
      state.matches = view.visited;
      state.focus = view.visited;
      state.resultData = state.documents
        .filter((d) => view.visited.includes(d.id))
        .map((d) => clone(d.data))
        .sort((a, b) => Number(a._id) - Number(b._id));
      state.result = '6 tag entries across 3 documents · design matches 2';
    },
  });
  add({
    id: 'check-the-real-plan-and-the-tradeoff',
    title: 'Check the real plan and the tradeoff',
    description:
      'Field order matters: without the category equality, this compound index cannot provide a global price sort. Check the winning plan, documents examined, keys examined, and returned count with explain(). Index every useful query selectively, not every field.',
    code:
      query +
      `
  .explain("executionStats")

// Also test the different query shape:
db.products.find({}).sort({ price: 1 })
  .explain("executionStats")

// Compare on representative data; hints above were teaching aids.`,
    update: (state) => {
      const view = state.indexView!;
      resetCounts(view);
      view.operation = 'idle';
      view.note =
        'No real query plan is executed here. Validate plan selection, sort stages, and read/write costs in your own workload.';
      state.focus = [];
      state.matches = null;
      state.highlights = [];
      state.resultData = null;
      state.result = 'Index order, array growth, read benefit, write cost';
    },
  });
  return {
    ...metadata,
    trays,
    steps,
    takeaway,
    presentation: { worldWidth: 39, minHeight: 12.2 },
  };
}
export const lesson: ModelingDefinition = {
  ...metadata,
  icon: 'index',
  layout: 'practice',
  shortcuts: [
    { label: 'Collection scan', stepId: 'collection-scan' },
    { label: 'Compound index', stepId: 'indexed-read' },
  ],
  build,
};
