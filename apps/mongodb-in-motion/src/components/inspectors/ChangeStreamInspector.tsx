import { BookOpen, ExternalLink, Focus, Server, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { featureSources } from '../../lessons/features/sources.ts';
import type { ChangeStreamModel, Part } from '../../lessons/features/types.ts';

const descriptions: Record<
  Part,
  { title: string; kind: string; body: string; points: string[]; source: string }
> = {
  producer: {
    title: 'Where changes begin',
    kind: 'Client application',
    body: 'Any application, service or admin shell that writes to the collection. Writers never talk to the change stream; they just write.',
    points: [
      'Writers are decoupled from every consumer',
      'Any insert, update, replace or delete can produce an event',
      'Multi-document transactions emit their events together at commit',
    ],
    source: featureSources.changeStreams,
  },
  primary: {
    title: 'Where writes are committed',
    kind: 'mongod · primary',
    body: 'The primary applies each write and records it in the oplog. Change streams read the oplog, so they need a replica set or sharded cluster; a standalone server has no oplog to read.',
    points: [
      'The same oplog also drives replication to secondaries',
      'Only majority-committed changes are delivered to the stream',
      'Time series collections do not support change streams',
    ],
    source: featureSources.oplog,
  },
  oplog: {
    title: 'A capped, ordered log',
    kind: 'local.oplog.rs',
    body: 'The oplog is a capped collection: when it is full, new entries overwrite the oldest. A change stream is a cursor over it, and a resume token points at one position.',
    points: [
      'Entries keep the order in which writes were applied',
      'The window is a size, not a promise of time; busy systems rotate faster',
      'A token older than the oldest entry cannot be resumed',
    ],
    source: featureSources.oplog,
  },
  consumer: {
    title: 'Where events are handled',
    kind: 'Client application',
    body: 'The consumer reads events with getMore, processes them, and persists a resume token. The server tracks only the cursor position, not what the consumer has handled.',
    points: [
      'Persist the token after processing, not before',
      'Delivery is at-least-once, so make handlers idempotent',
      'A token store survives a crash; in-memory events do not',
    ],
    source: featureSources.changeStreams,
  },
};

export default function ChangeStreamInspector({
  id,
  state,
  onClose,
  onFocus,
}: {
  id: Part;
  state: ChangeStreamModel;
  onClose: () => void;
  onFocus: () => void;
}) {
  const [tab, setTab] = useState<'about' | 'data'>('about');
  useEffect(() => setTab('about'), [id]);
  const info = descriptions[id];
  const oldest = state.oplog[0]?.ts;
  return (
    <aside className="inspector" aria-label={`Details for ${info.title}`}>
      <div className="inspector-top">
        <span className="eyebrow">STREAM INSPECTOR</span>
        <button className="icon-button" aria-label="Close inspector" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="inspector-heading">
        <div className="component-icon">
          <Server size={24} />
        </div>
        <div>
          <h2>{id === 'oplog' ? 'Oplog' : id[0].toUpperCase() + id.slice(1)}</h2>
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
        {id !== 'producer' && (
          <button
            className={tab === 'data' ? 'active' : ''}
            onClick={() => setTab('data')}
          >
            {id === 'primary' ? 'Documents' : id === 'oplog' ? 'Entries' : 'State'}
          </button>
        )}
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
          {id === 'oplog' && (
            <div className="version-grid">
              <div>
                <span>Kept</span>
                <strong>
                  {state.oplog.length}/{state.oplogCapacity}
                </strong>
              </div>
              <div>
                <span>Oldest</span>
                <strong>#{oldest}</strong>
              </div>
              <div>
                <span>Newest</span>
                <strong>#{state.headTs}</strong>
              </div>
            </div>
          )}
          {id === 'consumer' && (
            <div className="version-grid">
              <div>
                <span>Queued</span>
                <strong>{state.inbox.length}</strong>
              </div>
              <div>
                <span>Handled</span>
                <strong>{state.processedCount}</strong>
              </div>
              <div>
                <span>Token</span>
                <strong>{state.savedTs === null ? '–' : `#${state.savedTs}`}</strong>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="inspector-body data-view">
          {id === 'primary' && (
            <>
              <h3>Current documents</h3>
              <p className="data-caption">
                shop.orders · {state.orders.length} documents
              </p>
              <div className="doc-list">
                {state.orders.map((order) => (
                  <div className="doc-item" key={order._id}>
                    <div>
                      <code>_id: {order._id}</code>
                      <span
                        className={
                          order.status === 'open' ? 'status-open' : 'status-closed'
                        }
                      >
                        {order.status}
                      </span>
                    </div>
                    <strong>{order.item}</strong>
                    <span>amount: {order.amount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {id === 'oplog' && (
            <>
              <h3>Retained entries</h3>
              <p className="data-caption">
                Oldest first · entries before #{oldest} were overwritten
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Operation</th>
                    <th>_id</th>
                  </tr>
                </thead>
                <tbody>
                  {state.oplog.map((entry) => (
                    <tr key={entry.ts}>
                      <td>#{entry.ts}</td>
                      <td>{entry.op}</td>
                      <td>{entry.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {id === 'consumer' && (
            <>
              <h3>Consumer state</h3>
              <p className="data-caption">
                {state.error
                  ? state.error
                  : state.consumer === 'offline'
                    ? 'Offline · unprocessed events are lost with the process'
                    : state.streamOpen
                      ? 'Stream open'
                      : 'No stream open'}
              </p>
              <div className="inspector-fact">
                <span>Persisted token</span>
                <strong>
                  {state.savedTs === null ? 'none' : `position #${state.savedTs}`}
                </strong>
              </div>
              {state.missed > 0 && (
                <div className="inspector-fact">
                  <span>Unrecoverable changes</span>
                  <strong>{state.missed}</strong>
                </div>
              )}
              <div className="doc-list">
                {state.inbox.length === 0 && (
                  <div className="doc-item">
                    <span>No queued events</span>
                  </div>
                )}
                {state.inbox.map((event) => (
                  <div className="doc-item" key={event.ts}>
                    <div>
                      <code>#{event.ts}</code>
                      <span>{event.operationType}</span>
                    </div>
                    <strong>_id: {event.documentKey._id}</strong>
                  </div>
                ))}
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
