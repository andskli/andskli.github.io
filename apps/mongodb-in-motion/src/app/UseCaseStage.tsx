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
import { useEffect, useRef, useState } from 'react';
import Timeline from '../components/playback/Timeline.tsx';
import TransportControls from '../components/playback/TransportControls.tsx';
import { SNAPSHOT_CHANGE_PROGRESS } from '../learning/playback.ts';
import { useLessonKeyboard } from '../learning/useLessonKeyboard.ts';
import { usePlayback } from '../learning/usePlayback.ts';
import type { UseCaseLesson, UseCaseStep } from '../lessons/use-cases/types.ts';
import type { FlowFrame } from '../scenes/use-cases/FlowScene.ts';
import { useSceneMount } from '../scenes/shared/useSceneMount.ts';
import type { RouteOptions } from './routes.ts';
import { updateRoute, useRoute } from './routes.ts';
import { useRouteStep } from './useRouteStep.ts';

/** What the stage drives; FlowScene subclasses provide all of it. */
export interface StageScene<State, P extends string, Step> {
  update: (frame: FlowFrame<State, P, Step>) => void;
  setInset: (px: number) => void;
  home: () => void;
  zoomBy: (factor: number) => void;
  focus: (id: P) => void;
  dispose: () => void;
}
/** A lesson option shown as a select under the story, and pinned in the link. */
export interface StageOption<V extends string = string> {
  label: string;
  routeKey: keyof RouteOptions;
  value: V;
  choices: Record<V, string>;
  note: string;
}
/** A legend entry: a coloured dot class, or a class on the whole entry. */
export interface LegendItem {
  label: string;
  dot?: string;
  className?: string;
  title?: string;
}
interface Props<
  State,
  P extends string,
  Step extends UseCaseStep<State, P, { from: P; to: P; kind: string; label: string }>,
> {
  lesson: UseCaseLesson<Step>;
  /** Keep stable (declare at module scope): a new identity rebuilds the 3D scene. */
  createScene: (host: HTMLElement, select: (id: P) => void) => StageScene<State, P, Step>;
  legend: LegendItem[];
  /** Lesson options, each a select under the story; changing one restarts the lesson. */
  options?: StageOption[];
  renderValue: (state: State) => ReactNode;
  renderInspector: (props: {
    id: P;
    state: State;
    onClose: () => void;
    onFocus: () => void;
  }) => ReactNode;
  mobilePicker: ReactNode;
  valueOpen: boolean;
  modalOpen: boolean;
}

/**
 * The shared use-case page: scene, intro, code panel, playback, inspector and value
 * panel. Each lesson supplies its scene, panels and an optional option selector.
 */
export default function UseCaseStage<
  State,
  P extends string,
  Step extends UseCaseStep<State, P, { from: P; to: P; kind: string; label: string }>,
>({
  lesson,
  createScene,
  legend,
  options = [],
  renderValue,
  renderInspector,
  mobilePicker,
  valueOpen,
  modalOpen,
}: Props<State, P, Step>) {
  const route = useRoute();
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
  const [selected, setSelected] = useState<P | null>(null),
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
  } = useSceneMount(createScene, (part: P) => setSelected(part));
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
  // A changed option (from the select, a pasted link or history) rebuilds the lesson.
  const optionValue = options.map((option) => option.value).join('|');
  const firstOption = useRef(optionValue);
  useEffect(() => {
    if (firstOption.current === optionValue) return;
    firstOption.current = optionValue;
    reset();
    setSelected(null);
  }, [optionValue]);

  function restart(option: StageOption, next: string) {
    reset();
    setSelected(null);
    updateRoute({ options: { ...route.options, [option.routeKey]: next }, step: null });
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
        {legend.map((item) => (
          <span key={item.label} className={item.className} title={item.title}>
            <i className={item.dot} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="camera-hint">
        Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Select to inspect
      </div>
      {valueOpen && !selected && renderValue(state)}
      {selected &&
        renderInspector({
          id: selected,
          state,
          onClose: () => setSelected(null),
          onFocus: () => sceneRef.current?.focus(selected),
        })}
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
        {options.length > 0 && (
          <div className="read-settings stream-settings">
            {options.map((option) => (
              <label key={option.routeKey}>
                {option.label}{' '}
                <select
                  aria-label={option.label}
                  value={option.value}
                  onChange={(e) => restart(option, e.target.value)}
                >
                  {Object.keys(option.choices).map((value) => (
                    <option key={value} value={value}>
                      {option.choices[value]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <span className="level-note">
              {options.map((option) => option.note).join(' · ')}
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
