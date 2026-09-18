import { clone } from '../../../learning/snapshots.ts';
import { pageFrom } from '../access-patterns/operations.ts';
import { createModelingBuilder, practiceTray as tray } from '../builder.ts';
import { modelingSources } from '../sources.ts';
import type { DocumentData, ModelingDefinition, ModelingLesson } from '../types.ts';
import { createInitialState } from './fixtures.ts';
export const metadata = {
  id: 'access',
  number: '05',
  name: 'Access patterns',
  short: 'Design for reads and writes',
  heading: 'Start with the work.',
  blurb: 'A product page reads a few fields. Stock updates have a different rhythm.',
  collection: 'product page → shop',
  source: modelingSources.access,
};
export function build(): ModelingLesson {
  const { state, steps, add } = createModelingBuilder(createInitialState());

  const trays = [
    tray('page', 'product page', 'APPLICATION VIEW', -12, 7, '#718ec2'),
    tray('products', 'products', 'CATALOG FIELDS', -4, 7),
    tray('details', 'productDetails', 'ONE-TO-ONE DETAILS', 4, 7),
    tray('inventory', 'inventory', 'FREQUENT STOCK UPDATES', 12, 7, '#b4935f'),
  ];
  state.relationships = [
    { from: 'page', to: 'product', label: 'read product', active: false },
    { from: 'product', to: 'details', label: 'resolve details', active: false },
    { from: 'page', to: 'stock', label: 'read stock', active: false },
  ];
  state.workload = {
    reads: 0,
    writes: 0,
    phase: 'Define the workload',
    note: 'Read: title, price, author, availability · Write: stock changes frequently',
  };
  const takeaway =
    'Choose document boundaries from query shapes, read/write frequency, cardinality, and consistency needs. Keep bounded product details together; separate stock here because it changes independently. Fewer reads are useful, but they are not the only goal.';
  add({
    id: 'name-the-reads-and-writes-first',
    title: 'Name the reads and writes first',
    description:
      'The page needs title, price, author, and availability. Warehouse events update stock frequently; product descriptions change less often. These two workloads guide the boundaries.',
    code: `// Product-page read
{ title, price, author, available }

// Warehouse write
{ productId: 101, changeInAvailable: -1 }

// Design inputs: frequency, cardinality, consistency.`,
    update: (state) => {
      state.focus = ['page', 'stock'];
      state.highlights = ['name', 'price', 'author', 'available'];
      state.result = 'One page read · a separate stock-write workload';
    },
  });
  add({
    id: 'trace-the-current-page-read',
    title: 'Trace the current page read',
    description:
      'In this starting layout, the application reads products, follows detailsId to productDetails, and reads inventory. Three explicit reads assemble one screen. This count describes our example, not its latency.',
    code: `const product = db.products.findOne({ _id: 101 })
const details = db.productDetails.findOne({
  _id: product.detailsId
})
const inventory = db.inventory.findOne({ _id: 101 })
// Application renders the requested fields.`,
    update: (state) => {
      const [, p, d, i] = state.documents;
      state.documents[0].data = pageFrom(p.data, d.data, i.data);
      state.relationships.forEach((r) => (r.active = true));
      state.focus = ['page', 'product', 'details', 'stock'];
      state.workload = {
        reads: 3,
        writes: 0,
        phase: 'Starting layout',
        note: '3 explicit reads assemble the product page',
      };
      state.result = '3 reads → title, price, author, availability';
      state.resultData = clone(state.documents[0].data);
    },
  });
  add({
    id: 'bring-bounded-product-details-together',
    title: 'Bring bounded product details together',
    description:
      'Author credit and page count are bounded, product-specific details read with the book. The proposed layout embeds them in products. We show the completed design change; a real migration must coordinate readers, writers, and cleanup.',
    code: `// Proposed products document
{
  _id: 101, name: "Field notes", price: 24,
  details: { author: "A. Rivera", pages: 192 },
  internalNotes: "Supplier review in October"
}
// Retire the old one-to-one details document only
// after migrating its readers and writers.`,
    update: (state) => {
      const product = state.documents[1],
        details = state.documents[2];
      product.data.details = { author: details.data.author, pages: details.data.pages };
      delete product.data.detailsId;
      details.scale = 0;
      details.position = [-4, 0];
      state.relationships.forEach((r) => (r.active = false));
      state.highlights = ['details'];
      state.focus = ['product'];
      state.workload = {
        reads: 0,
        writes: 0,
        phase: 'Proposed layout',
        note: 'A design comparison; migration operations are not simulated',
      };
      state.result = 'Product-specific details now share one document';
      state.resultData = null;
    },
  });
  add({
    id: 'read-the-fields-the-screen-needs',
    title: 'Read the fields the screen needs',
    description:
      'The page now reads the product and inventory. Projection returns only the requested product fields; internalNotes and page count stay out of this response. Projection reduces returned data, but does not itself guarantee less disk work.',
    code: `const product = db.products.findOne(
  { _id: 101 },
  { name: 1, price: 1, "details.author": 1 }
)
const inventory = db.inventory.findOne(
  { _id: 101 }, { available: 1 }
)
// Two explicit reads; _id is included by default.`,
    update: (state) => {
      const product = state.documents[1],
        inventory = state.documents[3],
        details = product.data.details as DocumentData;
      state.documents[0].data = pageFrom(product.data, details, inventory.data);
      state.relationships.forEach((r) => (r.active = r.to !== 'details'));
      state.focus = ['page', 'product', 'stock'];
      state.highlights = ['name', 'price', 'details', 'available'];
      state.workload = {
        reads: 2,
        writes: 0,
        phase: 'Page-shaped read',
        note: '2 explicit reads · only requested fields returned',
      };
      state.result = 'Same page data · 3 reads become 2';
      state.resultData = {
        product: {
          _id: 101,
          name: product.data.name,
          price: product.data.price,
          details: { author: details.author },
        },
        inventory: { _id: 101, available: inventory.data.available },
      };
    },
  });
  add({
    id: 'let-stock-change-independently',
    title: 'Let stock change independently',
    description:
      'This warehouse event decrements only inventory.available. The product document is unchanged. The page still displays its previously returned value until it reads again. Separating stock is a workload choice, not a MongoDB requirement.',
    code: `db.inventory.updateOne(
  { _id: 101, available: { $gt: 0 } },
  { $inc: { available: -1 } }
)
// Product catalog data is unchanged.
// The already-rendered page still shows 8.`,
    update: (state) => {
      state.documents[3].data.available = 7;
      state.relationships.forEach((r) => (r.active = false));
      state.focus = ['stock'];
      state.highlights = ['available'];
      state.workload = {
        reads: 0,
        writes: 1,
        phase: 'Warehouse update',
        note: '1 inventory document write · the rendered page still shows 8',
      };
      state.result = 'Inventory: 7 · existing page response: 8';
      state.resultData = null;
    },
  });
  add({
    id: 'refresh-the-view-and-choose-consistency',
    title: 'Refresh the view and choose consistency',
    description:
      'A new inventory read updates availability to 7 on the page. These separate reads do not form one atomic snapshot of product and stock. If your workflow requires that guarantee, revisit the boundary or consider a transaction.',
    code: `const inventory = db.inventory.findOne(
  { _id: 101 }, { available: 1 }
)
// Application replaces the displayed availability.
// Product fields from the earlier read are reused.`,
    update: (state) => {
      state.documents[0].data.available = state.documents[3].data.available;
      state.relationships.forEach((r) => (r.active = r.to === 'stock'));
      state.focus = ['page', 'stock'];
      state.workload = {
        reads: 1,
        writes: 0,
        phase: 'Availability refresh',
        note: '1 fresh inventory read · product fields reused from the earlier response',
      };
      state.result = 'Page refreshed to 7 · consistency is deliberate';
      state.resultData = { _id: 101, available: 7 };
    },
  });
  add({
    id: 'let-the-workload-drive-the-next-decision',
    title: 'Let the workload drive the next decision',
    description:
      'A new screen, different update frequency, or growing array can change the best shape. Record your important filters, sorts, projections, and consistency needs. Then choose indexes for those queries and validate on representative data.',
    code: `// Product page: find by _id + projection
// Catalog browse: category filter + price sort
// Inventory: conditional update by _id

// Next lesson: index the catalog browse query.`,
    update: (state) => {
      state.relationships.forEach((r) => (r.active = false));
      state.highlights = [];
      state.focus = ['page', 'product', 'stock'];
      state.workload = {
        reads: 0,
        writes: 0,
        phase: 'Review the workload',
        note: 'Queries + update frequency + growth + consistency',
      };
      state.result = 'Model the work, then index the queries';
      state.resultData = null;
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
  icon: 'pointer',
  layout: 'practice',
  shortcuts: [
    { label: 'Page read', stepId: 'read-the-fields-the-screen-needs' },
    { label: 'Stock update', stepId: 'let-stock-change-independently' },
  ],
  build,
};
