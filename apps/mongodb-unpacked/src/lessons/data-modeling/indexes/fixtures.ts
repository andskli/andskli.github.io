import { card, initial } from '../builder.ts';
const initialForPractice: typeof initial = (documents) => ({
  ...initial(documents),
  result: 'Select a card to look inside',
});
export function createInitialState() {
  return initialForPractice([
    card(
      'sketch',
      'Sketchbook',
      'products',
      'book',
      {
        _id: 104,
        name: 'Sketchbook',
        price: 36,
        details: { category: 'books', pages: 128 },
        tags: ['design', 'art'],
      },
      -12,
    ),
    card(
      'tee',
      'Everyday tee',
      'products',
      'apparel',
      {
        _id: 102,
        name: 'Everyday tee',
        price: 30,
        details: { category: 'clothing' },
        tags: ['cotton', 'casual'],
      },
      -4,
    ),
    card(
      'book',
      'Field notes',
      'products',
      'book',
      {
        _id: 101,
        name: 'Field notes',
        price: 24,
        details: { category: 'books', pages: 192 },
        tags: ['design', 'paper'],
      },
      4,
    ),
  ]);
}
