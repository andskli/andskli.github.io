import { doc, initial } from '../builder.ts';
import { product } from '../fixtures.ts';

export function createInitialState() {
  return initial([doc('book', 'Field notes', 'products', 'book', product, [0, 0])]);
}
