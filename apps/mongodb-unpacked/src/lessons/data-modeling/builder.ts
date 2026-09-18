import { clone } from '../../learning/snapshots.ts';
import type {
  CollectionTray,
  DocumentData,
  DocumentKind,
  ModelingDocument,
  ModelingState,
  ModelingStep,
} from './types.ts';
export function doc(
  id: string,
  title: string,
  collection: string,
  kind: DocumentKind,
  data: DocumentData,
  position: [number, number],
  storage: ModelingDocument['storage'] = 'document',
): ModelingDocument {
  return { id, title, collection, kind, data: clone(data), position, scale: 1, storage };
}
export function initial(documents: ModelingDocument[]): ModelingState {
  return {
    documents,
    focus: [],
    highlights: [],
    matches: null,
    relationships: [],
    query: '',
    result: 'Select a document to look inside',
    resultData: null,
  };
}
export const card = (
  id: string,
  title: string,
  collection: string,
  kind: ModelingDocument['kind'],
  data: DocumentData,
  x: number,
  storage: ModelingDocument['storage'] = 'document',
): ModelingDocument => ({
  id,
  title,
  collection,
  kind,
  data: clone(data),
  position: [x, 0],
  scale: 1,
  storage,
});
export const tray = (
  id: string,
  label: string,
  detail: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  color = '#4c9a76',
): CollectionTray => ({ id, label, detail, x, z, width, depth, color });
export const practiceTray = (
  id: string,
  label: string,
  detail: string,
  x: number,
  width: number,
  color = '#4c9a76',
) => tray(id, label, detail, x, 0, width, 7.2, color);
/**
 * Mutate the working state in each update; keep the resulting snapshots untouched.
 * Playback can then seek in either direction without replaying earlier mutations.
 */
export function createModelingBuilder(state: ModelingState) {
  const steps: ModelingStep[] = [];
  function add({
    id,
    title,
    description,
    code,
    update,
  }: {
    id: string;
    title: string;
    description: string;
    code: string;
    update: (state: ModelingState) => void;
  }) {
    const before = clone(state);
    update(state);
    steps.push({ id, title, description, code, before, after: clone(state) });
  }
  return { state, steps, add };
}
