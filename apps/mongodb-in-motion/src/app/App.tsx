import { useEffect, useRef, useState } from 'react';
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
  useCaseLessons,
} from '../learning/lesson-registry.ts';
import type { LessonId, Topology } from '../lessons/architecture/types.ts';
import type { ModelingId } from '../lessons/data-modeling/types.ts';
import type { FeatureId } from '../lessons/features/types.ts';
import type { UseCaseId } from '../lessons/use-cases/types.ts';
import ArchitectureView from './ArchitectureView.tsx';
import FeaturesView from './FeaturesView.tsx';
import ModelingView from './ModelingView.tsx';
import UseCasesView from './UseCasesView.tsx';
import { defaultLessonFor, setRoute, useRoute } from './routes.ts';
import type { MainSection } from './sections.ts';
import { isTopology, topologyNames } from './sections.ts';
export default function App() {
  const route = useRoute();
  const section = route.section;
  // Remember the last lesson per section so a tab returns to where it was left.
  const remembered = useRef<Record<string, string>>({});
  const [topology, setTopology] = useState<Topology>('sharded');
  const [lessonId, setLessonId] = useState<LessonId>('write');
  // A repeat click on the current lesson still restarts it, even though its ID is unchanged.
  const [revision, setRevision] = useState(0);
  const [documentsOpen, setDocumentsOpen] = useState(false),
    [components, setComponents] = useState(false),
    // The event panel is a side panel; start it closed where it would cover the scene.
    [events, setEvents] = useState(() => window.innerWidth >= 1280),
    [valueOpen, setValueOpen] = useState(() => window.innerWidth >= 1280),
    [about, setAbout] = useState(false);
  const isModeling = section === 'modeling';
  const isFeatures = section === 'features';
  const isUseCases = section === 'use-cases';
  const activeTopology: Topology = isTopology(section) ? section : topology;
  const activeLessonId: LessonId = isTopology(section)
    ? (route.lesson as LessonId)
    : lessonId;
  useEffect(() => {
    remembered.current[route.section] = route.lesson;
    if (isTopology(route.section)) {
      setTopology(route.section);
      setLessonId(route.lesson as LessonId);
    }
  }, [route.section, route.lesson]);
  function resetPanels() {
    setDocumentsOpen(false);
    setComponents(false);
    setRevision((value) => value + 1);
  }
  function lessonFor(section: MainSection) {
    return remembered.current[section] ?? defaultLessonFor(section);
  }
  function chooseSection(value: MainSection) {
    setRoute({ section: value, lesson: lessonFor(value), step: null, options: {} });
    resetPanels();
  }
  function chooseLesson(id: string) {
    setRoute({ section, lesson: id, step: null, options: {} });
    resetPanels();
  }
  function toggleInspector() {
    if (isModeling) setDocumentsOpen((value) => !value);
    else if (isFeatures) setEvents((value) => !value);
    else if (isUseCases) setValueOpen((value) => !value);
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
      : isUseCases
        ? Object.values(useCaseLessons)
        : lessonIds(activeTopology).map((id) => architectureLessons[id]);
  const activeLesson = route.lesson;
  const mobilePicker = (
    <MobileLessonPicker lessons={lessons} active={activeLesson} onSelect={chooseLesson} />
  );
  return (
    <div className="app-shell">
      <AppHeader
        section={section}
        panelOpen={
          isModeling
            ? documentsOpen
            : isFeatures
              ? events
              : isUseCases
                ? valueOpen
                : components
        }
        onHome={() => {
          setRoute({ section: 'modeling', lesson: 'documents', step: null, options: {} });
          resetPanels();
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
                : isUseCases
                  ? 'Use cases'
                  : topologyNames[activeTopology]
          }
          modeling={isModeling}
          onSelect={chooseLesson}
          onAbout={() => setAbout(true)}
        />
        {/* Modeling and features start fresh per lesson/revision, including local options. */}
        {isModeling && (
          <ModelingView
            key={route.lesson + '-' + revision}
            id={route.lesson as ModelingId}
            mobilePicker={mobilePicker}
            documentsOpen={documentsOpen}
            onCloseDocuments={() => setDocumentsOpen(false)}
            modalOpen={about}
          />
        )}
        {isFeatures && (
          <FeaturesView
            key={route.lesson + '-' + revision}
            id={route.lesson as FeatureId}
            mobilePicker={mobilePicker}
            eventsOpen={events}
            modalOpen={about}
          />
        )}
        {isUseCases && (
          <UseCasesView
            key={route.lesson + '-' + revision}
            id={route.lesson as UseCaseId}
            mobilePicker={mobilePicker}
            valueOpen={valueOpen}
            modalOpen={about}
          />
        )}
        {/* Keep architecture preferences mounted; the inactive view releases its 3D scene. */}
        <ArchitectureView
          active={isTopology(section)}
          topology={activeTopology}
          lessonId={activeLessonId}
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
