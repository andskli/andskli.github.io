import { ExternalLink } from 'lucide-react';
import { eventDocument } from '../../lessons/features/change-streams/operations.ts';
import { featureSources } from '../../lessons/features/sources.ts';
import type { ChangeStreamModel } from '../../lessons/features/types.ts';

/** Fields worth a second look in a change event; the rest is envelope. */
const emphasized = new Set(['fullDocument', 'updateDescription', 'documentKey', '_id']);

function JsonLines({ value }: { value: unknown }) {
  const lines = JSON.stringify(value, null, 2).split('\n');
  let section = '';
  return (
    <pre className="event-json">
      <code>
        {lines.map((line, index) => {
          const top = /^ {2}"([^"]+)"/.exec(line);
          if (top) section = top[1];
          else if (/^[{}]/.test(line)) section = '';
          return (
            <span
              key={index}
              className={'event-line' + (emphasized.has(section) ? ' emphasized' : '')}
            >
              {line}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export default function ChangeEventPanel({ state }: { state: ChangeStreamModel }) {
  const event = state.lastEvent;
  return (
    <aside className="event-panel" aria-label="Latest change event" aria-live="polite">
      <div className="event-panel-top">
        <span className="eyebrow">LATEST CHANGE EVENT</span>
        <a
          href={featureSources.changeEvents}
          target="_blank"
          rel="noreferrer"
          aria-label="Change event reference"
        >
          <ExternalLink size={12} />
        </a>
      </div>
      {event ? (
        <>
          <div className="event-meta">
            <strong>{event.operationType}</strong>
            <span>oplog position #{event.ts}</span>
          </div>
          <JsonLines value={eventDocument(event)} />
          <p className="event-note">
            <code>_id</code> is the resume token for this position.
            {event.operationType === 'update' && event.fullDocument === undefined
              ? ' No fullDocument: only the delta is reported.'
              : ''}
            {event.operationType === 'delete' ? ' Only the key survives a delete.' : ''}
          </p>
        </>
      ) : (
        <p className="event-empty">
          No event yet. Once a stream is open, each matching write appears here exactly as
          the server sends it.
        </p>
      )}
    </aside>
  );
}
