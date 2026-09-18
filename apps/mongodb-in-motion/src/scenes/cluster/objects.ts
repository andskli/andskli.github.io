import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { NodeId } from '../../lessons/architecture/types.ts';
import { C } from './palette.ts';
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export interface Tower {
  group: THREE.Group;
  body: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  label: HTMLElement;
  labelObject: CSS2DObject;
  tiles: THREE.Mesh[];
}
/** Procedural objects only: no playback, lesson selection, or rendering loop. */
export class ClusterObjects {
  world: THREE.Group;
  towers: Map<NodeId, Tower>;
  selection: (id: NodeId) => void;
  focus: (id: NodeId) => void;
  constructor(
    world: THREE.Group,
    towers: Map<NodeId, Tower>,
    selection: (id: NodeId) => void,
    focus: (id: NodeId) => void,
  ) {
    this.world = world;
    this.towers = towers;
    this.selection = selection;
    this.focus = focus;
  }
  mat(color: number, roughness = 0.7) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.025 });
  }
  box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number | THREE.MeshStandardMaterial,
    r = 0.08,
  ) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, r),
      typeof color === 'number' ? this.mat(color) : color,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  label(parent: THREE.Object3D, html: string, className: string, pos: THREE.Vector3) {
    const div = document.createElement('div');
    div.className = className;
    div.innerHTML = html;
    const obj = new CSS2DObject(div);
    obj.position.copy(pos);
    parent.add(obj);
    return { div, obj };
  }
  platform(
    name: string,
    subtitle: string,
    x: number,
    z: number,
    w: number,
    d: number,
    type: 'shard' | 'config' | 'app' | 'router',
  ) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.world.add(g);
    this.box(g, w, 0.42, d, 0, 0.12, 0, 0xc9d7cc, 0.16);
    this.box(g, w - 0.15, 0.12, d - 0.15, 0, 0.39, 0, C.slab, 0.12);
    const accent = type === 'config' ? C.purple : type === 'shard' ? C.green : 0x96b1a7;
    this.box(g, w - 0.7, 0.055, 0.065, 0, 0.47, d / 2 - 0.4, accent, 0.02);
    for (let i = 0; i < 4; i++)
      this.box(
        g,
        0.1,
        0.035,
        0.55,
        -w / 2 + 0.5 + i * 0.26,
        0.46,
        -d / 2 + 0.5,
        0xd8e2d8,
        0.01,
      );
    if (type === 'shard' || type === 'config') {
      const { div } = this.label(
        g,
        `<strong>${name}</strong><span>${subtitle}</span>`,
        'island-label',
        vec(0, 0.45, d / 2 + 0.45),
      );
      div.dataset.group = type;
    }
    return g;
  }
  server(id: NodeId, pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.nodeId = id;
    this.world.add(g);
    const config = id[0] === 'c',
      body = this.mat(0xeef3e9),
      accent = this.mat(config ? C.purple : C.green);
    this.box(g, 1.9, 0.16, 1.85, 0, 0.56, 0, 0xe0e8dd, 0.1);
    const main = this.box(g, 1.35, 2.15, 1.16, 0, 1.74, 0, body, 0.13);
    main.userData.nodeId = id;
    this.box(g, 1.43, 0.2, 1.24, 0, 2.8, 0, accent, 0.06);
    this.box(g, 0.97, 1.47, 0.035, 0, 1.68, 0.591, C.dark, 0.015);
    for (let k = 0; k < 4; k++) {
      this.box(g, 0.76, 0.17, 0.045, -0.025, 2.2 - k * 0.32, 0.625, 0x34594d, 0.015);
      this.box(
        g,
        0.055,
        0.055,
        0.025,
        0.285,
        2.2 - k * 0.32,
        0.66,
        config ? 0xbfb0df : 0x9df0b8,
        0.01,
      );
    }
    for (let k = 0; k < 5; k++)
      this.box(g, 0.018, 0.95, 0.045, 0.683, 1.7, -0.34 + k * 0.15, 0xcbd7c8, 0.005);
    this.box(g, 0.08, 1.9, 0.08, -0.57, 1.7, 0.65, accent, 0.018);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.13, 0.045, 8, 60),
      new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.56;
    g.add(ring);
    const tiles: THREE.Mesh[] = [];
    for (let k = 0; k < 7; k++) {
      const tile = this.box(
        g,
        0.58,
        0.1,
        0.43,
        0.92 + (k % 2) * 0.25,
        0.63 + Math.floor(k / 2) * 0.14,
        -0.35 + (k % 2) * 0.4,
        config ? 0xc1b5dc : id[0] === 'a' ? 0xe9b76c : 0x93c5b2,
        0.035,
      );
      tile.visible = k < 3;
      tiles.push(tile);
    }
    const { div, obj } = this.label(g, '', 'process-label', vec(0, 3.55, 0));
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selection(id);
    });
    div.addEventListener('dblclick', () => this.focus(id));
    this.towers.set(id, {
      group: g,
      body,
      accent,
      ring,
      label: div,
      labelObject: obj,
      tiles,
    });
  }
  router(id: NodeId, pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.nodeId = id;
    this.world.add(g);
    const body = this.mat(C.dark),
      accent = this.mat(C.green);
    this.box(g, 2.3, 0.45, 1.8, 0, 0.8, 0, body, 0.16);
    this.box(g, 2.15, 0.16, 1.65, 0, 1.1, 0, 0x477162, 0.06);
    for (let i = 0; i < 3; i++)
      this.box(g, 0.4, 0.16, 0.2, -0.65 + i * 0.65, 0.86, 0.92, 0x96d6b0, 0.025);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 0.45, 48),
      this.mat(0xe4efe0),
    );
    core.position.set(0, 1.42, 0);
    core.castShadow = true;
    g.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.085, 12, 48), accent);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 1.43;
    g.add(halo);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.04, 8, 60),
      new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.56;
    g.add(ring);
    const { div, obj } = this.label(g, '', 'process-label router-label', vec(0, 2.55, 0));
    div.addEventListener('click', () => this.selection(id));
    this.towers.set(id, {
      group: g,
      body,
      accent,
      ring,
      label: div,
      labelObject: obj,
      tiles: [],
    });
  }
  application(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.nodeId = 'app';
    this.world.add(g);
    const body = this.mat(C.dark),
      accent = this.mat(C.green);
    this.box(g, 2.6, 0.15, 1.55, 0, 0.63, 0.2, 0x597d6c, 0.07);
    this.box(g, 2.45, 1.6, 0.15, 0, 1.51, -0.32, body, 0.07);
    this.box(g, 2.12, 1.24, 0.025, 0, 1.54, -0.23, 0x8fcdb0, 0.025);
    for (let k = 0; k < 4; k++)
      this.box(
        g,
        k === 0 ? 1.15 : 0.75,
        0.08,
        0.025,
        -0.3 + (k % 2) * 0.2,
        1.9 - k * 0.24,
        -0.2,
        k === 0 ? 0xe2f8cf : 0x316b52,
        0.015,
      );
    for (let k = 0; k < 6; k++)
      this.box(g, 0.23, 0.025, 0.4, -0.87 + k * 0.35, 0.73, 0.45, 0xb5c7b6, 0.025);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.04, 8, 60),
      new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.56;
    g.add(ring);
    const { div, obj } = this.label(g, '', 'process-label app-label', vec(0, 2.85, 0));
    div.addEventListener('click', () => this.selection('app'));
    this.towers.set('app', {
      group: g,
      body,
      accent,
      ring,
      label: div,
      labelObject: obj,
      tiles: [],
    });
  }
}
