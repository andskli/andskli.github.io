import { clone } from '../../../learning/snapshots.ts';
import { createModelingBuilder, tray } from '../builder.ts';
import { resolveCustomer } from '../references/operations.ts';
import { modelingSources } from '../sources.ts';
import type { ModelingDefinition, ModelingLesson, ReferenceMode } from '../types.ts';
import { createInitialState } from './fixtures.ts';
export const metadata = {
  id: 'references',
  number: '04',
  name: 'Reference documents',
  short: 'Connect through an ID',
  heading: 'Separate documents, connected.',
  blurb: 'Two orders point to one customer. Follow the ID to bring the data together.',
  collection: 'orders + customers',
  source: modelingSources.references,
};
export function build(mode: ReferenceMode = 'application'): ModelingLesson {
  const { state, steps, add } = createModelingBuilder(createInitialState());

  const trays = [
    tray('orders', 'orders', '2 DOCUMENTS', -5.5, 0, 15.5, 7.2),
    tray('customers', 'customers', '1 SHARED DOCUMENT', 9, 0, 8, 7.2),
  ];
  state.relationships = [
    { from: 'order1', to: 'customer', label: 'customerId → _id', active: false },
    { from: 'order2', to: 'customer', label: 'customerId → _id', active: false },
  ];
  const takeaway =
    'A manual reference is a stored ID. Resolve it with an application query or $lookup. Shared data can change in one document, but references are not automatic foreign keys: your application must handle missing targets and consistency.';
  add({
    id: 'two-orders-reference-one-customer',
    title: 'Two orders reference one customer',
    description:
      'Each order stores customerId: 7. The customer profile lives once, in customers with _id: 7. Matching value and BSON type identify the relationship; an ID can also be an ObjectId or string.',
    code: `// orders
{ _id: 7001, customerId: 7, total: 78 }
{ _id: 7002, customerId: 7, total: 24 }

// customers
{ _id: 7, name: "Maya Chen", tier: "member" }`,
    update: (state) => {
      state.focus = ['order1', 'order2', 'customer'];
      state.highlights = ['customerId', '_id'];
      state.result = '2 references · 1 customer profile';
    },
  });
  add({
    id: 'reading-an-order-returns-the-id',
    title: 'Reading an order returns the ID',
    description:
      'findOne on orders returns customerId, not the customer profile. A reference is a value in the document, not an automatically loaded object.',
    code: `const order = db.orders.findOne({ _id: 7001 })
// order.customerId === 7
// Customer fields are not included yet.`,
    update: (state) => {
      state.focus = ['order1'];
      state.highlights = ['customerId'];
      state.query = 'orders.findOne({ _id: 7001 })';
      state.result = 'Returned: customerId = 7';
      state.resultData = clone(state.documents[0].data);
    },
  });
  if (mode === 'application') {
    add({
      id: 'resolve-the-id-with-a-second-read',
      title: 'Resolve the ID with a second read',
      description:
        'The application takes customerId from the order and explicitly queries customers._id. These are separate reads; they do not automatically share one snapshot.',
      code: `const order = db.orders.findOne({ _id: 7001 })
const customer = db.customers.findOne({
  _id: order.customerId
})`,
      update: (state) => {
        state.relationships[0].active = true;
        state.focus = ['order1', 'customer'];
        state.highlights = ['customerId', '_id', 'name'];
        state.query = 'customers.findOne({ _id: 7 })';
        const found = resolveCustomer(state.documents[0].data, [state.documents[2].data]);
        state.result = 'Resolved customer: ' + found?.name;
        state.resultData = found ? clone(found) : null;
      },
    });
  } else {
    add({
      id: 'join-explicitly-with-lookup',
      title: 'Join explicitly with $lookup',
      description:
        '$lookup matches customerId to _id and puts matches in a customer array in the aggregation result. It does not embed the profile into the stored order.',
      code: `db.orders.aggregate([
  { $match: { _id: 7001 } },
  { $lookup: {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer"
  } }
])`,
      update: (state) => {
        state.relationships[0].active = true;
        state.focus = ['order1', 'customer'];
        state.highlights = ['customerId', '_id', 'name'];
        state.query = '$lookup: customerId → _id';
        const found = resolveCustomer(state.documents[0].data, [state.documents[2].data]);
        state.result = 'Result includes customer: [ { … } ]';
        state.resultData = {
          ...clone(state.documents[0].data),
          customer: found ? [clone(found)] : [],
        };
      },
    });
  }
  add({
    id: 'a-shared-profile-changes-in-one-place',
    title: 'A shared profile changes in one place',
    description:
      'Update the customer tier to gold. Both stored orders still contain only customerId: 7. A subsequent resolved read can see the new tier; an already returned result does not update itself.',
    code: `db.customers.updateOne(
  { _id: 7 }, { $set: { tier: "gold" } }
)
// Resolve again to read the changed profile.`,
    update: (state) => {
      state.documents[2].data.tier = 'gold';
      state.relationships.forEach((r) => (r.active = false));
      state.focus = ['customer'];
      state.highlights = ['tier'];
      state.query = 'customers.updateOne({ _id: 7 }, …)';
      state.result = 'Customer tier: gold · order IDs unchanged';
      state.resultData = null;
    },
  });
  add({
    id: 'read-the-relationship-again',
    title: 'Read the relationship again',
    description:
      'Resolve the customer for each order again. The same customer document supplies the updated tier to both results, without copying profile fields into either stored order.',
    code:
      mode === 'lookup'
        ? `db.orders.aggregate([
  { $lookup: {
      from: "customers", localField: "customerId",
      foreignField: "_id", as: "customer"
  } }
])`
        : `// For these two illustrative orders
const orders = db.orders.find({ customerId: 7 }).toArray()
const customer = db.customers.findOne({ _id: 7 })
orders.map(order => ({ ...order, customer }))`,
    update: (state) => {
      state.relationships.forEach((r) => (r.active = true));
      state.focus = ['order1', 'order2', 'customer'];
      state.highlights = ['customerId', 'tier'];
      state.query =
        mode === 'lookup'
          ? '$lookup → refreshed results'
          : 'resolve again → refreshed profile';
      state.result = 'Both orders resolve to the gold-tier customer';
      state.resultData = state.documents.slice(0, 2).map((d) => {
        const customer = resolveCustomer(d.data, [state.documents[2].data]);
        return {
          ...clone(d.data),
          customer:
            mode === 'lookup'
              ? customer
                ? [clone(customer)]
                : []
              : customer
                ? clone(customer)
                : null,
        };
      });
    },
  });
  add({
    id: 'references-need-a-consistency-policy',
    title: 'References need a consistency policy',
    description:
      'MongoDB does not enforce this manual reference like a foreign key. If customer 7 is removed, these orders can still hold 7. Handle a missing result, coordinate writes, or use a transaction when multi-document atomicity is required.',
    code: `// If a referenced customer is missing:
// findOne returns null
// $lookup returns customer: []

// Choose a deletion and consistency policy in your app.`,
    update: (state) => {
      state.relationships.forEach((r) => (r.active = false));
      state.focus = ['order1', 'order2'];
      state.highlights = ['customerId'];
      state.query = '';
      state.result = 'An ID is a link, not an integrity constraint';
      state.resultData = null;
    },
  });
  return {
    ...metadata,
    trays,
    steps,
    takeaway,
    presentation: {
      worldWidth: 34,
      minHeight: 11.5,
      relationshipCaption: 'customerId → _id',
    },
  };
}
export const lesson: ModelingDefinition = {
  ...metadata,
  icon: 'reference',
  layout: 'reference',
  referenceResolution: true,
  build,
};
