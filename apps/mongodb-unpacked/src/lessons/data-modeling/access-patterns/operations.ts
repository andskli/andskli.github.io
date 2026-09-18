import type { DocumentData } from '../types.ts';
export function pageFrom(
  product: DocumentData,
  details: DocumentData,
  inventory: DocumentData,
): DocumentData {
  return {
    title: product.name,
    price: product.price,
    author: details.author,
    available: inventory.available,
  };
}
