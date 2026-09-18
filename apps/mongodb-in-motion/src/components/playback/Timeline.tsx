import type { Playback } from '../../learning/usePlayback.ts';
export default function Timeline({
  steps,
  playback,
  label,
}: {
  steps: readonly { id: string; title: string }[];
  playback: Playback;
  label: string;
}) {
  const { index, progress, seek } = playback;
  return (
    <div className="timeline" aria-label={label}>
      {steps.map((s, i) => (
        <button
          key={s.id}
          className={
            i < index || (i === index && progress >= 1)
              ? 'done'
              : i === index
                ? 'current'
                : ''
          }
          aria-label={`Go to step ${i + 1}: ${s.title}`}
          onClick={() => seek(i)}
        >
          <span
            style={{
              width: i < index ? '100%' : i === index ? `${progress * 100}%` : '0%',
            }}
          />
        </button>
      ))}
    </div>
  );
}
