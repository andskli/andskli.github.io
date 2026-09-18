/** Every step owns its snapshots, so playback and rewind cannot mutate another step. */
export const clone = <T>(value: T): T => structuredClone(value);
