import { useEffect, useState } from 'react';
import AboutDialog from '../components/AboutDialog.tsx';
import AppHeader from '../components/navigation/AppHeader.tsx';
import {
  LessonSidebar,
  MobileLessonPicker,
} from '../components/navigation/LessonNavigation.tsx';
import {
  architectureLessons,
  featureLessons,
  lessonIds,
  modelingLessons,
} from '../learning/lesson-registry.ts';
import type { LessonId, Topology } from '../lessons/architecture/types.ts';
import type { ModelingId } from '../lessons/data-modeling/types.ts';
import type { FeatureId } from '../lessons/features/types.ts';
import ArchitectureView from './ArchitectureView.tsx';
import FeaturesView from './FeaturesView.tsx';
import ModelingView from './ModelingView.tsx';
import type { MainSection } from './sections.ts';
import { isTopology, topologyNames } from './sections.ts';
export default function App() {
  const [section, setSection] = useState<MainSection>('modeling');
  // Each section remembers its own selection, so returning to a tab restores the lesson.
  const [modeling, setModeling] = useState<ModelingId>('documents');
  const [feature, setFeature] = useState<FeatureId>('changeStreams');
  const [topology, setTopology] = useState<Topology>('sharded');
  const [lessonId, setLessonId] = useState<LessonId>('write');
  // A repeat click on the current lesson still restarts it, even though its ID is unchanged.
  const [revision, setRevision] = useState(0);
  const [documentsOpen, setDocumentsOpen] = useState(false),
    [components, setComponents] = useState(false),
    // The event panel is a side panel; start it closed where it would cover the scene.
    [events, setEvents] = useState(() => window.innerWidth >= 1280),
    [about, setAbout] = useState(false);
  const isModeling = section === 'modeling';
  const isFeatures = section === 'features';
  function resetPanels() {
    setDocumentsOpen(false);
    setComponents(false);
    setRevision((value) => value + 1);
  }
  function chooseSection(value: MainSection) {
    if (isTopology(value)) {
      setTopology(value);
      setLessonId('write');
    }
    setSection(value);
    resetPanels();
  }
  function chooseLesson(id: string) {
    if (isModeling) setModeling(id as ModelingId);
    else if (isFeatures) setFeature(id as FeatureId);
    else setLessonId(id as LessonId);
    resetPanels();
  }
  function toggleInspector() {
    if (isModeling) setDocumentsOpen((value) => !value);
    else if (isFeatures) setEvents((value) => !value);
    else setComponents((value) => !value);
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
    : isFeatures
      ? Object.values(featureLessons)
      : lessonIds(topology).map((id) => architectureLessons[id]);
  const activeLesson = isModeling ? modeling : isFeatures ? feature : lessonId;
  const mobilePicker = (
    <MobileLessonPicker lessons={lessons} active={activeLesson} onSelect={chooseLesson} />
  );
  return (
    <div className="app-shell">
      <AppHeader
        section={section}
        panelOpen={isModeling ? documentsOpen : isFeatures ? events : components}
        onHome={() => {
          setModeling('documents');
          chooseSection('modeling');
        }}
        onSection={chooseSection}
        onInspect={toggleInspector}
        onAbout={() => setAbout(true)}
      />
      <div className="workspace">
        <LessonSidebar
          lessons={lessons}
          active={activeLesson}
          title={
            isModeling
              ? 'Data modeling'
              : isFeatures
                ? 'Features'
                : topologyNames[topology]
          }
          modeling={isModeling}
          onSelect={chooseLesson}
          onAbout={() => setAbout(true)}
        />
        {/* Modeling and features start fresh per lesson/revision, including local options. */}
        {isModeling && (
          <ModelingView
            key={modeling + '-' + revision}
            id={modeling}
            mobilePicker={mobilePicker}
            documentsOpen={documentsOpen}
            onCloseDocuments={() => setDocumentsOpen(false)}
            modalOpen={about}
          />
        )}
        {isFeatures && (
          <FeaturesView
            key={feature + '-' + revision}
            id={feature}
            mobilePicker={mobilePicker}
            eventsOpen={events}
            modalOpen={about}
          />
        )}
        {/* Keep architecture preferences mounted; the inactive view releases its 3D scene. */}
        <ArchitectureView
          active={isTopology(section)}
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
