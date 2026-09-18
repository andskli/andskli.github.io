import {
  Check,
  ChevronRight,
  Code2,
  Copy,
  Expand,
  Focus,
  Info,
  Minus,
  Plus,
  Server,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Timeline from '../components/playback/Timeline.tsx';
import TransportControls from '../components/playback/TransportControls.tsx';
import { buildLesson } from '../learning/lesson-registry.ts';
import { SNAPSHOT_CHANGE_PROGRESS } from '../learning/playback.ts';
import { sourceLinks } from '../lessons/architecture/sources.ts';
import { nodeSet, nodeTitle, visibleNodes } from '../lessons/architecture/topology.ts';
import type {
  Concern,
  LessonId,
  NodeId,
  Topology,
} from '../lessons/architecture/types.ts';
import { ClusterScene } from '../scenes/cluster/ClusterScene.ts';
import { useSceneMount } from '../scenes/shared/useSceneMount.ts';
const createClusterScene = (host: HTMLElement, select: (id: NodeId) => void) =>
  new ClusterScene(host, select);

import type { ReactNode } from 'react';
import { Inspector } from '../components/inspectors/ComponentInspector.tsx';
import { architectureLessons } from '../learning/lesson-registry.ts';
import { useLessonKeyboard } from '../learning/useLessonKeyboard.ts';
import { usePlayback } from '../learning/usePlayback.ts';
import { titles, topologyNames } from './sections.ts';
interface Props {
  active: boolean;
  topology: Topology;
  lessonId: LessonId;
  revision: number;
  components: boolean;
  setComponents: (open: boolean) => void;
  about: boolean;
  mobilePicker: ReactNode;
}
export default function ArchitectureView({
  active,
  topology,
  lessonId,
  revision,
  components,
  setComponents,
  about,
  mobilePicker,
}: Props) {
  const isModeling = !active;
  const [concern, setConcern] = useState<Concern>('majority');
  const definition = architectureLessons[lessonId];
  const lesson = useMemo(
    () => buildLesson(lessonId, topology, concern),
    [lessonId, topology, concern],
  );
  const playback = usePlayback({
    steps: lesson.steps,
    durationMs: 3400,
    lessonKey: topology + '/' + lessonId + '/' + revision + '/' + active,
  });
  const { index, progress, playing, speed, setSpeed, complete, play, seek, reset } =
    playback;
  const [selected, setSelected] = useState<NodeId | null>(null),
    [code, setCode] = useState(false),
    [copied, setCopied] = useState(false),
    [follow, setFollow] = useState(false);
  const {
    hostRef: stageRef,
    sceneRef,
    error,
  } = useSceneMount(
    createClusterScene,
    (id: NodeId) => {
      setSelected(id);
      setComponents(false);
    },
    active,
  );
  const step = lesson.steps[index] ?? null;
  // Inspectors and tower labels switch together when the animated operation arrives.
  // Reuse the snapshot object itself: ClusterScene uses its identity to avoid rebuilding labels.
  const model = step
    ? progress >= SNAPSHOT_CHANGE_PROGRESS
      ? step.after
      : step.before
    : lesson.steps[0].before;
  const visible = visibleNodes(topology);
  useEffect(() => {
    setSelected(null);
    setCode(false);
    sceneRef.current?.home();
  }, [topology, lessonId, revision, active]);
  useEffect(() => {
    if (components) setSelected(null);
  }, [components]);

  useEffect(() => {
    sceneRef.current?.update({
      topology,
      model,
      step,
      progress,
      playing,
      annotations: definition.annotations?.(model) ?? {},
      selected,
      follow,
    });
  }, [topology, model, step, progress, playing, lessonId, selected, follow, isModeling]);

  useLessonKeyboard({
    disabled: !active || about,
    play,
    seek,
    index,
    stepCount: lesson.steps.length,
    skipLinks: false,
    onEscape: () => {
      setSelected(null);
      setComponents(false);
      setCode(false);
    },
  });
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(lesson.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  // Leave hooks mounted so read concern, speed and camera-follow preferences survive navigation.
  // useSceneMount(active) separately releases the canvas while this section is hidden.
  if (!active) return null;
  return (
    <main className={'stage ' + (selected ? 'has-inspector' : '')}>
      {mobilePicker}
      <div ref={stageRef} className="scene-host" />
      {error && (
        <div className="graphics-error" role="alert">
          <Info />
          <h2>The 3D view couldn’t start</h2>
          <p>{error}</p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload 3D view
          </button>
        </div>
      )}
      <div className="scene-intro">
        <div className="scene-kicker">
          <span className="live-dot" />
          {topologyNames[topology].toUpperCase()}
          <span className="slash">/</span>
          <code>shop.orders</code>
        </div>
        <h1>{titles[topology]}</h1>
        <p>
          {topology === 'sharded'
            ? 'Different shards. Replicated data. One connected system.'
            : topology === 'replica'
              ? 'Follow the copies, the votes, and the path back to your app.'
              : 'Meet the process that stores and serves your documents.'}
        </p>
      </div>
      <div className="scene-toolbar" aria-label="Camera controls">
        <button
          className="icon-button"
          onClick={() => sceneRef.current?.home()}
          aria-label="Fit cluster in view"
          title="Fit cluster"
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
          Request
        </span>
        <span>
          <i className="legend-response" />
          Response
        </span>
        <span>
          <i className="legend-replication" />
          Replication
        </span>
        <span>
          <i className="legend-metadata" />
          Metadata
        </span>
      </div>
      <div className="camera-hint">
        Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Select to inspect
      </div>
      {components && (
        <aside className="component-list" aria-label="Cluster components">
          <div className="inspector-top">
            <span className="eyebrow">CLUSTER COMPONENTS</span>
            <button
              className="icon-button"
              aria-label="Close components"
              onClick={() => setComponents(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p>Choose a process to inspect its role and data.</p>
          {visible.map((id) => (
            <button
              className="component-row"
              key={id}
              onClick={() => {
                setSelected(id);
                setComponents(false);
              }}
            >
              <span className={'component-mini ' + (id[0] === 'c' ? 'purple' : '')}>
                <Server size={15} />
              </span>
              <span>
                <strong>{nodeTitle(id)}</strong>
                <small>{nodeSet(id) ?? (id === 'app' ? 'Client' : 'Query router')}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
        </aside>
      )}
      {selected && (
        <Inspector
          id={selected}
          model={model}
          onClose={() => setSelected(null)}
          onFocus={() => sceneRef.current?.focus(selected)}
        />
      )}
      {code && (
        <section className="command-panel" aria-label="Lesson command">
          <header>
            <span>
              <Code2 size={15} />{' '}
              {lessonId === 'config' || lessonId === 'migrate' || lessonId === 'fail'
                ? 'SCENARIO NOTES'
                : 'MONGOSH EXAMPLE'}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Copy command"
                onClick={copyCommand}
              >
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
            <code>{lesson.command}</code>
          </pre>
        </section>
      )}
      <section className="playback" aria-label="Lesson playback">
        <div className="playback-content">
          <div className="playback-story" aria-live="polite">
            <div className="step-eyebrow">
              <span>
                {complete
                  ? 'LESSON COMPLETE'
                  : index < 0
                    ? `EXPERIMENT ${lesson.number}`
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
        {definition.readConcern && (
          <div className="read-settings">
            <span>
              Preference <code>secondary</code>
            </span>
            <label>
              Read concern{' '}
              <select
                aria-label="Read concern"
                value={concern}
                onChange={(e) => {
                  reset();
                  setConcern(e.target.value as Concern);
                }}
              >
                <option value="local">local</option>
                <option value="majority">majority</option>
              </select>
            </label>
            <a
              href={sourceLinks.concern}
              target="_blank"
              rel="noreferrer"
              aria-label="Read concern documentation"
            >
              <Info size={14} />
            </a>
          </div>
        )}
        <Timeline steps={lesson.steps} playback={playback} label="Lesson stages" />
        <div className="transport">
          <TransportControls
            playback={playback}
            stepCount={lesson.steps.length}
            onReset={reset}
          />
          <div className="transport-options">
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
