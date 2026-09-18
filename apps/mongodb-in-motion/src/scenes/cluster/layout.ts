import * as THREE from 'three';
import type { NodeId, Topology } from '../../lessons/architecture/types.ts';
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export function nodePositions(topology: Topology): Record<NodeId, THREE.Vector3> {
  const map: Record<NodeId, THREE.Vector3> = {
    app: vec(-13, 0, 6),
    r1: vec(-6.5, 0, 3),
    r2: vec(-8, 0, -1.5),
    a1: vec(0, 0, 6),
    a2: vec(4, 0, 3.7),
    a3: vec(5, 0, 8),
    b1: vec(10, 0, -1),
    b2: vec(14, 0, -3.4),
    b3: vec(15, 0, 1),
    c1: vec(-2, 0, -8),
    c2: vec(2, 0, -10.4),
    c3: vec(3, 0, -6),
  };
  if (topology === 'standalone') {
    map.app = vec(-5, 0, 0);
    map.a1 = vec(4, 0, 0);
  }
  if (topology === 'replica') {
    map.app = vec(-7, 0, 2);
    map.a1 = vec(1, 0, 2);
    map.a2 = vec(5, 0, -1);
    map.a3 = vec(6, 0, 5);
  }
  return map;
}
