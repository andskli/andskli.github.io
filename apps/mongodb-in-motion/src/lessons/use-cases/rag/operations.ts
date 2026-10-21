import { clone } from '../../../learning/snapshots.ts';
import type {
  Chunk,
  EmbeddingMode,
  Hit,
  RagModel,
  RetrievalMode,
  SourceDoc,
} from './types.ts';

export const defaultMode: RetrievalMode = 'vector';
export const defaultEmbedding: EmbeddingMode = 'auto';
/** The Voyage AI model Atlas runs for Automated Embedding. */
export const AUTO_MODEL = 'voyage-4';
/** How many chunks the search returns and the prompt includes. */
export const LIMIT = 3;
export const NUM_CANDIDATES = 50;
/** The usual reciprocal rank fusion constant. */
export const RRF_K = 60;
export const PRODUCT = 'mobile';
export const QUESTION = 'My notes stopped syncing on my Android phone. Error E_SYNC_409.';
/**
 * Teaching embeddings with four readable dimensions: billing, sign-in, sync and mobile.
 * A real model returns hundreds of opaque dimensions, but cosine similarity works the same.
 */
export const DIMENSIONS = ['billing', 'sign-in', 'sync', 'mobile'] as const;
export const QUERY_VECTOR = [0.02, 0.08, 0.85, 0.52];

export const sourceDocs: SourceDoc[] = [
  {
    id: 'kb-101',
    title: 'Sync on mobile',
    kind: 'Article',
    product: 'mobile',
    version: 1,
  },
  {
    id: 'kb-205',
    title: 'Sync in the browser',
    kind: 'Article',
    product: 'web',
    version: 1,
  },
  { id: 'kb-310', title: 'Billing', kind: 'Article', product: 'account', version: 1 },
  { id: 'kb-412', title: 'Signing in', kind: 'Article', product: 'account', version: 1 },
  {
    id: 'tk-8812',
    title: 'E_SYNC_409 on Android',
    kind: 'Ticket',
    product: 'mobile',
    version: 1,
  },
];

/** Chunks in source order, each with the vector the embedding model would return. */
const CHUNKS: (Chunk & { embedding: number[] })[] = [
  {
    _id: 'kb-101#1',
    docId: 'kb-101',
    title: 'Sync on mobile',
    text: 'Notes not syncing on iOS or Android? Check that background refresh is on and that you are signed in.',
    product: 'mobile',
    updatedAt: '2026-09-02',
    embedding: [0.03, 0.2, 0.82, 0.55],
  },
  {
    _id: 'kb-101#2',
    docId: 'kb-101',
    title: 'Sync on mobile',
    text: 'To force a sync, pull down on the notes list. Large attachments sync on Wi-Fi only.',
    product: 'mobile',
    updatedAt: '2026-09-02',
    embedding: [0.02, 0.04, 0.88, 0.42],
  },
  {
    _id: 'kb-101#3',
    docId: 'kb-101',
    title: 'Sync on mobile',
    text: 'Edits made offline sync when the phone reconnects. If two devices change the same note, both versions are kept.',
    product: 'mobile',
    updatedAt: '2026-09-02',
    embedding: [0.02, 0.05, 0.75, 0.6],
  },
  {
    _id: 'kb-205#1',
    docId: 'kb-205',
    title: 'Sync in the browser',
    text: 'Sync stalls in the browser when third-party cookies are blocked. Allow cookies for the app and reload.',
    product: 'web',
    updatedAt: '2026-06-18',
    embedding: [0.02, 0.1, 0.86, 0.48],
  },
  {
    _id: 'kb-310#1',
    docId: 'kb-310',
    title: 'Billing',
    text: 'Update your payment card under Settings, then Billing. Invoices are emailed monthly.',
    product: 'account',
    updatedAt: '2026-03-11',
    embedding: [0.95, 0.25, 0.02, 0.05],
  },
  {
    _id: 'kb-412#1',
    docId: 'kb-412',
    title: 'Signing in',
    text: 'Reset your password from the sign-in screen. SSO users sign in through their company portal.',
    product: 'account',
    updatedAt: '2026-05-27',
    embedding: [0.1, 0.95, 0.1, 0.15],
  },
  {
    _id: 'tk-8812#1',
    docId: 'tk-8812',
    title: 'E_SYNC_409 on Android',
    text: 'Resolved: Android app 4.2 stopped syncing with error E_SYNC_409 after a conflict loop. Fixed in 4.2.1; ask the customer to update the app.',
    product: 'mobile',
    updatedAt: '2026-10-14',
    embedding: [0.08, 0.12, 0.5, 0.78],
  },
];

/** What kb-101#1 says after the support team revises it, and its new vector. */
export const REVISED = {
  _id: 'kb-101#1',
  text: 'Notes not syncing on iOS or Android? Update to the latest app version first, then check background refresh and that you are signed in.',
  updatedAt: '2026-10-20',
  embedding: [0.04, 0.18, 0.8, 0.6],
};

export function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}
/** Atlas Vector Search reports cosine similarity normalised to 0..1. */
export const vectorScore = (a: number[], b: number[]) =>
  Math.round(((1 + cosine(a, b)) / 2) * 10000) / 10000;

const STOP = new Set(['my', 'on', 'the', 'a', 'and', 'is', 'to', 'of', 'error']);
export const terms = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((word) => word.length > 1 && !STOP.has(word)),
  ),
];
/** A stand-in for BM25: how many of the question's terms each chunk contains. */
export function textMatches(question: string, chunk: Chunk) {
  const words = new Set(terms(chunk.text));
  return terms(question).filter((term) => words.has(term)).length;
}

export function createInitialModel(
  mode: RetrievalMode = defaultMode,
  embedding: EmbeddingMode = defaultEmbedding,
): RagModel {
  return {
    mode,
    embedding,
    managed: {},
    layers: {
      chunker: false,
      embedder: false,
      atlas: false,
      app: false,
      llm: false,
    },
    docs: clone(sourceDocs),
    pending: [],
    embedded: [],
    stored: [],
    indexes: [],
    question: null,
    queryVector: null,
    filter: null,
    hits: [],
    context: [],
    answer: null,
    refreshed: [],
    event: 'Ready',
  };
}

/** Split each source into passages small enough to embed and to quote. */
export function chunk(state: RagModel) {
  state.layers.chunker = true;
  state.pending = CHUNKS.map(({ embedding: _embedding, ...rest }) => clone(rest));
}

/** The embedding model turns each passage into a vector. */
export function embed(state: RagModel) {
  if (state.embedding === 'auto') throw new Error('Atlas embeds automatically');
  if (!state.pending.length) throw new Error('Chunk the sources before embedding them');
  state.layers.embedder = true;
  state.embedded = state.pending.map((pending) => ({
    ...pending,
    embedding: [...CHUNKS.find((source) => source._id === pending._id)!.embedding],
  }));
  state.pending = [];
}

/** One document per chunk: text and metadata, plus the vector when the app brings it. */
export function store(state: RagModel) {
  const ready = state.embedding === 'byo' ? state.embedded : state.pending;
  if (!ready.length)
    throw new Error(
      state.embedding === 'byo'
        ? 'Embed the chunks before storing them'
        : 'Chunk the sources before storing them',
    );
  state.layers.atlas = true;
  state.stored = ready;
  state.embedded = [];
  state.pending = [];
}

const vectorFor = (id: string) => [...CHUNKS.find((c) => c._id === id)!.embedding];

/** With autoEmbed, creating the index is what embeds the collection (initial sync). */
export function createIndexes(state: RagModel) {
  if (!state.stored.length) throw new Error('Store chunks before indexing them');
  if (state.embedding === 'auto') {
    state.indexes.push({
      name: 'chunks_vector',
      type: 'vectorSearch',
      fields: [`text (autoEmbed · ${AUTO_MODEL})`, 'product (filter)'],
    });
    for (const chunk of state.stored) state.managed[chunk._id] = vectorFor(chunk._id);
  } else
    state.indexes.push({
      name: 'chunks_vector',
      type: 'vectorSearch',
      fields: ['embedding (4 dims, cosine)', 'product (filter)'],
    });
  if (state.mode === 'hybrid')
    state.indexes.push({ name: 'chunks_text', type: 'search', fields: ['text'] });
}

/** The app embeds the question with the same model it used for the chunks. */
export function ask(state: RagModel) {
  state.layers.app = true;
  state.question = QUESTION;
  // With autoEmbed the app sends text; Atlas embeds it with the index's model.
  state.queryVector = state.embedding === 'byo' ? [...QUERY_VECTOR] : null;
}
/** The vector the search compares against: the app's, or the one Atlas made. */
const queryVectorOf = (state: RagModel) =>
  state.queryVector ??
  (state.embedding === 'auto' && state.question ? QUERY_VECTOR : null);
export const vectorOf = (state: RagModel, chunk: Chunk) =>
  chunk.embedding ?? state.managed[chunk._id];

/** Exact nearest neighbours by cosine; ANN returns the same top results at this size. */
export function vectorRank(state: RagModel, filter: Record<string, string> | null) {
  const query = queryVectorOf(state);
  if (!query) throw new Error('Ask a question before searching');
  return state.stored
    .filter((candidate) => !filter || candidate.product === filter.product)
    .map((candidate) => ({
      _id: candidate._id,
      vectorScore: vectorScore(query, vectorOf(state, candidate)),
    }))
    .sort((a, b) => b.vectorScore - a.vectorScore);
}

/** Plain `$vectorSearch` over every chunk. */
export function vectorSearch(state: RagModel) {
  state.filter = null;
  state.hits = vectorRank(state, null).slice(0, LIMIT);
}

/** Narrow the candidates to the user's product before ranking by similarity. */
export function filteredSearch(state: RagModel) {
  state.filter = { product: PRODUCT };
  state.hits = vectorRank(state, state.filter).slice(0, LIMIT);
}

/** Fuse filtered vector ranks with full-text ranks using reciprocal rank fusion. */
export function hybridSearch(state: RagModel) {
  state.filter = { product: PRODUCT };
  const vector = vectorRank(state, state.filter);
  const text = state.stored
    .filter((candidate) => candidate.product === PRODUCT)
    .map((candidate) => ({
      _id: candidate._id,
      matches: textMatches(state.question!, candidate),
    }))
    .filter((candidate) => candidate.matches > 0)
    .sort((a, b) => b.matches - a.matches);
  state.hits = vector
    .map((hit, index) => {
      const textIndex = text.findIndex((candidate) => candidate._id === hit._id);
      const fusedScore =
        1 / (RRF_K + index + 1) + (textIndex >= 0 ? 1 / (RRF_K + textIndex + 1) : 0);
      return {
        ...hit,
        textRank: textIndex >= 0 ? textIndex + 1 : undefined,
        fusedScore: Math.round(fusedScore * 100000) / 100000,
      } satisfies Hit;
    })
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, LIMIT);
}

export function refine(state: RagModel) {
  if (state.mode === 'filtered') filteredSearch(state);
  if (state.mode === 'hybrid') hybridSearch(state);
}

export const chunkById = (state: RagModel, id: string) =>
  state.stored.find((candidate) => candidate._id === id);

/** Put the retrieved passages in the prompt, each with an id the model can cite. */
export function augment(state: RagModel) {
  if (!state.hits.length) throw new Error('Retrieve context before prompting');
  state.layers.llm = true;
  state.context = state.hits.map((hit) => hit._id);
}

/** The answer depends on what was retrieved: the model can only ground on its context. */
export function generate(state: RagModel) {
  if (!state.context.length) throw new Error('Build the prompt before generating');
  const has = (id: string) => state.context.includes(id);
  if (has('tk-8812#1'))
    state.answer = {
      text: 'E_SYNC_409 is a known issue in Android app 4.2 and is fixed in 4.2.1. Update the app, then pull down on the notes list to force a sync.',
      citations: ['tk-8812#1', ...state.context.filter((id) => id === 'kb-101#2')],
    };
  else if (has('kb-205#1'))
    state.answer = {
      text: 'Check that background refresh is on and that you are signed in. If sync still stalls, allow third-party cookies and reload.',
      citations: state.context.filter((id) => id === 'kb-101#1' || id === 'kb-205#1'),
    };
  else
    state.answer = {
      text: 'Check that background refresh is on and that you are signed in, then pull down on the notes list to force a sync.',
      citations: state.context.filter((id) => id === 'kb-101#1' || id === 'kb-101#2'),
    };
}

/** A source article changed: re-embed only its affected chunk, in place. */
export function refresh(state: RagModel) {
  const doc = state.docs.find((candidate) => candidate.id === 'kb-101')!;
  doc.version++;
  const stored = chunkById(state, REVISED._id);
  if (!stored) throw new Error('Nothing stored to refresh');
  stored.text = REVISED.text;
  stored.updatedAt = REVISED.updatedAt;
  // The app re-embeds its own vector; with autoEmbed, Atlas resyncs the managed one.
  if (state.embedding === 'byo') stored.embedding = [...REVISED.embedding];
  else state.managed[REVISED._id] = [...REVISED.embedding];
  state.refreshed.push(REVISED._id);
}

/** Key order is the order the document reads in. */
export function chunkDocument(chunk: Chunk) {
  const { _id, docId, title, product, text, updatedAt, embedding } = chunk;
  return { _id, docId, title, product, text, updatedAt, embedding };
}
