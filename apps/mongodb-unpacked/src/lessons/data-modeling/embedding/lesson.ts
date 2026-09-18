import { clone } from '../../../learning/snapshots.ts';
import { createModelingBuilder, tray } from '../builder.ts';
import { items, shipping } from '../fixtures.ts';
import { formatData } from '../format-data.ts';
import { modelingSources } from '../sources.ts';
import type { DocumentData, ModelingDefinition, ModelingLesson } from '../types.ts';
import { createInitialState } from './fixtures.ts';
export const metadata = {
  id: 'embedding',
  number: '03',
  name: 'Embed related data',
  short: 'Keep what belongs together',
  heading: 'One order. Its details inside.',
  blurb:
    'Model a checkout read with the shipping address and purchased items in one document.',
  collection: 'shop.orders',
  source: modelingSources.embedding,
};
export function build(): ModelingLesson {
  const { state, steps, add } = createModelingBuilder(createInitialState());

  const trays = [
    tray('orders', 'orders', 'ONE ORDER DOCUMENT', -4, 0, 9, 7.2),
    tray(
      'draft',
      'checkout input',
      'ADDRESS · NOT YET STORED',
      6,
      0,
      7.2,
      7.2,
      '#b4935f',
    ),
  ];
  const takeaway =
    'Embed bounded data that is read together and belongs to the parent. An order can preserve its purchased-item and shipping snapshots, and update related fields atomically in one document. Avoid unbounded arrays; the document limit is 16 MiB.';
  add({
    id: 'start-with-the-checkout-read',
    title: 'Start with the checkout read',
    description:
      'The application needs an order and its shipping address together. The address on the right is checkout input, not a separate stored address document.',
    code: `// Existing order\n${formatData(state.documents[0].data)}\n\n// Address supplied at checkout\n${formatData(shipping)}`,
    update: (state) => {
      state.focus = ['order', 'address'];
      state.result = 'One stored order + draft address input';
    },
  });
  add({
    id: 'embed-the-address-into-the-order',
    title: 'Embed the address into the order',
    description:
      'Store shipping as a nested object in the order. The address becomes part of the same BSON document; there is no reference to follow for this field.',
    code: `db.orders.updateOne(\n  { _id: 7001 },\n  { $set: { shipping: ${formatData(shipping, 2)} } }\n)`,
    update: (state) => {
      state.documents[0].data.shipping = clone(shipping);
      state.documents[1].position = [-4, 0];
      state.documents[1].scale = 0;
      state.focus = ['order'];
      state.highlights = ['shipping'];
      state.query = '$set: { shipping: { … } }';
      state.result = 'Address nested inside order #7001';
    },
  });
  add({
    id: 'an-array-holds-the-purchased-items',
    title: 'An array holds the purchased items',
    description:
      'A bounded items array stores the name, price paid, and quantity at checkout. These are historical snapshots: a later catalog price change should not rewrite this purchase.',
    code: `db.orders.updateOne(\n  { _id: 7001 },\n  { $set: { items: ${formatData(items, 2)} } }\n)`,
    update: (state) => {
      state.documents[0].data.items = clone(items);
      state.highlights = ['items'];
      state.query = '$set: { items: [ … ] }';
      state.result = '2 purchased items · one order document';
    },
  });
  add({
    id: 'read-it-together-update-it-atomically',
    title: 'Read it together, update it atomically',
    description:
      'findOne returns the order with its embedded details. A single update can change status and shipping.city atomically: both changes to this document succeed together.',
    code: `db.orders.findOne({ _id: 7001 })

db.orders.updateOne(
  { _id: 7001 },
  { $set: {
      status: "confirmed",
      "shipping.city": "Uppsala"
  } }
)

db.orders.findOne({ _id: 7001 })`,
    update: (state) => {
      state.documents[0].data.status = 'confirmed';
      (state.documents[0].data.shipping as DocumentData).city = 'Uppsala';
      state.highlights = ['status', 'shipping'];
      state.query = 'one updateOne · one document';
      state.result = 'status + shipping.city change together';
      state.resultData = clone(state.documents[0].data);
    },
  });
  add({
    id: 'keep-the-boundary-deliberate',
    title: 'Keep the boundary deliberate',
    description:
      'An order has a bounded set of purchased items. An ever-growing customer history or a shared customer profile often belongs in separate documents. All fields and arrays count toward the 16 MiB BSON document limit.',
    code: `// Keep an order snapshot bounded.
// Shared, independently changing data can be referenced.
// Next lesson: orders.customerId → customers._id`,
    update: (state) => {
      state.highlights = ['shipping', 'items'];
      state.query = '';
      state.result = 'Read together · bounded growth · shared lifecycle';
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
export const lesson: ModelingDefinition = { ...metadata, icon: 'embed', build };
