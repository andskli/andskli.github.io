import type { DocumentData } from '../types.ts';
export function resolveCustomer(
  order: DocumentData,
  customers: DocumentData[],
): DocumentData | undefined {
  return customers.find((customer) => customer._id === order.customerId);
}
