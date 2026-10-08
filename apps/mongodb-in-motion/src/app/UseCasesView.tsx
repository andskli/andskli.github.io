import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Expand,
  Focus,
  Info,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import OdlInspector from '../components/inspectors/OdlInspector.tsx';
import OdlValuePanel from '../components/inspectors/OdlValuePanel.tsx';
import Timeline from '../components/playback/Timeline.tsx';
import TransportControls from '../components/playback/TransportControls.tsx';
import { buildUseCaseLesson, useCaseLessons } from '../learning/lesson-registry.ts';
import { SNAPSHOT_CHANGE_PROGRESS } from '../learning/playback.ts';
import { useLessonKeyboard } from '../learning/useLessonKeyboard.ts';
import { usePlayback } from '../learning/usePlayback.ts';
import { levelNames } from '../lessons/use-cases/odl/lesson.ts';
import { defaultLevel } from '../lessons/use-cases/odl/operations.ts';
import type { OdlLevel, Part, UseCaseId } from '../lessons/use-cases/types.ts';
import { OdlScene } from '../scenes/use-cases/OdlScene.ts';
import { useSceneMount } from '../scenes/shared/useSceneMount.ts';
import { updateRoute, useRoute } from './routes.ts';
import { useRouteStep } from './useRouteStep.ts';
const createUseCaseScene = (host: HTMLElement, select: (id: Part) => void) =>
  new OdlScene(host, select);

interface Props {
  id: UseCaseId;
  mobilePicker: ReactNode;
  valueOpen: boolean;
  modalOpen: boolean;
}
export default function UseCasesView({ id, mobilePicker, valueOpen, modalOpen }: Props) {
  const route = useRoute();
  const routeLevel = route.options.level ?? defaultLevel;
  const [level, setLevel] = useState<OdlLevel>(routeLevel);
  const definition = useCaseLessons[id];
  const lesson = useMemo(() => buildUseCaseLesson(id, level), [id, level]);
  const [initialIndex] = useState(() =>
    route.step ? lesson.steps.findIndex((step) => step.id === route.step) : -1,
  );
  const playback = usePlayback({
    steps: lesson.steps,
    durationMs: 4600,
    suspended: modalOpen,
    initialIndex,
  });
  const { index, progress, playing, speed, setSpeed, complete, play, seek, reset } =
    playback;
  useRouteStep(lesson.steps, index, seek);
  const [selected, setSelected] = useState<Part | null>(null),
    // Open when there is room. This scene is wide and tall, so a short window or a phone
    // keeps the panel closed rather than covering the source systems.
    [code, setCode] = useState(
      () => window.innerWidth > 800 && window.innerHeight >= 820,
    ),
    [copied, setCopied] = useState(false),
    // On a phone the full line-up is too small to read; start by following the action.
    [follow, setFollow] = useState(() => window.innerWidth < 650);
  const {
    hostRef,
    sceneRef,
    error: sceneError,
  } = useSceneMount(createUseCaseScene, (part: Part) => setSelected(part));
  const playbackRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const panel = playbackRef.current,
      stage = panel?.parentElement;
    if (!panel || !stage) return;
    // Description length and the option row change the card's height; feed its real
    // footprint to CSS so the code panel always sits above it.
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
  const step = lesson.steps[index] ?? null;
  // The model flips to the after snapshot when the animated event arrives.
  const state = step
    ? progress >= SNAPSHOT_CHANGE_PROGRESS
      ? step.after
      : step.before
    : lesson.steps[0].before;

  const panelOpen = selected !== null || valueOpen;
  useEffect(() => {
    // Leave room for whichever side panel is showing (inspector or event panel).
    sceneRef.current?.setInset(selected ? 360 : panelOpen ? 395 : 0);
  }, [selected, panelOpen]);
  useEffect(() => {
    sceneRef.current?.update({ state, step, progress, playing, selected, follow });
  }, [state, step, progress, playing, selected, follow]);
  useEffect(() => {
    // A pasted or history-navigated link can change the level without remounting.
    if (level === routeLevel) return;
    reset();
    setLevel(routeLevel);
  }, [routeLevel]);

  function restart(next: OdlLevel) {
    reset();
    setLevel(next);
    setSelected(null);
    updateRoute({ options: { ...route.options, level: next }, step: null });
  }
  useLessonKeyboard({
    disabled: modalOpen,
    play,
    seek,
    index,
    stepCount: lesson.steps.length,
    skipLinks: false,
    onEscape: () => {
      setSelected(null);
      setCode(false);
    },
  });
  const currentCode = step?.code ?? lesson.steps[0].code;
  async function copy() {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <main
      className={
        'stage features-stage use-cases-stage ' +
        (code ? 'has-code ' : '') +
        (selected ? 'has-inspector' : '')
      }
    >
      {mobilePicker}
      <div ref={hostRef} className="scene-host" />
      {sceneError && (
        <div className="graphics-error" role="alert">
          <Info />
          <h2>The 3D view couldn’t start</h2>
          <p>{sceneError}</p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload 3D view
          </button>
        </div>
      )}
      <div className="scene-intro">
        <div className="scene-kicker">
          <span className="live-dot" />
          USE CASES<span className="slash">/</span>
          <code>{lesson.collection}</code>
        </div>
        <h1>{lesson.heading}</h1>
        <p>{lesson.blurb}</p>
      </div>
      <div className="scene-toolbar" aria-label="Camera controls">
        <button
          className="icon-button"
          onClick={() => sceneRef.current?.home()}
          aria-label="Fit scene in view"
          title="Fit scene"
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
      <div className="scene-legend">
        <span>
          <i className="legend-request" />
          CDC
        </span>
        <span>
          <i className="legend-response" />
          Micro-batch
        </span>
        <span>
          <i className="legend-metadata" />
          Read
        </span>
        <span>
          <i className="legend-replication" />
          Write
        </span>
        <span className="legend-load" title="Load on each system of record">
          <i />
          Source load
        </span>
      </div>
      <div className="camera-hint">
        Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Select to inspect
      </div>
      {valueOpen && !selected && <OdlValuePanel state={state} />}
      {selected && (
        <OdlInspector
          id={selected}
          state={state}
          onClose={() => setSelected(null)}
          onFocus={() => sceneRef.current?.focus(selected)}
        />
      )}
      {code && (
        <section className="command-panel" aria-label="Lesson code">
          <header>
            <span>
              <Code2 size={15} /> CURRENT STEP · EXAMPLE
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
      <section ref={playbackRef} className="playback" aria-label="Lesson playback">
        <div className="playback-content">
          <div className="playback-story" aria-live="polite">
            <div className="step-eyebrow">
              <span>
                {complete
                  ? 'LESSON COMPLETE'
                  : index < 0
                    ? `USE CASE ${lesson.number}`
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
        {definition.levelOption && (
          <div className="read-settings stream-settings">
            <label>
              ODL level{' '}
              <select
                aria-label="ODL level"
                value={level}
                onChange={(e) => restart(e.target.value as OdlLevel)}
              >
                {(Object.keys(levelNames) as OdlLevel[]).map((value) => (
                  <option key={value} value={value}>
                    {levelNames[value]}
                  </option>
                ))}
              </select>
            </label>
            <span className="level-note">
              {level === 'read-only'
                ? 'A read replica for consumers; legacy stays the only writer'
                : level === 'enriched'
                  ? 'Adds context and provenance without touching upstream'
                  : 'Accepts writes to modernize step by step'}
            </span>
          </div>
        )}
        <Timeline steps={lesson.steps} playback={playback} label="Lesson stages" />
        <div className="transport">
          <TransportControls
            playback={playback}
            stepCount={lesson.steps.length}
            onReset={() => {
              reset();
              setSelected(null);
              sceneRef.current?.home();
              updateRoute({ step: null });
            }}
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
            <label className="follow-toggle">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => {
                  setFollow(e.target.checked);
                  if (!e.target.checked) sceneRef.current?.home();
                }}
              />
              <Focus size={14} />
              <span>Follow</span>
            </label>
            <label className="speed-picker">
              <span className="sr-only">Playback speed</span>
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
          </div>
        </div>
      </section>
    </main>
  );
}
