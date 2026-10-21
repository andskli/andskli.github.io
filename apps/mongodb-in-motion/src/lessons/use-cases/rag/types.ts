import type { UseCaseFlow, UseCaseLesson, UseCaseStep } from '../types.ts';

/**
 * How the lesson retrieves context: semantic search only, semantic search scoped by a
 * metadata pre-filter, or filtered semantic search fused with full-text search.
 */
export type RetrievalMode = 'vector' | 'filtered' | 'hybrid';
/**
 * Who makes the vectors: the app calls a model and stores them in the document
 * ("bring your own"), or an autoEmbed index has Atlas generate and sync them with Voyage AI.
 */
export type EmbeddingMode = 'auto' | 'byo';
export interface RagOptions {
  retrieval?: RetrievalMode;
  embedding?: EmbeddingMode;
}
/** Everything the RAG scene draws. */
export type RagPart = 'sources' | 'chunker' | 'embedder' | 'atlas' | 'app' | 'llm';
export type RagFlowKind =
  'ingest' | 'embed' | 'write' | 'query' | 'retrieve' | 'generate';
export type RagFlow = UseCaseFlow<RagPart, RagFlowKind>;

/** A source document in the support knowledge base, before it is chunked. */
export interface SourceDoc {
  id: string;
  title: string;
  kind: 'Article' | 'Ticket';
  product: 'mobile' | 'web' | 'account';
  version: number;
}
/** One retrievable passage. Text, metadata and vector live in the same document. */
export interface Chunk {
  _id: string;
  docId: string;
  title: string;
  text: string;
  product: SourceDoc['product'];
  updatedAt: string;
  /** Teaching-sized: real models return hundreds or thousands of dimensions. */
  embedding?: number[];
}
/** A retrieved chunk and why it ranked where it did. */
export interface Hit {
  _id: string;
  /** Atlas cosine score, normalised to 0..1: (1 + cosine) / 2. */
  vectorScore: number;
  /** 1-based rank in the full-text results, when hybrid search is used. */
  textRank?: number;
  /** Reciprocal rank fusion score, when hybrid search is used. */
  fusedScore?: number;
}
export interface RagModel {
  mode: RetrievalMode;
  embedding: EmbeddingMode;
  /**
   * Automated Embedding keeps vectors in a system-managed collection, not in the
   * document. Keyed by chunk id; empty when the app brings its own vectors.
   */
  managed: Record<string, number[]>;
  /** Parts introduced so far. Sources are always present. */
  layers: Record<Exclude<RagPart, 'sources'>, boolean>;
  docs: SourceDoc[];
  /** Chunks split from the sources and not yet embedded. */
  pending: Chunk[];
  /** Chunks embedded and waiting to be written. */
  embedded: Chunk[];
  /** The `knowledge.chunks` collection. */
  stored: Chunk[];
  indexes: { name: string; type: 'vectorSearch' | 'search'; fields: string[] }[];
  question: string | null;
  queryVector: number[] | null;
  /** The pre-filter applied to the vector search, if any. */
  filter: Record<string, string> | null;
  hits: Hit[];
  /** Chunks sent to the LLM as context. */
  context: string[];
  answer: { text: string; citations: string[] } | null;
  /** Chunks re-embedded because their source changed. */
  refreshed: string[];
  event: string;
}
export type RagStep = UseCaseStep<RagModel, RagPart, RagFlow>;
export type RagLesson = UseCaseLesson<RagStep>;
