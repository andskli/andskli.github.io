import { useEffect, useRef, useState } from 'react';
import AboutDialog from '../components/AboutDialog.tsx';
import AppHeader from '../components/navigation/AppHeader.tsx';
import {
  LessonSidebar,
  MobileLessonPicker,
} from '../components/navigation/LessonNavigation.tsx';
import {
  architectureLessons,
  lessonIds,
  modelingLessons,
} from '../learning/lesson-registry.ts';
import type { LessonId, Topology } from '../lessons/architecture/types.ts';
import type { ModelingId } from '../lessons/data-modeling/types.ts';
import ArchitectureView from './ArchitectureView.tsx';
import ModelingView from './ModelingView.tsx';
import { topologyNames } from './sections.ts';
export default function App() {
  const [modeling, setModeling] = useState<ModelingId | null>('documents');
  // null switches to architecture; remember where the Data modeling tab should return.
  const lastModeling = useRef<ModelingId>('documents');
  const [topology, setTopology] = useState<Topology>('sharded');
  const [lessonId, setLessonId] = useState<LessonId>('write');
  // A repeat click on the current lesson still restarts it, even though its ID is unchanged.
  const [revision, setRevision] = useState(0);
  const [documentsOpen, setDocumentsOpen] = useState(false),
    [components, setComponents] = useState(false),
    [about, setAbout] = useState(false);
  const isModeling = modeling !== null;
  function resetPanels() {
    setDocumentsOpen(false);
    setComponents(false);
    setRevision((value) => value + 1);
  }
  function chooseModeling(id: ModelingId) {
    lastModeling.current = id;
    setModeling(id);
    resetPanels();
  }
  function chooseTopology(value: Topology) {
    setModeling(null);
    setTopology(value);
    setLessonId('write');
    resetPanels();
  }
  function chooseLesson(id: string) {
    if (isModeling) chooseModeling(id as ModelingId);
    else {
      setLessonId(id as LessonId);
      resetPanels();
    }
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAbout(false);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const lessons = isModeling
    ? Object.values(modelingLessons)
    : lessonIds(topology).map((id) => architectureLessons[id]);
  const activeLesson = modeling ?? lessonId;
  const mobilePicker = (
    <MobileLessonPicker lessons={lessons} active={activeLesson} onSelect={chooseLesson} />
  );
  return (
    <div className="app-shell">
      <AppHeader
        modeling={isModeling}
        topology={topology}
        componentsOpen={components}
        onHome={() => chooseModeling('documents')}
        onModeling={() => chooseModeling(lastModeling.current)}
        onTopology={chooseTopology}
        onInspect={() =>
          isModeling
            ? setDocumentsOpen((value) => !value)
            : setComponents((value) => !value)
        }
        onAbout={() => setAbout(true)}
      />
      <div className="workspace">
        <LessonSidebar
          lessons={lessons}
          active={activeLesson}
          title={isModeling ? 'Data modeling' : topologyNames[topology]}
          modeling={isModeling}
          onSelect={chooseLesson}
          onAbout={() => setAbout(true)}
        />
        {/* Modeling starts fresh per lesson/revision, including local options and inspectors. */}
        {modeling && (
          <ModelingView
            key={modeling + '-' + revision}
            id={modeling}
            mobilePicker={mobilePicker}
            documentsOpen={documentsOpen}
            onCloseDocuments={() => setDocumentsOpen(false)}
            modalOpen={about}
          />
        )}
        {/* Keep architecture preferences mounted; the inactive view releases its 3D scene. */}
        <ArchitectureView
          active={!isModeling}
          topology={topology}
          lessonId={lessonId}
          revision={revision}
          components={components}
          setComponents={setComponents}
          about={about}
          mobilePicker={mobilePicker}
        />
      </div>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  );
}
