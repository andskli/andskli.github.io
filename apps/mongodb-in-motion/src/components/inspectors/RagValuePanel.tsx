import { Check, ExternalLink, Sparkles } from 'lucide-react';
import {
  AUTO_MODEL,
  chunkById,
  chunkDocument,
} from '../../lessons/use-cases/rag/operations.ts';
import type { Chunk, RagModel } from '../../lessons/use-cases/rag/types.ts';
import { useCaseSources } from '../../lessons/use-cases/sources.ts';

const ROLE: Record<string, string> = {
  text: 'field-text',
  docId: 'field-meta',
  title: 'field-meta',
  product: 'field-meta',
  updatedAt: 'field-meta',
  embedding: 'field-vector',
};
/** The chunk as stored, each line tinted by what that field is for. */
function ChunkDocument({ chunk }: { chunk: Chunk }) {
  return (
    <pre className="event-json">
      <code>
        {/* One field per line so each can be tinted; keep the vector on one line. */}
        {JSON.stringify(chunkDocument(chunk), null, 2)
          .replace(
            /\[\s*([^\]]*?)\s*\]/g,
            (_, inner: string) => `[${inner.replace(/\s*\n\s*/g, ' ')}]`,
          )
          .split('\n')
          .map((line, index) => {
            const key = /^\s*"(\w+)"/.exec(line)?.[1] ?? '';
            return (
              <span key={index} className={'event-line ' + (ROLE[key] ?? '')}>
                {line}
              </span>
            );
          })}
      </code>
    </pre>
  );
}

/** The chunk document, what retrieval returned and the answer it produced. */
export default function RagValuePanel({ state }: { state: RagModel }) {
  const auto = state.embedding === 'auto';
  const sample =
    state.stored.find((c) => state.refreshed.includes(c._id)) ?? state.stored[0];
  const indexed = Object.keys(state.managed).length > 0;
  return (
    <aside
      className="event-panel value-panel"
      aria-label="What the collection holds and what retrieval returns"
      aria-live="polite"
    >
      <div className="value-metrics top">
        <div>
          <span>Chunks stored</span>
          <strong>{state.stored.length}</strong>
        </div>
        <div>
          <span>Sync pipelines</span>
          <strong>{auto ? 0 : 1}</strong>
        </div>
      </div>
      <div className="event-panel-top">
        <span className="eyebrow">ONE CHUNK · knowledge.chunks</span>
        <a
          href={auto ? useCaseSources.autoEmbed : useCaseSources.rag}
          target="_blank"
          rel="noreferrer"
          aria-label={auto ? 'Automated Embedding docs' : 'RAG with Atlas Vector Search'}
        >
          <ExternalLink size={12} />
        </a>
      </div>
      {sample ? (
        <>
          <ChunkDocument chunk={sample} />
          <div className="field-key">
            <span>
              <i style={{ background: '#d99243' }} />
              text: quoted
            </span>
            <span>
              <i style={{ background: '#789ac4' }} />
              metadata: filtered
            </span>
            <span>
              <i style={{ background: '#9475be' }} />
              vector: searched
            </span>
          </div>
          {auto && (
            <div className="field-managed">
              <Sparkles size={11} /> Managed by Atlas · {AUTO_MODEL} (illustrative)
              {indexed && state.managed[sample._id] ? (
                <pre className="event-json">
                  <code>
                    <span className="event-line">{`{ "_id": "${sample._id}",`}</span>
                    <span className="event-line field-vector">
                      {`  "embedding": [${state.managed[sample._id].join(', ')}] }`}
                    </span>
                  </code>
                </pre>
              ) : (
                <p>
                  No vectors yet. An autoEmbed index will have Voyage AI embed the text
                  field.
                </p>
              )}
              <p>
                Kept in a system-managed collection and re-synced on every write. You
                never write or read it.
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="event-empty">
          Nothing stored yet. Each chunk will be one document: text, metadata
          {auto ? '' : ' and its vector'}.
        </p>
      )}
      <div className="event-panel-top value-section">
        <span className="eyebrow">
          {state.filter ? `RETRIEVED · product: ${state.filter.product}` : 'RETRIEVED'}
        </span>
      </div>
      {state.question && <p className="event-empty">“{state.question}”</p>}
      {state.hits.length ? (
        <ul className="value-list">
          {state.hits.map((hit) => {
            const chunk = chunkById(state, hit._id)!;
            return (
              <li key={hit._id} title={chunk.text}>
                <code>{hit._id}</code>
                <span>
                  {chunk.product} · {hit.vectorScore.toFixed(4)}
                  {hit.fusedScore !== undefined &&
                    ` · text #${hit.textRank ?? '–'} · rrf ${hit.fusedScore.toFixed(5)}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="event-empty">No search yet. Results appear with their scores.</p>
      )}
      <div className="event-panel-top value-section">
        <span className="eyebrow">GROUNDED ANSWER</span>
      </div>
      {state.answer ? (
        <>
          <p className="event-empty">{state.answer.text}</p>
          <ul className="value-list unlocked">
            {state.answer.citations.map((id) => (
              <li key={id}>
                <Check size={12} />
                <span>cites {id}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="event-empty">
          The answer can only be as good as the context retrieval provides.
        </p>
      )}
    </aside>
  );
}
