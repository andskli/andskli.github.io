import type { Doc } from './types.ts';
export const docsA: Doc[] = [
  { _id: 101, tenantId: 42, item: 'Field notes', amount: 40, status: 'open' },
  { _id: 102, tenantId: 420, item: 'Studio lamp', amount: 60, status: 'open' },
  { _id: 103, tenantId: 730, item: 'Coffee cup', amount: 30, status: 'closed' },
];
export const docsB: Doc[] = [
  { _id: 104, tenantId: 1420, item: 'Canvas tote', amount: 25, status: 'open' },
  { _id: 105, tenantId: 1742, item: 'Desk mat', amount: 50, status: 'open' },
  { _id: 106, tenantId: 1830, item: 'Pencil set', amount: 20, status: 'closed' },
];
export const newDoc: Doc = {
  _id: 107,
  tenantId: 42,
  item: 'Desk plant',
  amount: 35,
  status: 'open',
};
