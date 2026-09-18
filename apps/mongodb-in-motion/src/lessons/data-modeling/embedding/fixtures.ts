import { doc, initial } from '../builder.ts';
import { shipping } from '../fixtures.ts';

export function createInitialState() {
  return initial([
    doc(
      'order',
      'Order #7001',
      'orders',
      'order',
      { _id: 7001, status: 'draft' },
      [-4, 0],
    ),
    doc(
      'address',
      'Shipping address',
      'draft input',
      'address',
      shipping,
      [6, 0],
      'draft',
    ),
  ]);
}
