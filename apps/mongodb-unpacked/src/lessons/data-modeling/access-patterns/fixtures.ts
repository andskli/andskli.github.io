import { card, initial } from '../builder.ts';
const initialForPractice: typeof initial = (documents) => ({
  ...initial(documents),
  result: 'Select a card to look inside',
});
export function createInitialState() {
  return initialForPractice([
    card(
      'page',
      'Product page',
      'application',
      'page',
      { title: 'Waiting for data', price: null, author: null, available: null },
      -12,
      'view',
    ),
    card(
      'product',
      'Field notes',
      'products',
      'book',
      {
        _id: 101,
        name: 'Field notes',
        price: 24,
        detailsId: 501,
        internalNotes: 'Supplier review in October',
      },
      -4,
    ),
    card(
      'details',
      'Book details',
      'productDetails',
      'document',
      { _id: 501, author: 'A. Rivera', pages: 192 },
      4,
    ),
    card(
      'stock',
      'Stock #101',
      'inventory',
      'document',
      { _id: 101, available: 8, reserved: 0 },
      12,
    ),
  ]);
}
