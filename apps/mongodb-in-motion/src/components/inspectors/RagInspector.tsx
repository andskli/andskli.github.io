import { BookOpen, ExternalLink, Focus, Server, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AUTO_MODEL,
  DIMENSIONS,
  chunkById,
  chunkDocument,
} from '../../lessons/use-cases/rag/operations.ts';
import type { RagModel, RagPart } from '../../lessons/use-cases/rag/types.ts';
import { useCaseSources } from '../../lessons/use-cases/sources.ts';
import { compactJson } from './OdlValuePanel.tsx';

const descriptions: Record<
  RagPart,
  {
    name: string;
    title: string;
    kind: string;
    body: string;
    points: string[];
    source: string;
  }
> = {
  sources: {
    name: 'Knowledge base',
    title: 'The data the model has never seen',
    kind: 'Help articles · resolved tickets',
    body: 'Private, current and specific to your product. An LLM trained months ago cannot know it, so RAG retrieves it at question time instead of retraining.',
    points: [
      'Any source: docs, tickets, PDFs, product data',
      'Keep provenance so answers can cite their source',
      'When a source changes, its chunks must be re-embedded',
    ],
    source: useCaseSources.rag,
  },
  chunker: {
    name: 'Chunker',
    title: 'Small enough to match, big enough to mean something',
    kind: 'Text splitting',
    body: 'Splits each document into passages. Too large and one vector blurs several topics; too small and a passage loses its context. A small overlap keeps sentences intact at the boundaries.',
    points: [
      'Copy filterable metadata onto every chunk',
      'Give each chunk a stable id, such as docId#n',
      'Chunk size is a tuning knob: measure retrieval quality',
    ],
    source: useCaseSources.rag,
  },
  embedder: {
    name: 'Embedding model',
    title: 'Meaning as a direction',
    kind: 'Embedding model',
    body: 'Maps text to a vector so that similar meanings point in similar directions. The same model must embed both the chunks and the questions, or the vectors are not comparable.',
    points: [
      'numDimensions in the index must match the model',
      'Changing the model means re-embedding every chunk',
      'Quantized vectors cut memory with little loss in recall',
    ],
    source: useCaseSources.vectorIndex,
  },
  atlas: {
    name: 'MongoDB Atlas',
    title: 'Operational data, metadata and vectors in one place',
    kind: 'Collection · vectorSearch index',
    body: 'Each chunk is one document holding its text, metadata and embedding. Atlas Vector Search indexes the vectors for approximate nearest-neighbour search, and the same aggregation pipeline can filter, join and fuse with full-text search.',
    points: [
      'Pre-filter on indexed fields such as product, tenant or permissions',
      '$rankFusion combines semantic and keyword results',
      'Indexes update as documents change; no separate store to sync',
      'autoEmbed indexes run Voyage AI inside Atlas: no embedding code at all',
    ],
    source: useCaseSources.vectorStage,
  },
  app: {
    name: 'Support assistant',
    title: 'Orchestrates retrieval and generation',
    kind: 'Application',
    body: 'Embeds the question, runs the search, builds the prompt from the results and calls the LLM. It decides how much context to send and how to filter it.',
    points: [
      'limit trades prompt size for recall',
      'numCandidates trades latency for accuracy',
      'Log question, context and answer to evaluate quality',
    ],
    source: useCaseSources.hybrid,
  },
  llm: {
    name: 'LLM',
    title: 'Writes the answer from the context',
    kind: 'Large language model',
    body: 'Generates an answer using the retrieved passages. Told to answer only from the context and to cite ids, it produces answers that can be checked and is less likely to invent facts.',
    points: [
      'It can only ground on what retrieval found',
      'Citations make wrong context visible',
      'The same model gives better answers with better context',
    ],
    source: useCaseSources.rag,
  },
};

export default function RagInspector({
  id,
  state,
  onClose,
  onFocus,
}: {
  id: RagPart;
  state: RagModel;
  onClose: () => void;
  onFocus: () => void;
}) {
  const [tab, setTab] = useState<'about' | 'state'>('about');
  useEffect(() => setTab('about'), [id]);
  const info = descriptions[id];
  const vector =
    id === 'embedder'
      ? (state.queryVector ?? state.embedded[0]?.embedding ?? null)
      : null;
  return (
    <aside className="inspector" aria-label={`Details for ${info.title}`}>
      <div className="inspector-top">
        <span className="eyebrow">PIPELINE INSPECTOR</span>
        <button className="icon-button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="inspector-heading">
        <div className="component-icon">
          <Server size={24} />
        </div>
        <div>
          <h2>{info.name}</h2>
          <p>{info.kind}</p>
        </div>
      </div>
      <div className="inspector-tabs">
        <button
          className={tab === 'about' ? 'active' : ''}
          onClick={() => setTab('about')}
        >
          Overview
        </button>
        <button
          className={tab === 'state' ? 'active' : ''}
          onClick={() => setTab('state')}
        >
          State
        </button>
      </div>
      {tab === 'about' ? (
        <div className="inspector-body">
          <h3>{info.title}</h3>
          <p>{info.body}</p>
          <ul>
            {info.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="inspector-body data-view">
          {id === 'sources' && (
            <>
              <h3>Documents</h3>
              <div className="doc-list">
                {state.docs.map((doc) => (
                  <div className="doc-item" key={doc.id}>
                    <div>
                      <code>{doc.id}</code>
                      <span>
                        {doc.kind} · {doc.product}
                      </span>
                    </div>
                    <strong>
                      {doc.title}
                      {doc.version > 1 ? ` · v${doc.version}` : ''}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}
          {id === 'chunker' && (
            <>
              <h3>Chunks waiting for vectors</h3>
              <div className="doc-list">
                {state.pending.length === 0 && (
                  <div className="doc-item">
                    <span>Nothing pending</span>
                  </div>
                )}
                {state.pending.map((chunk) => (
                  <div className="doc-item" key={chunk._id}>
                    <div>
                      <code>{chunk._id}</code>
                      <span>{chunk.product}</span>
                    </div>
                    <strong>{chunk.text}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
          {id === 'embedder' && (
            <>
              <h3>{state.queryVector ? 'Question vector' : 'Latest vector'}</h3>
              {vector ? (
                <table>
                  <thead>
                    <tr>
                      <th>Dimension</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIMENSIONS.map((name, i) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td>{vector[i].toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="data-caption">No vectors produced yet.</p>
              )}
              <p className="data-caption">
                Teaching dimensions. Real models use hundreds that have no names.
              </p>
            </>
          )}
          {id === 'atlas' && (
            <>
              <h3>knowledge.chunks</h3>
              <p className="data-caption">
                {state.indexes.map((i) => `${i.name} (${i.type})`).join(', ') ||
                  'No search indexes yet'}
                {state.filter ? ` · filter product: ${state.filter.product}` : ''}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Chunk</th>
                    <th>Product</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {state.stored.length === 0 && (
                    <tr>
                      <td colSpan={3}>None yet</td>
                    </tr>
                  )}
                  {state.stored.map((chunk) => {
                    const hit = state.hits.find((h) => h._id === chunk._id);
                    return (
                      <tr key={chunk._id}>
                        <td>{hit ? <strong>{chunk._id}</strong> : chunk._id}</td>
                        <td>{chunk.product}</td>
                        <td>{hit ? hit.vectorScore.toFixed(4) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {state.stored[0] && (
                <>
                  <h3>One document</h3>
                  <pre className="event-json">
                    <code>{compactJson(chunkDocument(state.stored[0]))}</code>
                  </pre>
                  <p className="data-caption">
                    {state.embedding === 'auto'
                      ? `Vectors: Voyage AI ${AUTO_MODEL}, managed and synced by Atlas.`
                      : 'The vector is a field in the same document.'}
                  </p>
                </>
              )}
            </>
          )}
          {(id === 'app' || id === 'llm') && (
            <>
              <h3>{id === 'app' ? 'Question' : 'Context in the prompt'}</h3>
              {id === 'app' && (
                <p className="data-caption">{state.question ?? 'Not asked yet'}</p>
              )}
              <div className="doc-list">
                {(id === 'llm' ? state.context : state.hits.map((h) => h._id)).map(
                  (chunkId) => (
                    <div className="doc-item" key={chunkId}>
                      <div>
                        <code>{chunkId}</code>
                        <span>{chunkById(state, chunkId)?.product}</span>
                      </div>
                      <strong>{chunkById(state, chunkId)?.text}</strong>
                    </div>
                  ),
                )}
              </div>
              {state.answer && (
                <>
                  <h3>Answer</h3>
                  <p className="data-caption">{state.answer.text}</p>
                </>
              )}
            </>
          )}
        </div>
      )}
      <div className="inspector-bottom">
        <button className="button quiet" onClick={onFocus}>
          <Focus size={15} /> Focus in 3D
        </button>
        <a
          href={info.source}
          target="_blank"
          rel="noreferrer"
          aria-label="Read documentation"
        >
          <BookOpen size={16} />
          <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  );
}
