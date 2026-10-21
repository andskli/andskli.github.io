import { createStepBuilder } from '../builder.ts';
import { useCaseSources } from '../sources.ts';
import type { UseCaseDefinition } from '../types.ts';
import {
  AUTO_MODEL,
  LIMIT,
  NUM_CANDIDATES,
  PRODUCT,
  QUESTION,
  RRF_K,
  ask,
  augment,
  chunk,
  createIndexes,
  createInitialModel,
  defaultEmbedding,
  defaultMode,
  embed,
  generate,
  refine,
  refresh,
  store,
  vectorSearch,
} from './operations.ts';
import type {
  EmbeddingMode,
  RagFlow,
  RagFlowKind,
  RagLesson,
  RagModel,
  RagOptions,
  RagPart,
  RetrievalMode,
} from './types.ts';

const metadata = {
  id: 'rag',
  number: '02',
  name: 'RAG and semantic search',
  short: 'Ground answers in your data',
  heading: 'Retrieve. Augment. Generate.',
  blurb:
    'Keep text, metadata and vectors with your data, let Voyage AI embed it inside Atlas, and retrieve by meaning to ground an LLM.',
  collection: 'knowledge.chunks',
  source: useCaseSources.rag,
};

export const modeNames: Record<RetrievalMode, string> = {
  vector: 'Semantic only',
  filtered: 'Semantic + pre-filter',
  hybrid: 'Hybrid (+ full-text)',
};
export const modeNotes: Record<RetrievalMode, string> = {
  vector: 'Nearest by meaning, any product',
  filtered: 'Only the user’s product',
  hybrid: 'Filtered vectors fused with full-text ranks',
};
export const embeddingNames: Record<EmbeddingMode, string> = {
  auto: 'Automated (Voyage AI)',
  byo: 'Bring your own',
};
export const embeddingNotes: Record<EmbeddingMode, string> = {
  auto: 'Atlas embeds on write and at query time',
  byo: 'The app calls a model and stores vectors',
};

const flow = (from: RagPart, to: RagPart, kind: RagFlowKind, label: string): RagFlow => ({
  from,
  to,
  kind,
  label,
});
const hitList = (state: RagModel) => state.hits.map((hit) => hit._id).join(', ');
/** Each input feeds fusion a deeper list than the final top-k. */
const FUSION_DEPTH = 20;

export function build({
  retrieval: mode = defaultMode,
  embedding = defaultEmbedding,
}: RagOptions = {}): RagLesson {
  const auto = embedding === 'auto';
  const { steps, add } = createStepBuilder<RagModel, RagPart, RagFlow>(
    createInitialModel(mode, embedding),
  );
  /** With autoEmbed the stage takes the question as text; otherwise the app's vector. */
  const vectorStage = (filter: boolean, limit = LIMIT) => `{ $vectorSearch: {
      index: "chunks_vector",
      path: "${auto ? 'text' : 'embedding'}",
      ${auto ? 'query: question,                 // Atlas embeds it with ' + AUTO_MODEL : 'queryVector: await embed(question),'}
      numCandidates: ${NUM_CANDIDATES},
      limit: ${limit},${filter ? `\n      filter: { product: "${PRODUCT}" },` : ''}
  } }`;

  add({
    id: 'knowledge-lives-in-documents',
    title: 'Answers live in your documents',
    description:
      'A support team has help articles and resolved tickets. A general-purpose LLM has never seen them, so it cannot know that error E_SYNC_409 was fixed last week. Retrieval-augmented generation (RAG) finds the relevant passages and gives them to the model with the question.',
    code: `// The knowledge base the assistant should answer from
kb-101   Sync on mobile          (article)
kb-205   Sync in the browser     (article)
kb-310   Billing                 (article)
kb-412   Signing in              (article)
tk-8812  E_SYNC_409 on Android   (resolved ticket)`,
    focus: ['sources'],
  });

  add({
    id: 'split-into-chunks',
    title: 'Split into chunks',
    description: (after) =>
      `Whole articles are too long to embed well and too long to quote. A chunker splits them into ${after.pending.length} passages of a few sentences each, and each passage keeps metadata from its source: the document id, title and product.`,
    code: `const chunks = docs.flatMap((doc) =>
  splitIntoPassages(doc.body, { maxTokens: 300, overlap: 40 }).map((text, i) => ({
    _id: \`\${doc.id}#\${i + 1}\`,
    docId: doc.id, title: doc.title, product: doc.product,
    text, updatedAt: doc.updatedAt,
  })))`,
    update: chunk,
    flows: [flow('sources', 'chunker', 'ingest', 'articles + tickets')],
  });

  if (!auto)
    add({
      id: 'embed-each-chunk',
      title: 'Embed each chunk',
      description:
        'The app calls an embedding model to turn each passage into a vector: a list of numbers where similar meanings point in similar directions. This lesson uses four readable dimensions (billing, sign-in, sync, mobile). Real models use hundreds or thousands, but similarity works the same way.',
      code: `// Bring your own: any model, called from your code
import { VoyageAIClient } from "voyageai"
const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY })
const { data } = await voyage.embed({
  model: "${AUTO_MODEL}", input: chunks.map((c) => c.text), inputType: "document",
})
chunks.forEach((c, i) => (c.embedding = data[i].embedding))`,
      update: embed,
      flows: [flow('chunker', 'embedder', 'embed', 'passages')],
    });

  add({
    id: 'store-text-metadata-and-vector',
    title: auto
      ? 'Store the chunks as documents'
      : 'Store text, metadata and vector together',
    description: (after) =>
      auto
        ? `Each chunk becomes one document in knowledge.chunks, ${after.stored.length} in all: the text to quote and the metadata to filter on. There is no embedding code in the app at all. The vectors come next, from the index.`
        : `Each chunk becomes one document in knowledge.chunks, ${after.stored.length} in all, holding the text to quote, the metadata to filter on and the vector to search. The vector is just another field.`,
    code: `db.chunks.insertMany(chunks)   // ${insertNote(auto)}`,
    update: store,
    flows: [
      auto
        ? flow('chunker', 'atlas', 'write', 'insertMany')
        : flow('embedder', 'atlas', 'write', 'insertMany'),
    ],
  });

  add({
    id: 'one-document-no-pipeline',
    title: 'One document, no sync pipeline',
    description: auto
      ? 'Open the Value panel: this is the whole chunk. With a separate vector database you would run an ETL job to copy text out, embed it, load the vectors, and a second job to replay every update and delete, with two systems that can drift. Here the operational document is the source, and Atlas keeps the vectors for it in a system-managed collection on the same cluster.'
      : 'Open the Value panel: this is the whole chunk, vector included. With a separate vector database you would run an ETL job to copy text out, embed it and load the vectors, plus a second job to replay every update and delete, and two systems that can drift. Here it is one write to one document.',
    code: auto
      ? `// knowledge.chunks — the document you write and read
{
  _id: "kb-101#1",
  docId: "kb-101",            // provenance, for citations
  title: "Sync on mobile",
  product: "mobile",          // metadata: filter, tenancy, permissions
  text: "Notes not syncing on iOS or Android? ...",   // quoted, and embedded by Atlas
  updatedAt: ISODate("2026-09-02")
}
// Vectors: generated with ${AUTO_MODEL}, stored and synced by Atlas.

// Instead of: source DB -> ETL -> embedding service -> vector DB
//             + a CDC job for updates and deletes, + reconciliation`
      : `// knowledge.chunks — the document you write and read
{
  _id: "kb-101#1",
  docId: "kb-101",            // provenance, for citations
  title: "Sync on mobile",
  product: "mobile",          // metadata: filter, tenancy, permissions
  text: "Notes not syncing on iOS or Android? ...",   // what the LLM quotes
  updatedAt: ISODate("2026-09-02"),
  embedding: [0.03, 0.2, 0.82, 0.55]                   // what $vectorSearch compares
}

// Instead of: source DB -> ETL -> vector DB
//             + a CDC job for updates and deletes, + reconciliation`,
    focus: ['atlas'],
  });

  add({
    id: 'create-a-vector-index',
    title: auto ? 'An autoEmbed index with Voyage AI' : 'Create a vector search index',
    description: auto
      ? `An index field of type autoEmbed names the text field and a Voyage AI model (${AUTO_MODEL}). Atlas runs the model inside its own perimeter, embeds every existing document, then embeds each insert and update as it arrives. No API keys in the app, no inference servers, no pipeline. product is declared as a filter field.${mode === 'hybrid' ? ' Hybrid search also needs an Atlas Search index on the text.' : ''}`
      : `A vectorSearch index makes nearest-neighbour search fast and declares product as a filter field. numDimensions must match the model, and the app must use the same model for questions.${mode === 'hybrid' ? ' Hybrid search also needs an Atlas Search index on the text.' : ''}`,
    code: `db.chunks.createSearchIndex({
  name: "chunks_vector",
  type: "vectorSearch",
  definition: { fields: [
    ${
      auto
        ? `{ type: "autoEmbed", modality: "text", path: "text", model: "${AUTO_MODEL}" },`
        : `{ type: "vector", path: "embedding", numDimensions: 4, similarity: "cosine" },`
    }
    { type: "filter", path: "product" },
  ] },
})${
      mode === 'hybrid'
        ? `

db.chunks.createSearchIndex({
  name: "chunks_text",
  definition: { mappings: { fields: { text: { type: "string" } } } },
})`
        : ''
    }`,
    update: createIndexes,
    focus: ['atlas'],
  });

  if (auto)
    add({
      id: 'ask-in-plain-text',
      title: 'Ask in plain text',
      description:
        'A customer asks the support assistant a question. The app does not embed it: $vectorSearch accepts the text and Atlas embeds it with the same model as the index, so questions and passages always share a vector space.',
      code: `const question = ${JSON.stringify(QUESTION)}
// No embedding call. The query text goes straight into $vectorSearch.`,
      update: ask,
      focus: ['app'],
    });
  else
    add({
      id: 'embed-the-question',
      title: 'Embed the question',
      description:
        'A customer asks the support assistant a question. The app embeds it with the same model it used for the chunks, so the question and the passages are in the same vector space and can be compared.',
      code: `const question = ${JSON.stringify(QUESTION)}
const queryVector = await embed(question)   // [0.02, 0.08, 0.85, 0.52]`,
      update: ask,
      flows: [
        flow('app', 'embedder', 'query', 'question'),
        flow('embedder', 'app', 'retrieve', 'query vector'),
      ],
    });

  add({
    id: 'semantic-search',
    title: 'Semantic search with $vectorSearch',
    description: (after) =>
      `$vectorSearch compares the question with the stored vectors and returns the ${LIMIT} closest by meaning: ${hitList(after)}. Most of the words differ from the question, but the meaning matches. The closest chunk, kb-205#1, is about the web app. This customer is on Android.`,
    code: `db.chunks.aggregate([
  ${vectorStage(false)},
  { $project: { text: 1, product: 1, score: { $meta: "vectorSearchScore" } } },
])`,
    update: vectorSearch,
    flows: [
      flow('app', 'atlas', 'query', auto ? '$vectorSearch · text' : '$vectorSearch'),
      flow('atlas', 'app', 'retrieve', `top ${LIMIT}`),
    ],
  });

  if (mode === 'vector')
    add({
      id: 'nearest-is-not-always-right',
      title: 'Nearest is not always right',
      description:
        'Similar meaning is not the same as the right answer. A web article about sync is close to a question about sync on a phone, and the ticket about the exact error code ranks fifth. Try the pre-filter or hybrid modes to see each problem fixed.',
      code: `// Ranked by meaning alone, across every product
kb-205#1   web     0.9995   "Sync stalls in the browser..."
kb-101#2   mobile  0.9969
kb-101#1   mobile  0.9960
kb-101#3   mobile  0.9959   (not returned, limit ${LIMIT})
tk-8812#1  mobile  0.9490   (not returned; it names E_SYNC_409)`,
      focus: ['atlas'],
    });
  if (mode === 'filtered')
    add({
      id: 'pre-filter-by-product',
      title: 'Pre-filter by product',
      description: (after) =>
        `A filter on product, a metadata field in the same document, removes web and account chunks before ranking, so every result applies to the customer: ${hitList(after)}. The same filter enforces tenancy and access control in multi-tenant apps. The exact-error ticket still ranks fourth by meaning, so it is not returned.`,
      code: `db.chunks.aggregate([
  ${vectorStage(true)},
  { $project: { text: 1, score: { $meta: "vectorSearchScore" } } },
])`,
      update: refine,
      flows: [
        flow('app', 'atlas', 'query', 'filter: mobile'),
        flow('atlas', 'app', 'retrieve', `top ${LIMIT}`),
      ],
    });
  if (mode === 'hybrid')
    add({
      id: 'fuse-with-full-text',
      title: 'Fuse with full-text search',
      description: (after) =>
        `Vectors capture meaning but blur exact tokens like error codes and version numbers. $rankFusion runs the filtered vector search and a full-text search, then combines their ranks with reciprocal rank fusion. The ticket naming E_SYNC_409 ranks first on text, so it makes the top ${LIMIT}: ${hitList(after)}.`,
      code: `const semantic = [
  ${vectorStage(true, FUSION_DEPTH)},
]
const keyword = [
  { $search: { index: "chunks_text", text: { query: question, path: "text" } } },
  { $match: { product: "${PRODUCT}" } },
  { $limit: ${FUSION_DEPTH} },
]
db.chunks.aggregate([
  // fused score = Σ 1 / (${RRF_K} + rank in each pipeline)
  { $rankFusion: { input: { pipelines: { semantic, keyword } } } },
  { $limit: ${LIMIT} },
])`,
      update: refine,
      flows: [
        flow('app', 'atlas', 'query', '$rankFusion'),
        flow('atlas', 'app', 'retrieve', `top ${LIMIT}`),
      ],
    });

  add({
    id: 'augment-the-prompt',
    title: 'Augment the prompt',
    description: (after) =>
      `The app puts the retrieved passages into the prompt, each labelled with its id, and tells the model to answer only from them. The model gets ${after.context.length} short passages instead of the whole knowledge base, so the prompt stays small and the model has less to be distracted by.`,
    code: `const context = hits.map((h) => \`[\${h._id}] \${h.text}\`).join("\\n")
const prompt = \`Answer using only the context. Cite the ids you used.
If the context does not contain the answer, say so.

Context:
\${context}

Question: \${question}\``,
    update: augment,
    flows: [flow('app', 'llm', 'generate', 'question + context')],
  });

  add({
    id: 'a-grounded-answer',
    title: 'A grounded answer, with sources',
    description: (after) =>
      mode === 'hybrid'
        ? `The model answers from the ticket: update to 4.2.1. It cites ${after.answer!.citations.join(' and ')}, so the customer and the support team can check the source. Retrieval decided the answer quality; the model was the same in every mode.`
        : mode === 'filtered'
          ? `The answer is correct for Android, citing ${after.answer!.citations.join(' and ')}, but it is generic: the fix for E_SYNC_409 was in a ticket the search did not return. Switch to hybrid to bring the exact match in.`
          : `The answer mixes in advice for the web app (allow third-party cookies) because a web chunk was in the context. It cites ${after.answer!.citations.join(' and ')}, which makes the mistake visible. The model did what it was told; retrieval gave it the wrong context.`,
    code: `const answer = await llm.generate({ prompt })
// -> { text, citations }

// Store the exchange for evaluation, feedback and analytics
db.conversations.insertOne({ question, context: hits.map((h) => h._id), answer, at: new Date() })`,
    update: generate,
    flows: [flow('llm', 'app', 'retrieve', 'answer + citations')],
  });

  if (auto)
    add({
      id: 'keep-vectors-fresh',
      title: 'Edits re-embed automatically',
      description:
        'The support team revises kb-101. The app updates the text, and that is all: Atlas notices the change, re-embeds the passage with Voyage AI and updates the index. Re-embedding is asynchronous, so the new text is searchable shortly after the write, not in the same instant.',
      code: `// The only code: a normal update
db.chunks.updateOne(
  { _id: "kb-101#1" },
  { $set: { text: revisedText, updatedAt: new Date() } },
)
// No change stream, no embedding job, no vector to write back.`,
      update: refresh,
      flows: [flow('sources', 'atlas', 'write', 'kb-101 v2')],
    });
  else
    add({
      id: 'keep-vectors-fresh',
      title: 'Keep vectors fresh with a change stream',
      description:
        'The support team revises kb-101. Bringing your own vectors means owning their freshness: a change stream notices the edited chunk, the app re-embeds just that passage and writes the new vector back to the same document. With Automated Embedding this step disappears.',
      code: `// Re-embed when a chunk is inserted or its text changes. Writing the embedding
// does not touch text, so it does not trigger another round.
const changes = db.chunks.watch([
  { $match: { $or: [
      { operationType: "insert" },
      { "updateDescription.updatedFields.text": { $exists: true } },
  ] } },
], { fullDocument: "updateLookup" })

for await (const { fullDocument: c } of changes) {
  const embedding = await embed(c.text)
  await db.chunks.updateOne({ _id: c._id }, { $set: { embedding } })
}`,
      update: refresh,
      flows: [
        flow('sources', 'atlas', 'write', 'kb-101 v2'),
        flow('atlas', 'embedder', 'ingest', 'change stream'),
        flow('embedder', 'atlas', 'write', 'new embedding'),
      ],
    });

  return {
    ...metadata,
    steps,
    takeaway: auto
      ? `RAG is a retrieval problem first, and MongoDB keeps it close to your data. Chunks are ordinary documents with text and metadata; an autoEmbed index has Voyage AI (${AUTO_MODEL}) embed them on write and embed questions at query time, so there is no ETL, no embedding service and no second database to sync. Use the same pipeline to filter by product, tenant or permissions and fuse with full-text search. Bring your own vectors when you need a custom or self-hosted model, multimodal data, or control over exactly when vectors change.`
      : 'RAG is a retrieval problem first. Keep each chunk’s text, metadata and vector in one MongoDB document, index the vector with Atlas Vector Search, filter by product, tenant or permissions, fuse with full-text search for exact terms, and keep embeddings fresh with change streams. Or let Automated Embedding with Voyage AI do the embedding and syncing for you.',
  };
}
/** What the insert carries, as a code comment. */
function insertNote(auto: boolean) {
  return auto
    ? 'text + metadata; Atlas makes the vectors'
    : 'text + metadata + embedding';
}

export const lesson: UseCaseDefinition<RagOptions, RagLesson> = {
  ...metadata,
  icon: 'rag',
  build,
};
