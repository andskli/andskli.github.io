import { clone } from '../../../learning/snapshots.ts';
import type {
  DataValue,
  DocumentData,
  IndexEntry,
  IndexView,
  ModelingDocument,
} from '../types.ts';
export function fieldAt(data: DocumentData, path: string): DataValue {
  let value: DataValue = data;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    value = value[key] ?? null;
  }
  return value;
}
export const compare = (a: DataValue, b: DataValue) =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a) < String(b)
      ? -1
      : String(a) > String(b)
        ? 1
        : 0;
export function sorted(entries: IndexEntry[]): IndexEntry[] {
  return entries.sort((a, b) => {
    for (let i = 0; i < a.values.length; i++) {
      const order = compare(a.values[i], b.values[i]);
      if (order) return order;
    }
    return a.documentId.localeCompare(b.documentId);
  });
}
export const keyIdentity = (entry: IndexEntry) =>
  entry.documentId + '|' + JSON.stringify(entry.values);
export function compoundEntries(documents: ModelingDocument[]): IndexEntry[] {
  return sorted(
    documents.map((d) => ({
      documentId: d.id,
      values: [fieldAt(d.data, 'details.category'), d.data.price],
    })),
  );
}
export function multikeyEntries(documents: ModelingDocument[]): IndexEntry[] {
  return sorted(
    documents.flatMap((d) =>
      [...new Set(d.data.tags as string[])].map((tag) => ({
        documentId: d.id,
        values: [tag],
      })),
    ),
  );
}
export function booksByPrice(documents: ModelingDocument[]): DocumentData[] {
  return documents
    .filter((d) => fieldAt(d.data, 'details.category') === 'books')
    .sort((a, b) => Number(a.data.price) - Number(b.data.price))
    .map((d) => clone(d.data));
}
export const indexInitial = (): IndexView => ({
  present: false,
  name: 'category_price',
  fields: ['details.category', 'price'],
  entries: [],
  selectedKeys: [],
  operation: 'idle',
  visited: [],
  matchingKeys: null,
  documentsChecked: null,
  documentWrites: null,
  removedKeys: 0,
  addedKeys: 0,
  note: 'The automatic _id index still exists. No index yet supports this category query.',
});
export const resetCounts = (view: IndexView) => {
  view.matchingKeys = null;
  view.documentsChecked = null;
  view.documentWrites = null;
  view.removedKeys = 0;
  view.addedKeys = 0;
  view.visited = [];
  view.selectedKeys = [];
};
