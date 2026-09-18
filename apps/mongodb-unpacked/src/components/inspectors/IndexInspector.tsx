import { BookOpen, ChevronRight, ExternalLink, ListTree, X } from 'lucide-react';
import { keyIdentity } from '../../lessons/data-modeling/indexes/operations.ts';
import { practiceSources } from '../../lessons/data-modeling/sources.ts';
import type { IndexView, ModelingDocument } from '../../lessons/data-modeling/types.ts';
export default function IndexInspector({
  indexView,
  documents,
  onClose,
  onSelect,
}: {
  indexView: IndexView;
  documents: ModelingDocument[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      className="inspector modeling-inspector index-inspector"
      aria-label="Query index inspector"
    >
      <div className="inspector-top">
        <span className="eyebrow">INDEX INSPECTOR</span>
        <button
          className="icon-button"
          aria-label="Close index inspector"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <div className="inspector-heading">
        <div className="component-icon purple">
          <ListTree size={23} />
        </div>
        <div>
          <h2>{indexView.present ? indexView.name : 'No supporting index'}</h2>
          <p>
            {indexView.present
              ? 'Logical keys and document locators'
              : 'The automatic _id index still exists'}
          </p>
        </div>
      </div>
      <div className="index-definition">
        <code>
          {'{ ' +
            indexView.fields.map((field) => JSON.stringify(field) + ': 1').join(', ') +
            ' }'}
        </code>
      </div>
      {indexView.present ? (
        <table className="index-entry-table">
          <thead>
            <tr>
              <th>Ordered key</th>
              <th>Document</th>
            </tr>
          </thead>
          <tbody>
            {indexView.entries.map((entry) => (
              <tr
                key={keyIdentity(entry)}
                className={
                  indexView.selectedKeys.includes(keyIdentity(entry))
                    ? 'key-selected'
                    : ''
                }
              >
                <td>
                  <code>
                    {entry.values.map((value) => JSON.stringify(value)).join(' · ')}
                  </code>
                </td>
                <td>
                  <button
                    onClick={() => onSelect(entry.documentId)}
                    aria-label={`Inspect index target ${documents.find((d) => d.id === entry.documentId)!.title}`}
                  >
                    #{String(documents.find((d) => d.id === entry.documentId)!.data._id)}
                    <ChevronRight size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="document-boundary">
          The category filter and price sort need a collection scan in the starting
          example. Step 3 builds the displayed compound index.
        </p>
      )}
      <p className="document-boundary">{indexView.note}</p>
      <p className="document-boundary">
        Counts are illustrative. This is a logical view; physical B-tree pages, cache
        behavior, and exact explain counters are omitted.
      </p>
      <div className="inspector-bottom">
        <span className="data-caption">Select a locator to inspect its document</span>
        <a
          href={
            indexView.name === 'tags_1'
              ? practiceSources.multikey
              : practiceSources.indexes
          }
          target="_blank"
          rel="noreferrer"
          aria-label="Index documentation"
        >
          <BookOpen size={16} />
          <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  );
}
