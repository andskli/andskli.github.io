import { useEffect, useRef, useState } from 'react';
interface DisposableScene {
  dispose: () => void;
}
/**
 * Bridge React's mount/unmount lifecycle to an imperative scene's dispose method.
 * Keep `create` stable (the views declare it at module scope): changing its identity
 * tears down the canvas and creates another scene, just like toggling `enabled`.
 */
export function useSceneMount<Scene extends DisposableScene, Selection>(
  create: (host: HTMLElement, select: (value: Selection) => void) => Scene,
  onSelect: (value: Selection) => void,
  enabled = true,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  // Native scene handlers outlive a React render; forward to the latest callback
  // without rebuilding the scene whenever selection or panel state changes.
  const selectionRef = useRef(onSelect);
  selectionRef.current = onSelect;
  const [error, setError] = useState('');
  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) return;
    // Renderers report WebGL context loss through the host, without depending on React.
    const fail = (event: Event) => setError((event as CustomEvent<string>).detail);
    host.addEventListener('scene-error', fail);
    try {
      sceneRef.current = create(host, (value) => selectionRef.current(value));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the 3D view.');
    }
    return () => {
      // Also runs during development StrictMode's mount/cleanup/remount cycle.
      host.removeEventListener('scene-error', fail);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [create, enabled]);
  return { hostRef, sceneRef, error };
}
