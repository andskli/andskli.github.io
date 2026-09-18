import { doc, initial } from '../builder.ts';

export function createInitialState() {
  return initial([
    doc(
      'order1',
      'Order #7001',
      'orders',
      'order',
      { _id: 7001, customerId: 7, total: 78 },
      [-9, 0],
    ),
    doc(
      'order2',
      'Order #7002',
      'orders',
      'order',
      { _id: 7002, customerId: 7, total: 24 },
      [-2, 0],
    ),
    doc(
      'customer',
      'Maya Chen',
      'customers',
      'customer',
      { _id: 7, name: 'Maya Chen', email: 'maya@example.com', tier: 'member' },
      [9, 0],
    ),
  ]);
}
