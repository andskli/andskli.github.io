import type { Flow } from '../../lessons/architecture/types.ts';
export const C = {
  floor: 0xe9eee6,
  slab: 0xfafcf7,
  dark: 0x173e35,
  green: 0x39a978,
  mint: 0x9ae6b5,
  purple: 0x8a77b4,
  orange: 0xe8a65a,
  wire: 0xb9c8be,
};
export const flowColors: Record<Flow['kind'], number> = {
  request: 0x008d68,
  response: 0xdc8736,
  replication: 0x9670c5,
  metadata: 0x668bb7,
  migration: 0xda8c36,
};
