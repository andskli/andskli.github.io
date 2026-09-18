import type { DataValue, DocumentData } from './types.ts';
export const product: DocumentData = {
  _id: 101,
  type: 'book',
  name: 'Field notes',
  price: 24,
  stock: 8,
  details: { author: 'A. Rivera', pages: 192 },
  tags: ['design', 'paper'],
};
export const items: DataValue[] = [
  { productId: 101, name: 'Field notes', unitPrice: 24, quantity: 2 },
  { productId: 102, name: 'Everyday tee', unitPrice: 30, quantity: 1 },
];
export const shipping: DocumentData = {
  street: '18 Birch Lane',
  city: 'Stockholm',
  postalCode: '114 24',
};
