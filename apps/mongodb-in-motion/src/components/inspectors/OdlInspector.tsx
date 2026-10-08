import { BookOpen, ExternalLink, Focus, Server, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  loadLevel,
  loadWord,
  rawCollections,
} from '../../lessons/use-cases/odl/operations.ts';
import { useCaseSources } from '../../lessons/use-cases/sources.ts';
import type { OdlModel, Part } from '../../lessons/use-cases/types.ts';

const descriptions: Record<
  Part,
  { title: string; kind: string; body: string; points: string[]; source: string }
> = {
  crm: {
    title: 'A SaaS system of record',
    kind: 'CRM · JSON change feed',
    body: 'Owns the customer profile. It publishes a change feed, so changes can be captured as they happen instead of polled for.',
    points: [
      'Has its own data model, API limits and owner',
      'The change feed joins the CDC lane',
      'Direct queries from apps and AI agents add load until they move to the ODL',
    ],
    source: useCaseSources.odlPattern,
  },
  rdbms: {
    title: 'A legacy system of record',
    kind: 'Relational database · redo log',
    body: 'Holds accounts and balances. Log-based CDC reads its transaction log rather than its tables, so capture adds almost no query load and sees every committed change in order.',
    points: [
      'Reads the log, not the tables',
      'Ordering and deletes are preserved',
      'Remains the system of record; the ODL sits in front of it, not instead of it',
    ],
    source: useCaseSources.odl,
  },
  api: {
    title: 'A partner API with no change feed',
    kind: 'REST · XML',
    body: 'Offers only request/response calls. Without a log or feed to read, the only option is to poll on a schedule and keep what changed.',
    points: [
      'Freshness is bounded by the poll interval',
      'Needs an updatedSince cursor, or a diff against the last poll',
      'Respect the partner’s rate limits',
    ],
    source: useCaseSources.odlPattern,
  },
  cdc: {
    title: 'Streams changes as they commit',
    kind: 'Kafka Connect · log-based CDC',
    body: 'A source connector turns each committed change into an event on a topic, and a MongoDB sink connector writes it to the ODL. Atlas Stream Processing can do similar work inside Atlas.',
    points: [
      'Near real time: seconds, not a nightly job',
      'Low impact on the source system',
      'Reserve always-on streaming for data that needs the freshness',
    ],
    source: useCaseSources.kafka,
  },
  batch: {
    title: 'Polls on a schedule',
    kind: 'Micro-batch job',
    body: 'Small, frequent batches: fetch what changed since the last run, parse it, and upsert. It is the right tool when the source offers nothing to stream.',
    points: [
      'Upserts are idempotent, so a retried batch is safe',
      'Latency is the interval plus processing time',
      'Cheap to build; each poll costs the source a request',
    ],
    source: useCaseSources.streamProcessing,
  },
  odl: {
    title: 'The shared operational layer',
    kind: 'MongoDB Atlas · replica set',
    body: 'Consolidates siloed data into one document model and serves operational, analytical and AI workloads. It sits in front of the legacy systems; it does not replace them.',
    points: [
      'Read-only, enriched or read-write, chosen by risk and ambition',
      'Isolate workloads with secondary reads and dedicated search indexes',
      'A read-write layer needs an outbox or saga to stay consistent with legacy',
    ],
    source: useCaseSources.odl,
  },
  app: {
    title: 'Customer 360 for operational apps',
    kind: 'Operational application',
    body: 'Today it calls each system and stitches the answers together. Reading the ODL it gets one customer document in one query.',
    points: [
      'One query instead of one per source',
      'Single view of the customer',
      'No dependency on legacy availability for reads',
    ],
    source: useCaseSources.odlPattern,
  },
  analytics: {
    title: 'Real-time analytics',
    kind: 'Dashboards and reporting',
    body: 'Reporting queries are heavy. Run against the ODL on secondary members, they stop competing with the systems of record and see fresh data.',
    points: [
      'Workload isolation with secondaryPreferred reads',
      'Fresh data without a nightly extract',
      'The source database stops serving report queries',
    ],
    source: useCaseSources.readPreference,
  },
  ai: {
    title: 'AI grounded in live data',
    kind: 'RAG and agents',
    body: 'Vector search over the same documents lets an agent retrieve current customer context. Data and embeddings live together, so there is no separate vector store to keep in sync.',
    points: [
      'Embeddings stored beside operational fields',
      'Answers reflect the latest ingested change',
      'Richer enrichment gives the model more to ground on',
    ],
    source: useCaseSources.vectorSearch,
  },
};

export default function OdlInspector({
  id,
  state,
  onClose,
  onFocus,
}: {
  id: Part;
  state: OdlModel;
  onClose: () => void;
  onFocus: () => void;
}) {
  const [tab, setTab] = useState<'about' | 'state'>('about');
  useEffect(() => setTab('about'), [id]);
  const info = descriptions[id];
  const source = state.sources.find((candidate) => candidate.id === id);
  const consumer = state.consumers.find((candidate) => candidate.id === id);
  const inFlight = id === 'cdc' ? state.cdc : id === 'batch' ? state.batch : [];
  return (
    <aside className="inspector" aria-label={`Details for ${info.title}`}>
      <div className="inspector-top">
        <span className="eyebrow">LAYER INSPECTOR</span>
        <button className="icon-button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="inspector-heading">
        <div className="component-icon">
          <Server size={24} />
        </div>
        <div>
          <h2>{consumer?.name ?? source?.name ?? descriptionName(id)}</h2>
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
          {source && (
            <>
              <h3>
                {source.method === 'cdc' ? 'Captured by CDC' : 'Captured by micro-batch'}
              </h3>
              <div className="version-grid">
                <div className={'load-' + loadLevel(source.load)}>
                  <span>Load</span>
                  <strong>{source.load}%</strong>
                  <em>{loadWord[loadLevel(source.load)]}</em>
                </div>
                <div>
                  <span>Delay</span>
                  <strong>{source.latency}</strong>
                </div>
                <div>
                  <span>Captured</span>
                  <strong>{source.captured}</strong>
                </div>
              </div>
              <p className="data-caption">
                Load is the share of this system’s capacity used by consumers that still
                query it directly.
              </p>
            </>
          )}
          {(id === 'cdc' || id === 'batch') && (
            <>
              <h3>{id === 'cdc' ? 'Change events in flight' : 'Current batch'}</h3>
              <p className="data-caption">
                {id === 'batch'
                  ? `${state.batchRuns} poll${state.batchRuns === 1 ? '' : 's'} so far · every ${state.batchInterval}`
                  : 'Events waiting to be written to the ODL'}
              </p>
              <div className="doc-list">
                {inFlight.length === 0 && (
                  <div className="doc-item">
                    <span>Nothing in flight</span>
                  </div>
                )}
                {inFlight.map((change) => (
                  <div className="doc-item" key={change.id}>
                    <div>
                      <code>{change.source}</code>
                      <span>{change.format}</span>
                    </div>
                    <strong>{Object.keys(change.fields).join(', ')}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
          {id === 'odl' && (
            <>
              <h3>Collections</h3>
              <p className="data-caption">
                {state.level} level ·{' '}
                {state.acceptsWrites ? 'accepts writes' : 'no writes'}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Collection</th>
                    <th>Documents</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(state.collections).length === 0 && (
                    <tr>
                      <td colSpan={2}>None yet</td>
                    </tr>
                  )}
                  {Object.entries(state.collections).map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="inspector-fact">
                <span>Raw collections</span>
                <strong>{Object.values(rawCollections).join(', ')}</strong>
              </div>
            </>
          )}
          {consumer && (
            <>
              <h3>{consumer.unlocked ? 'Reading the ODL' : 'Querying the sources'}</h3>
              <div className="version-grid">
                <div>
                  <span>Queries</span>
                  <strong>{consumer.unlocked ? 1 : state.sources.length}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{consumer.unlocked ? 'ODL' : 'direct'}</strong>
                </div>
                <div>
                  <span>Use case</span>
                  <strong>{consumer.detail.split(' ')[0]}</strong>
                </div>
              </div>
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

function descriptionName(id: Part) {
  return id === 'cdc'
    ? 'CDC pipeline'
    : id === 'batch'
      ? 'Micro-batch job'
      : 'MongoDB ODL';
}
