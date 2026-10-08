import { useEffect, useRef } from 'react';
import { updateRoute, useRoute } from './routes.ts';

/**
 * Two-way binding between the URL's step segment and playback.
 * External URL changes seek playback; playback advances update the URL so the
 * address bar always points at what is on screen.
 */
export function useRouteStep(
  steps: readonly { id: string }[],
  index: number,
  seek: (index: number) => void,
) {
  const route = useRoute();
  const applied = useRef<string | null>(route.step);
  const activeStepId = index >= 0 ? (steps[index]?.id ?? null) : null;
  // URL -> playback. Only react to external changes, so a manual reset is not undone.
  useEffect(() => {
    if (route.step === applied.current) return;
    applied.current = route.step;
    if (!route.step) return;
    const target = steps.findIndex((step) => step.id === route.step);
    if (target >= 0 && target !== index) seek(target);
  }, [route.step, steps, index, seek]);
  // Playback -> URL.
  useEffect(() => {
    if (!activeStepId || route.step === activeStepId) return;
    updateRoute({ step: activeStepId });
  }, [activeStepId, route.step]);
}
