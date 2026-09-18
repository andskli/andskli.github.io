import { ListTree } from 'lucide-react';
import type { StepShortcut } from '../../learning/types.ts';
import type { IndexView, WorkloadView } from '../../lessons/data-modeling/types.ts';
export default function PracticeControls({
  workload,
  indexView,
  shortcuts,
  stepId,
  onSeek,
  onInspectIndex,
}: {
  workload?: WorkloadView;
  indexView?: IndexView;
  shortcuts?: StepShortcut[];
  stepId?: string;
  onSeek: (id: string) => void;
  onInspectIndex: () => void;
}) {
  return (
    <div className="practice-work">
      <div className="practice-counts" aria-label="Illustrative operation counts">
        {workload ? (
          <>
            <span>
              <strong>{workload.reads}</strong> {workload.reads === 1 ? 'read' : 'reads'}
            </span>
            <span>
              <strong>{workload.writes}</strong>{' '}
              {workload.writes === 1 ? 'write' : 'writes'}
            </span>
          </>
        ) : indexView?.documentWrites !== null &&
          indexView?.documentWrites !== undefined ? (
          <>
            <span>
              <strong>{indexView.documentWrites}</strong> doc write
            </span>
            <span>
              <strong>
                −{indexView.removedKeys} / +{indexView.addedKeys}
              </strong>{' '}
              keys
            </span>
          </>
        ) : (
          <>
            <span>
              <strong>{indexView?.documentsChecked ?? '—'}</strong> docs checked
            </span>
            <span>
              <strong>{indexView?.matchingKeys ?? '—'}</strong> matching keys
            </span>
          </>
        )}
        <small>Illustrative</small>
      </div>
      <div className="practice-actions">
        {shortcuts?.map((shortcut) => (
          <button
            key={shortcut.stepId}
            aria-pressed={stepId === shortcut.stepId}
            onClick={() => onSeek(shortcut.stepId)}
          >
            {shortcut.label}
          </button>
        ))}
        {indexView && (
          <button
            className="index-inspect-button"
            aria-label="Inspect index entries"
            onClick={onInspectIndex}
          >
            <ListTree size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
