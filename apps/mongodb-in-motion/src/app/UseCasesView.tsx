import type { ReactNode } from 'react';
import { useMemo } from 'react';
import OdlInspector from '../components/inspectors/OdlInspector.tsx';
import OdlValuePanel from '../components/inspectors/OdlValuePanel.tsx';
import RagInspector from '../components/inspectors/RagInspector.tsx';
import RagValuePanel from '../components/inspectors/RagValuePanel.tsx';
import { useCaseLessons } from '../learning/lesson-registry.ts';
import { levelNames } from '../lessons/use-cases/odl/lesson.ts';
import { defaultLevel } from '../lessons/use-cases/odl/operations.ts';
import {
  embeddingNames,
  embeddingNotes,
  modeNames,
  modeNotes,
} from '../lessons/use-cases/rag/lesson.ts';
import { defaultEmbedding, defaultMode } from '../lessons/use-cases/rag/operations.ts';
import type { UseCaseId } from '../lessons/use-cases/types.ts';
import { OdlScene } from '../scenes/use-cases/OdlScene.ts';
import { RagScene } from '../scenes/use-cases/RagScene.ts';
import type { RagPart } from '../lessons/use-cases/rag/types.ts';
import type { Part } from '../lessons/use-cases/types.ts';
import { useRoute } from './routes.ts';
import UseCaseStage from './UseCaseStage.tsx';

// Module scope keeps the factories stable, so the 3D scene survives re-renders.
const createOdlScene = (host: HTMLElement, select: (id: Part) => void) =>
  new OdlScene(host, select);
const createRagScene = (host: HTMLElement, select: (id: RagPart) => void) =>
  new RagScene(host, select);

interface Props {
  id: UseCaseId;
  mobilePicker: ReactNode;
  valueOpen: boolean;
  modalOpen: boolean;
}
/** Picks the scene, panels and option for each use case; the stage does the rest. */
export default function UseCasesView({ id, ...shared }: Props) {
  return id === 'rag' ? <RagUseCase {...shared} /> : <OdlUseCase {...shared} />;
}
type Shared = Omit<Props, 'id'>;

function OdlUseCase(props: Shared) {
  const level = useRoute().options.level ?? defaultLevel;
  const lesson = useMemo(() => useCaseLessons.odl.build(level), [level]);
  return (
    <UseCaseStage
      {...props}
      lesson={lesson}
      createScene={createOdlScene}
      legend={[
        { dot: 'legend-request', label: 'CDC' },
        { dot: 'legend-response', label: 'Micro-batch' },
        { dot: 'legend-metadata', label: 'Read' },
        { dot: 'legend-replication', label: 'Write' },
        {
          className: 'legend-load',
          label: 'Source load',
          title: 'Load on each system of record',
        },
      ]}
      options={[
        {
          label: 'ODL level',
          routeKey: 'level',
          value: level,
          choices: levelNames,
          note:
            level === 'read-only'
              ? 'A read replica for consumers; legacy stays the only writer'
              : level === 'enriched'
                ? 'Adds context and provenance without touching upstream'
                : 'Accepts writes to modernize step by step',
        },
      ]}
      renderValue={(state) => <OdlValuePanel state={state} />}
      renderInspector={(inspector) => <OdlInspector {...inspector} />}
    />
  );
}

function RagUseCase(props: Shared) {
  const { options } = useRoute();
  const mode = options.retrieval ?? defaultMode;
  const embedding = options.embedding ?? defaultEmbedding;
  const lesson = useMemo(
    () => useCaseLessons.rag.build({ retrieval: mode, embedding }),
    [mode, embedding],
  );
  return (
    <UseCaseStage
      {...props}
      lesson={lesson}
      createScene={createRagScene}
      legend={[
        { dot: 'legend-request', label: 'Ingest' },
        { dot: 'legend-replication', label: 'Embed / generate' },
        { dot: 'legend-metadata', label: 'Query' },
        { dot: 'legend-response', label: 'Results' },
      ]}
      options={[
        {
          label: 'Embeddings',
          routeKey: 'embedding',
          value: embedding,
          choices: embeddingNames,
          note: embeddingNotes[embedding],
        },
        {
          label: 'Retrieval',
          routeKey: 'retrieval',
          value: mode,
          choices: modeNames,
          note: modeNotes[mode],
        },
      ]}
      renderValue={(state) => <RagValuePanel state={state} />}
      renderInspector={(inspector) => <RagInspector {...inspector} />}
    />
  );
}
