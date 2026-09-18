import { useEffect } from 'react';
interface Options {
  disabled: boolean;
  play: () => void;
  seek: (index: number) => void;
  index: number;
  stepCount: number;
  onEscape: () => void;
  skipLinks?: boolean;
}
export function useLessonKeyboard({
  disabled,
  play,
  seek,
  index,
  stepCount,
  onEscape,
  skipLinks = true,
}: Options) {
  useEffect(() => {
    if (disabled) return;
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const interactive = [
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'BUTTON',
        ...(skipLinks ? ['A'] : []),
      ];
      if (skipLinks && event.key === 'Escape') {
        onEscape();
        return;
      }
      // Leave Space/arrows to focused controls (and native text editing).
      if (target.isContentEditable || interactive.includes(target.tagName)) return;
      if (event.key === 'Escape') onEscape();
      if (event.code === 'Space') {
        event.preventDefault();
        play();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        seek(Math.min(index + 1, stepCount - 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seek(Math.max(-1, index - 1));
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [disabled, play, seek, index, stepCount, onEscape, skipLinks]);
}
