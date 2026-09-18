import { ChevronRight, ListTree, X } from 'lucide-react';
import type { IndexView, ModelingState } from '../../lessons/data-modeling/types.ts';
import { documentIcons } from './document-icons.ts';
export default function DocumentList({
  state,
  indexView,
  onClose,
  onSelect,
}: {
  state: ModelingState;
  indexView?: IndexView;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="component-list document-list" aria-label="Modeling documents">
      <div className="inspector-top">
        <span className="eyebrow">DOCUMENTS & VIEWS</span>
        <button className="icon-button" aria-label="Close documents" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <p>Inspect stored documents and the illustrated views.</p>
      {state.documents
        .filter((d) => d.scale > 0)
        .map((d) => {
          const Icon = documentIcons[d.kind];
          return (
            <button className="component-row" key={d.id} onClick={() => onSelect(d.id)}>
              <span className="component-mini">
                <Icon size={15} />
              </span>
              <span>
                <strong>{d.title}</strong>
                <small>
                  {d.collection} ·{' '}
                  {d.storage === 'view'
                    ? 'rendered response'
                    : d.storage === 'draft'
                      ? 'draft object'
                      : `_id: ${d.data._id}`}
                </small>
              </span>
              <ChevronRight size={14} />
            </button>
          );
        })}
      {indexView && (
        <button className="component-row" onClick={() => onSelect('@index')}>
          <span className="component-mini purple">
            <ListTree size={15} />
          </span>
          <span>
            <strong>Query index</strong>
            <small>
              {indexView.present ? indexView.name : 'No supporting index yet'}
            </small>
          </span>
          <ChevronRight size={14} />
        </button>
      )}
    </aside>
  );
}
