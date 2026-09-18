import {
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Expand,
  Info,
  Link2,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import DocumentInspector from '../components/inspectors/DocumentInspector.tsx';
import DocumentList from '../components/inspectors/DocumentList.tsx';
import IndexInspector from '../components/inspectors/IndexInspector.tsx';
import PracticeControls from '../components/playback/PracticeControls.tsx';
import Timeline from '../components/playback/Timeline.tsx';
import TransportControls from '../components/playback/TransportControls.tsx';
import { buildModelingLesson, modelingLessons } from '../learning/lesson-registry.ts';
import { SNAPSHOT_CHANGE_PROGRESS } from '../learning/playback.ts';
import { useLessonKeyboard } from '../learning/useLessonKeyboard.ts';
import { usePlayback } from '../learning/usePlayback.ts';
import type { ModelingId, ReferenceMode } from '../lessons/data-modeling/types.ts';
import { ModelingScene } from '../scenes/documents/ModelingScene.ts';
import { useSceneMount } from '../scenes/shared/useSceneMount.ts';
const createModelingScene = (host: HTMLElement, select: (id: string) => void) =>
  new ModelingScene(host, select);

interface Props {
  id: ModelingId;
  mobilePicker: ReactNode;
  documentsOpen: boolean;
  onCloseDocuments: () => void;
  modalOpen: boolean;
}
export default function ModelingView({
  id,
  mobilePicker,
  documentsOpen,
  onCloseDocuments,
  modalOpen,
}: Props) {
  const [mode, setMode] = useState<ReferenceMode>('application');
  const lesson = useMemo(() => buildModelingLesson(id, mode), [id, mode]);
  const definition = modelingLessons[id];
  const playback = usePlayback({
    steps: lesson.steps,
    durationMs: 5400,
    suspended: modalOpen,
  });
  const { index, progress, playing, speed, setSpeed, complete, play, seek, seekStep } =
    playback;
  const [indexOpen, setIndexOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [resultOpen, setResultOpen] = useState(false),
    [code, setCode] = useState(false),
    [copied, setCopied] = useState(false);
  const playbackRef = useRef<HTMLElement>(null);
  const selectRef = useRef((value: string) => {});
  selectRef.current = (value) => {
    // Reserved scene ID for the index board; it opens a different inspector from a document.
    setIndexOpen(value === '@index');
    setSelected(value === '@index' ? null : value);
    setResultOpen(false);
    onCloseDocuments();
  };
  const { hostRef, sceneRef, error } = useSceneMount(
    createModelingScene,
    (value: string) => selectRef.current(value),
  );
  const step = lesson.steps[index] ?? null;
  const state = step
    ? progress >= SNAPSHOT_CHANGE_PROGRESS
      ? step.after
      : step.before
    : lesson.steps[0].before;

  const document = state.documents.find((d) => d.id === selected && d.scale > 0);
  const currentCode = step?.code ?? lesson.steps[0].code;
  function reset() {
    playback.reset();
    setResultOpen(false);
    setIndexOpen(false);
    setSelected(null);
    sceneRef.current?.home();
  }

  useEffect(() => {
    const panel = playbackRef.current,
      stage = panel?.parentElement;
    if (!panel || !stage) return;
    // Lesson text and mobile wrapping change the transport panel's height. Feed its
    // actual footprint to CSS so practice overlays stay above the playback controls.
    const reserve = () =>
      stage.style.setProperty(
        '--playback-reserved',
        `${stage.clientHeight - panel.offsetTop}px`,
      );
    const observer = new ResizeObserver(reserve);
    observer.observe(panel);
    observer.observe(stage);
    reserve();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    sceneRef.current?.update({ lesson, step, state, progress, selected });
  }, [lesson, step, state, progress, selected]);
  useEffect(() => {
    // A card can disappear as it is embedded into another document; close its inspector too.
    if (!document) setSelected(null);
  }, [document]);
  useEffect(() => {
    if (documentsOpen) {
      setSelected(null);
      setResultOpen(false);
      setIndexOpen(false);
    }
  }, [documentsOpen]);
  useLessonKeyboard({
    disabled: modalOpen,
    play,
    seek,
    index,
    stepCount: lesson.steps.length,
    onEscape: () => {
      setIndexOpen(false);
      setSelected(null);
      setResultOpen(false);
      setCode(false);
      onCloseDocuments();
    },
  });
  async function copy() {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  const indexView = state.indexView,
    workload = state.workload;
  const practice = definition.layout === 'practice';

  return (
    <main
      className={
        'stage modeling-stage ' +
        (practice ? 'practice-stage ' : '') +
        (definition.referenceResolution ? 'reference-stage ' : '') +
        (document || resultOpen || indexOpen ? 'has-inspector' : '')
      }
    >
      {mobilePicker}
      <div className="scene-host modeling-host" ref={hostRef} />
      {error && (
        <div className="graphics-error" role="alert">
          <Info />
          <h2>The document view couldn’t start</h2>
          <p>{error}</p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload 3D view
          </button>
        </div>
      )}
      <div className="scene-intro">
        <div className="scene-kicker">
          <span className="live-dot" />
          DATA MODELING<span className="slash">/</span>
          <code>{lesson.collection}</code>
        </div>
        <h1>{lesson.heading}</h1>
        <p>{lesson.blurb}</p>
      </div>
      <div className="scene-toolbar" aria-label="Document camera controls">
        <button
          className="icon-button"
          onClick={() => sceneRef.current?.home()}
          aria-label="Fit documents in view"
          title="Fit documents"
        >
          <Expand size={17} />
        </button>
        <div />
        <button
          className="icon-button"
          onClick={() => sceneRef.current?.zoomBy(1.18)}
          aria-label="Zoom in"
        >
          <Plus size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => sceneRef.current?.zoomBy(0.85)}
          aria-label="Zoom out"
        >
          <Minus size={18} />
        </button>
      </div>
      <div className="modeling-proof" aria-live="polite">
        <span className="proof-dot" />
        <span>{state.result}</span>
        {state.resultData !== null && (
          <button
            onClick={() => {
              setResultOpen(true);
              setIndexOpen(false);
              setSelected(null);
              onCloseDocuments();
            }}
            aria-label="Inspect query result"
          >
            View result <ChevronRight size={13} />
          </button>
        )}
      </div>
      <div className="modeling-hint">Drag to orbit · Select a document to inspect</div>
      {documentsOpen && (
        <DocumentList
          state={state}
          indexView={indexView}
          onClose={onCloseDocuments}
          onSelect={(value) => selectRef.current(value)}
        />
      )}
      {(document || resultOpen) && (
        <DocumentInspector
          document={document}
          resultOpen={resultOpen}
          state={state}
          referenceResolution={definition.referenceResolution}
          source={lesson.source}
          onClose={() => {
            setSelected(null);
            setResultOpen(false);
          }}
        />
      )}
      {indexOpen && indexView && (
        <IndexInspector
          indexView={indexView}
          documents={state.documents}
          onClose={() => setIndexOpen(false)}
          onSelect={(value) => selectRef.current(value)}
        />
      )}
      {code && (
        <section
          className="command-panel modeling-code"
          aria-label="Modeling lesson code"
        >
          <header>
            <span>
              <Code2 size={15} /> CURRENT STEP · MONGOSH
            </span>
            <div>
              <button className="icon-button" aria-label="Copy command" onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                className="icon-button"
                aria-label="Close command"
                onClick={() => setCode(false)}
              >
                <X size={16} />
              </button>
            </div>
          </header>
          <pre>
            <code>{currentCode}</code>
          </pre>
        </section>
      )}
      <section
        ref={playbackRef}
        className="playback modeling-playback"
        aria-label="Data modeling lesson playback"
      >
        <div className="playback-content">
          <div className="playback-story" aria-live="polite">
            <div className="step-eyebrow">
              <span>
                {complete
                  ? 'LESSON COMPLETE'
                  : index < 0
                    ? `DATA MODELING ${lesson.number}`
                    : `STEP ${String(index + 1).padStart(2, '0')} / ${String(lesson.steps.length).padStart(2, '0')}`}
              </span>
              {playing && (
                <span className="playing-status">
                  <i />
                  IN MOTION
                </span>
              )}
            </div>
            <h2>
              {complete ? 'The idea to take with you' : (step?.title ?? lesson.name)}
            </h2>
            <p>{complete ? lesson.takeaway : (step?.description ?? lesson.blurb)}</p>
          </div>
          <button
            className={'code-toggle ' + (code ? 'active' : '')}
            onClick={() => setCode((c) => !c)}
            aria-label="Show lesson command"
          >
            <Code2 size={18} />
            <span>Code</span>
          </button>
        </div>
        {definition.referenceResolution && (
          <div className="read-settings reference-settings">
            <Link2 size={13} />
            <label>
              Resolve with{' '}
              <select
                aria-label="Reference resolution"
                value={mode}
                onChange={(e) => {
                  reset();
                  setMode(e.target.value as ReferenceMode);
                }}
              >
                <option value="application">Application reads</option>
                <option value="lookup">$lookup aggregation</option>
              </select>
            </label>
          </div>
        )}
        {practice && (
          <PracticeControls
            workload={workload}
            indexView={indexView}
            shortcuts={definition.shortcuts}
            stepId={step?.id}
            onSeek={seekStep}
            onInspectIndex={() => selectRef.current('@index')}
          />
        )}
        <Timeline
          steps={lesson.steps}
          playback={playback}
          label="Modeling lesson stages"
        />
        <div className="transport">
          <TransportControls
            playback={playback}
            stepCount={lesson.steps.length}
            onReset={reset}
          />
          <div className="transport-options">
            <a
              className="lesson-source"
              href={lesson.source}
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={13} />
              <span>Docs</span>
            </a>
            <select
              className="modeling-speed"
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </div>
        </div>
      </section>
    </main>
  );
}
