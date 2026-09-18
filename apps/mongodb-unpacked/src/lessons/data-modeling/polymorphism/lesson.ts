import { clone } from '../../../learning/snapshots.ts';
import { createModelingBuilder, tray } from '../builder.ts';
import { modelingSources } from '../sources.ts';
import type { DocumentData, ModelingDefinition, ModelingLesson } from '../types.ts';
import { createInitialState } from './fixtures.ts';
export const metadata = {
  id: 'polymorphism',
  number: '02',
  name: 'Polymorphic documents',
  short: 'One collection, many shapes',
  heading: 'Shared fields. Different shapes.',
  blurb: 'A book, a shirt, and headphones can belong to the same product catalog.',
  collection: 'shop.products',
  source: modelingSources.polymorphism,
};
export function build(): ModelingLesson {
  const { steps, add } = createModelingBuilder(createInitialState());

  const trays = [
    tray('products', 'products', 'ONE COLLECTION · 3 DOCUMENT SHAPES', 0, 0, 26, 7.2),
  ];
  const takeaway =
    'Polymorphism stores related variants in one collection. Shared fields support common queries; a type field and variant-specific fields keep their differences explicit. Validation can enforce the shapes you choose.';
  add({
    id: 'different-products-share-one-collection',
    title: 'Different products share one collection',
    description:
      'These are three documents in products. They share _id, type, name, price, and stock, so the catalog can treat them together.',
    code: `db.products.find({}, { name: 1, type: 1, price: 1 })`,
    update: (state) => {
      state.focus = ['book', 'tee', 'audio'];
      state.highlights = ['_id', 'type', 'name', 'price', 'stock'];
      state.result = '3 products · one collection';
    },
  });
  add({
    id: 'each-type-keeps-its-own-fields',
    title: 'Each type keeps its own fields',
    description:
      'The book has details.pages, the shirt has size and material, and the headphones have wireless and batteryHours. Each variant omits fields that do not apply. The type discriminator is an application convention.',
    code: `// Three variants, each with its own fields
{ type: "book", details: { author: "A. Rivera", pages: 192 } }
{ type: "apparel", size: "M", material: "cotton" }
{ type: "audio", wireless: true, batteryHours: 30 }`,
    update: (state) => {
      state.highlights = [
        'type',
        'details',
        'size',
        'material',
        'wireless',
        'batteryHours',
      ];
      state.result = 'Distinct fields · no placeholder columns';
    },
  });
  add({
    id: 'query-a-field-the-shapes-share',
    title: 'Query a field the shapes share',
    description:
      'The same stock filter works across all product types. The book and shirt match. The headphones remain stored but do not appear in this result.',
    code: `db.products.find(
  { stock: { $gt: 0 } },
  { name: 1, type: 1, stock: 1 }
)`,
    update: (state) => {
      const found = state.documents.filter((d) => Number(d.data.stock) > 0);
      state.matches = found.map((d) => d.id);
      state.highlights = ['stock'];
      state.focus = state.matches;
      state.query = 'stock > 0';
      state.result = `${found.length} matching products`;
      state.resultData = found.map((d) => ({
        _id: d.data._id,
        name: d.data.name,
        type: d.data.type,
        stock: d.data.stock,
      }));
    },
  });
  add({
    id: 'query-the-fields-of-one-variant',
    title: 'Query the fields of one variant',
    description:
      'Combine type with a nested book field to ask for books of at least 100 pages. Other product shapes do not need a pages field to coexist in the collection.',
    code: `db.products.find({
  type: "book",
  "details.pages": { $gte: 100 }
})`,
    update: (state) => {
      const found = state.documents.filter(
        (d) =>
          d.data.type === 'book' &&
          Number((d.data.details as DocumentData)?.pages) >= 100,
      );
      state.matches = found.map((d) => d.id);
      state.focus = state.matches;
      state.highlights = ['type', 'details'];
      state.query = 'type: book · pages >= 100';
      state.result = `${found.length} matching book`;
      state.resultData = found.map((d) => clone(d.data));
    },
  });
  add({
    id: 'give-the-variants-an-intentional-contract',
    title: 'Give the variants an intentional contract',
    description:
      'A single collection is useful when these entities are queried together. Schema validation can require shared fields and use oneOf for type-specific rules. Documents that serve unrelated workloads need not share a collection.',
    code: `// A validator fragment for the book variant
{
  required: ["type", "details"],
  properties: {
    type: { enum: ["book"] },
    details: {
      bsonType: "object",
      required: ["author", "pages"]
    }
  }
}`,
    update: (state) => {
      state.matches = null;
      state.focus = ['book', 'tee', 'audio'];
      state.highlights = ['type'];
      state.query = '';
      state.result = 'Shared contract + intentional variation';
      state.resultData = null;
    },
  });
  return {
    ...metadata,
    trays,
    steps,
    takeaway,
    presentation: { worldWidth: 31, minHeight: 10.6 },
  };
}
export const lesson: ModelingDefinition = { ...metadata, icon: 'shapes', build };
