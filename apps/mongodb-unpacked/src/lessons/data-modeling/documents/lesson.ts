import { clone } from '../../../learning/snapshots.ts';
import { createModelingBuilder, tray } from '../builder.ts';
import { product } from '../fixtures.ts';
import { formatData } from '../format-data.ts';
import { modelingSources } from '../sources.ts';
import type { ModelingDefinition, ModelingLesson } from '../types.ts';
import { createInitialState } from './fixtures.ts';
export const metadata = {
  id: 'documents',
  number: '01',
  name: 'Documents & fields',
  short: 'A shape for your data',
  heading: 'Start with a document.',
  blurb: 'Values, nested objects, and arrays live together in a BSON document.',
  collection: 'shop.products',
  source: modelingSources.documents,
};
export function build(): ModelingLesson {
  const { steps, add } = createModelingBuilder(createInitialState());

  const trays = [tray('products', 'products', 'COLLECTION · 1 DOCUMENT', 0, 0, 11, 7.2)];
  const takeaway =
    'A document is a unit of data and single-document atomicity. BSON supports typed values, nested objects, and arrays. Model its shape around the work your application does.';
  add({
    id: 'a-document-has-an-identity',
    title: 'A document has an identity',
    description:
      'This product is one BSON document in products. _id uniquely identifies it within the collection. This example uses an integer; a driver normally generates an ObjectId when _id is omitted.',
    code: `db.products.findOne({ _id: 101 })`,
    update: (state) => {
      state.focus = ['book'];
      state.highlights = ['_id'];
      state.query = 'findOne({ _id: 101 })';
      state.result = 'One document · one identity';
    },
  });
  add({
    id: 'fields-carry-typed-values',
    title: 'Fields carry typed values',
    description:
      'name is a string; price and stock are numeric values. The shell notation looks like JSON, but BSON also supports types such as ObjectId, dates, and Decimal128. Choose numeric types deliberately for money.',
    code: `// One document, shown in mongosh notation\n${formatData(product)}`,
    update: (state) => {
      state.highlights = ['name', 'price', 'stock'];
      state.result = 'Strings, numbers, and other BSON types';
    },
  });
  add({
    id: 'an-object-can-live-inside-a-document',
    title: 'An object can live inside a document',
    description:
      'details is an embedded object. Dot notation reaches its fields without moving them to another collection.',
    code: `db.products.find(
  { "details.pages": { $gte: 100 } },
  { name: 1, "details.author": 1 }
)`,
    update: (state) => {
      state.highlights = ['details'];
      state.query = '"details.pages" >= 100';
      state.result = 'details.author → "A. Rivera"';
      state.resultData = [
        { _id: product._id, name: product.name, details: { author: 'A. Rivera' } },
      ];
    },
  });
  add({
    id: 'arrays-hold-related-values',
    title: 'Arrays hold related values',
    description:
      'tags is an array inside this same document. An equality query on tags matches a document whose array contains that value.',
    code: `db.products.find({ tags: "design" })`,
    update: (state) => {
      state.highlights = ['tags'];
      state.query = 'find({ tags: "design" })';
      state.result = '1 matching document';
      state.matches = ['book'];
      state.resultData = [clone(product)];
    },
  });
  add({
    id: 'flexible-does-not-mean-without-rules',
    title: 'Flexible does not mean without rules',
    description:
      'You can evolve document shapes while enforcing chosen rules with schema validation. Here the collection requires _id, name, and a type discriminator; applications still define what each field means.',
    code: `// Apply to an existing products collection
db.runCommand({
  collMod: "products",
  validator: { $jsonSchema: {
    bsonType: "object",
    required: ["_id", "name", "type"],
    properties: {
      name: { bsonType: "string" },
      type: { enum: ["book", "apparel", "audio"] }
    }
  } }
})`,
    update: (state) => {
      state.highlights = ['_id', 'name', 'type'];
      state.query = '$jsonSchema';
      state.result = 'A flexible shape, with deliberate rules';
      state.matches = null;
      state.resultData = null;
    },
  });
  return {
    ...metadata,
    trays,
    steps,
    takeaway,
    presentation: { worldWidth: 25, minHeight: 10.6 },
  };
}
export const lesson: ModelingDefinition = { ...metadata, icon: 'document', build };
