import { BookOpen, Braces, ExternalLink, X } from 'lucide-react';
import { formatData } from '../../lessons/data-modeling/format-data.ts';
import type {
  ModelingDocument,
  ModelingState,
} from '../../lessons/data-modeling/types.ts';
import { documentIcons } from './document-icons.ts';
export default function DocumentInspector({
  document,
  resultOpen,
  state,
  referenceResolution,
  source,
  onClose,
}: {
  document?: ModelingDocument;
  resultOpen: boolean;
  state: ModelingState;
  referenceResolution?: boolean;
  source: string;
  onClose: () => void;
}) {
  const SelectedIcon = document ? documentIcons[document.kind] : Braces;
  return (
    <aside
      className="inspector modeling-inspector"
      aria-label={resultOpen ? 'Query result' : `Document ${document!.title}`}
    >
      <div className="inspector-top">
        <span className="eyebrow">
          {resultOpen
            ? 'QUERY RESULT'
            : document?.storage === 'view'
              ? 'APPLICATION VIEW'
              : 'DOCUMENT INSPECTOR'}
        </span>
        <button
          className="icon-button"
          aria-label="Close document inspector"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-heading">
        <div className="component-icon">
          <SelectedIcon size={23} />
        </div>
        <div>
          <h2>{resultOpen ? 'Returned data' : document!.title}</h2>
          <p>
            {resultOpen
              ? 'Result of the illustrated operation'
              : `${document!.collection} · ${document!.storage === 'view' ? 'rendered response' : document!.storage === 'draft' ? 'not yet stored' : 'BSON document'}`}
          </p>
        </div>
      </div>
      {!resultOpen && document && (
        <p className="document-boundary">
          {document.storage === 'view'
            ? 'Data currently rendered by the application. This card is not a stored BSON document.'
            : document.storage === 'draft'
              ? 'An input object waiting to be embedded in the order.'
              : 'All fields below belong to this one document. Nested objects and arrays stay inside it.'}
        </p>
      )}
      <pre className="bson-preview">
        <code>{formatData(resultOpen ? state.resultData : document!.data)}</code>
      </pre>
      {!resultOpen && state.highlights.length > 0 && (
        <div className="field-key">
          Highlighted in 3D:{' '}
          <code>
            {state.highlights.filter((key) => key in document!.data).join(', ') || '—'}
          </code>
        </div>
      )}
      {resultOpen && referenceResolution && (
        <p className="document-boundary">
          Resolved customer data appears in the result. The stored order still contains
          customerId.
        </p>
      )}
      <div className="inspector-bottom">
        <span className="data-caption">Mongosh-style notation</span>
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          aria-label="Read data modeling documentation"
        >
          <BookOpen size={16} />
          <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  );
}
