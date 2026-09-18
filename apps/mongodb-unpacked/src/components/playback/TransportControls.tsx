import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { Playback } from '../../learning/usePlayback.ts';
export default function TransportControls({
  playback,
  stepCount,
  onReset,
}: {
  playback: Playback;
  stepCount: number;
  onReset: () => void;
}) {
  const { index, playing, complete, play, seek } = playback;
  return (
    <div className="transport-main">
      <button
        className="play-button"
        onClick={play}
        aria-label={
          playing
            ? 'Pause lesson'
            : complete
              ? 'Replay lesson'
              : index < 0
                ? 'Play lesson'
                : 'Resume lesson'
        }
      >
        {playing ? (
          <Pause size={17} fill="currentColor" />
        ) : complete ? (
          <RotateCcw size={17} />
        ) : (
          <Play size={17} fill="currentColor" />
        )}
        <span>
          {playing
            ? 'Pause'
            : complete
              ? 'Replay'
              : index < 0
                ? 'Play lesson'
                : 'Continue'}
        </span>
      </button>
      <button
        className="icon-button"
        aria-label="Previous step"
        disabled={index < 0}
        onClick={() => seek(Math.max(-1, index - 1))}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        className="icon-button"
        aria-label="Next step"
        disabled={complete}
        onClick={() => seek(Math.min(index + 1, stepCount - 1))}
      >
        <ChevronRight size={18} />
      </button>
      <span className="transport-divider" />
      <button
        className="icon-button reset-button"
        aria-label="Reset lesson"
        onClick={onReset}
      >
        <RotateCcw size={16} />
      </button>
    </div>
  );
}
