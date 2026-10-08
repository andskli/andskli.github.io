import { Check, ExternalLink } from 'lucide-react';
import {
  customerDocument,
  loadLevel,
  loadWord,
} from '../../lessons/use-cases/odl/operations.ts';
import { useCaseSources } from '../../lessons/use-cases/sources.ts';
import type { OdlModel } from '../../lessons/use-cases/types.ts';

/** Pretty-print, but keep arrays and flat sub-objects on one line so the panel stays short. */
export function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2)
    .replace(
      /\[\s*([^[\]{}]*?)\s*\]/g,
      (_, inner: string) => `[${inner.replace(/\s*\n\s*/g, ' ')}]`,
    )
    .replace(
      /\{\s*\n([^{}[\]]*?)\n\s*\}/g,
      (_, inner: string) => `{ ${inner.trim().replace(/\s*\n\s*/g, ' ')} }`,
    );
}

function Code({ text }: { text: string }) {
  return (
    <pre className="event-json">
      <code>
        {text.split('\n').map((line, index) => (
          <span key={index} className="event-line">
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}

export default function OdlValuePanel({ state }: { state: OdlModel }) {
  const change = state.lastChange;
  const source = state.sources.find((candidate) => candidate.id === change?.source);
  const hub = state.layers.odl && state.landed.crm !== undefined;
  return (
    <aside
      className="event-panel value-panel"
      aria-label="What the layer holds"
      aria-live="polite"
    >
      <div className="value-metrics top">
        <div>
          <span>{hub ? 'Integrations' : 'Point-to-point'}</span>
          <strong>{state.integrations}</strong>
        </div>
        <div className={'load-' + loadLevel(state.sources[1].load)}>
          <span>Legacy RDBMS load</span>
          <strong>{state.sources[1].load}%</strong>
          <em>{loadWord[loadLevel(state.sources[1].load)]}</em>
        </div>
      </div>
      <div className="event-panel-top">
        <span className="eyebrow">LATEST CHANGE</span>
        <a
          href={useCaseSources.odlPattern}
          target="_blank"
          rel="noreferrer"
          aria-label="Operational data layer pattern"
        >
          <ExternalLink size={12} />
        </a>
      </div>
      {change && source ? (
        <>
          <div className="event-meta">
            <strong>{source.name}</strong>
            <span>
              {change.method === 'cdc' ? 'CDC' : 'micro-batch'} · {change.format}
            </span>
          </div>
          <Code text={change.raw} />
        </>
      ) : (
        <p className="event-empty">
          No change captured yet. Each source speaks its own format; the layer turns them
          into one.
        </p>
      )}
      <div className="event-panel-top value-section">
        <span className="eyebrow">IN THE ODL</span>
      </div>
      {state.customer ? (
        <Code text={compactJson(customerDocument(state.customer))} />
      ) : hub ? (
        <ul className="value-list">
          {Object.entries(state.collections).map(([name, count]) => (
            <li key={name}>
              <code>{name}</code>
              <span>{count} document</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="event-empty">
          Nothing yet. The layer is introduced as changes arrive.
        </p>
      )}
      {state.customer?.embedding && <p className="event-note">Embedding abbreviated.</p>}
      <div className="event-panel-top value-section">
        <span className="eyebrow">WHAT IT UNLOCKS</span>
      </div>
      {state.value.length ? (
        <ul className="value-list unlocked">
          {state.value.map((item) => (
            <li key={item}>
              <Check size={12} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="event-empty">Follow the lesson: each capability appears here.</p>
      )}
    </aside>
  );
}
