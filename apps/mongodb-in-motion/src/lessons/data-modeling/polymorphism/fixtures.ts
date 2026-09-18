import { doc, initial } from '../builder.ts';
import { product } from '../fixtures.ts';

export function createInitialState() {
  return initial([
    doc('book', 'Field notes', 'products', 'book', product, [-8, 0]),
    doc(
      'tee',
      'Everyday tee',
      'products',
      'apparel',
      {
        _id: 102,
        type: 'apparel',
        name: 'Everyday tee',
        price: 30,
        stock: 12,
        size: 'M',
        material: 'cotton',
      },
      [0, 0],
    ),
    doc(
      'audio',
      'Studio headphones',
      'products',
      'audio',
      {
        _id: 103,
        type: 'audio',
        name: 'Studio headphones',
        price: 120,
        stock: 0,
        wireless: true,
        batteryHours: 30,
      },
      [8, 0],
    ),
  ]);
}
