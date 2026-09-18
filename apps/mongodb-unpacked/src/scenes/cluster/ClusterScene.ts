import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { nodeTitle, visibleNodes } from '../../lessons/architecture/topology.ts';
import type {
  Flow,
  Model,
  NodeId,
  Step,
  Topology,
} from '../../lessons/architecture/types.ts';
import { disposeObjectTree } from '../shared/resources.ts';
import { nodePositions } from './layout.ts';
import type { Tower } from './objects.ts';
import { ClusterObjects } from './objects.ts';
import { C, flowColors } from './palette.ts';

export interface SceneFrame {
  topology: Topology;
  model: Model;
  step: Step | null;
  progress: number;
  playing: boolean;
  annotations: Partial<Record<NodeId, string>>;
  selected: NodeId | null;
  follow: boolean;
}

interface Route {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  active: THREE.Mesh;
  from: NodeId;
  to: NodeId;
  base: boolean;
}

const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Render immutable frames supplied by ArchitectureView. update() accepts lesson state;
 * the independent RAF loop draws packets, camera motion and DOM labels. It never
 * advances the lesson clock, so orbit/zoom remain responsive while playback is paused.
 */
export class ClusterScene {
  renderer: THREE.WebGLRenderer;
  labels = new CSS2DRenderer();
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  container: HTMLElement;
  world = new THREE.Group();
  network = new THREE.Group();
  particles = new THREE.Group();
  towers = new Map<NodeId, Tower>();
  routes = new Map<string, Route>();
  frame: SceneFrame | null = null;
  topology: Topology = 'sharded';
  raf = 0;
  resizeObserver: ResizeObserver;
  positions = nodePositions('sharded');
  selection: (id: NodeId) => void;
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  pointerDown = { x: 0, y: 0 };
  animationTarget: THREE.Vector3 | null = null;
  targetZoom = 1;
  baseZoom = 1;
  lastTime = 0;
  disposed = false;
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  lastModel: Model | null = null;
  lastStep: Step | null = null;
  lastSelected: NodeId | null = null;
  packets: THREE.Mesh[] = [];
  packetGeometry = new THREE.SphereGeometry(0.115, 12, 8);
  floor: THREE.Mesh;
  objects: ClusterObjects;
  constructor(container: HTMLElement, select: (id: NodeId) => void) {
    this.container = container;
    this.selection = select;
    this.objects = new ClusterObjects(this.world, this.towers, select, (id) =>
      this.focus(id),
    );
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    // Limit the cost of shadows and canvas rendering on high-DPI displays.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.domElement.className = 'world-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D MongoDB cluster. Drag to orbit, scroll to zoom, or select a labeled process.',
    );
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    container.append(this.renderer.domElement);
    this.labels.domElement.className = 'world-labels';
    container.append(this.labels.domElement);
    this.scene.background = new THREE.Color(C.floor);
    this.scene.fog = new THREE.Fog(C.floor, 75, 160);
    this.camera = new THREE.OrthographicCamera(-20, 20, 16, -16, 0.1, 200);
    this.camera.position.set(29, 35, 41);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.target.set(0, 0, -1);
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 3.5;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.44;
    this.controls.enablePan = true;
    this.controls.addEventListener('start', () => {
      // A user gesture takes over from an in-progress home/focus camera animation.
      this.animationTarget = null;
      this.targetZoom = this.camera.zoom;
    });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa1b8a4, 2.6));
    const sun = new THREE.DirectionalLight(0xfffaf0, 4);
    sun.position.set(-12, 28, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -32,
      right: 32,
      top: 30,
      bottom: -30,
      near: 1,
      far: 90,
    });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc8e9f3, 1.4);
    fill.position.set(18, 10, -20);
    this.scene.add(fill);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: C.floor, roughness: 1 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.25;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    const grid = new THREE.GridHelper(120, 100, 0xc7d3c7, 0xd1dcd0);
    grid.position.y = -0.24;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.48;
    this.scene.add(grid);
    this.scene.add(this.world, this.network, this.particles);
    // Reuse a bounded set of visual markers instead of allocating meshes every frame.
    // These illustrate message direction, not a count of real network packets.
    for (let i = 0; i < 16; i++) {
      const p = new THREE.Mesh(
        this.packetGeometry,
        new THREE.MeshStandardMaterial({
          color: C.green,
          emissive: C.green,
          emissiveIntensity: 0.4,
          roughness: 0.3,
        }),
      );
      p.visible = false;
      this.particles.add(p);
      this.packets.push(p);
    }
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.build();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.home();
    this.animate(0);
  }
  contextLost = (e: Event) => {
    e.preventDefault();
    this.container.dispatchEvent(
      new CustomEvent('scene-error', {
        detail: 'Graphics paused. Reload the page to restore the 3D view.',
      }),
    );
  };

  /** Rebuild topology geometry; ordinary lesson steps reuse the existing towers/routes. */
  build() {
    disposeObjectTree(this.world);
    disposeObjectTree(this.network);
    this.routes.clear();
    this.towers.clear();
    this.positions = nodePositions(this.topology);
    if (this.topology === 'sharded') {
      this.objects.platform('SHARD A', 'Replica set · rs-a', 2.6, 6, 9.2, 8.2, 'shard');
      this.objects.platform('SHARD B', 'Replica set · rs-b', 12.6, -1, 9.2, 8.2, 'shard');
      this.objects.platform(
        'CONFIG SERVERS',
        'Metadata replica set · cfg-rs',
        0.6,
        -8,
        9.2,
        8.2,
        'config',
      );
      this.objects.platform('', '', -7.2, 0.8, 4.5, 8.7, 'router');
      this.objects.platform('', '', -13, 6, 4.3, 4.3, 'app');
    } else if (this.topology === 'replica') {
      this.objects.platform(
        'REPLICA SET',
        'One dataset · three members',
        3.7,
        2,
        10.2,
        11,
        'shard',
      );
      this.objects.platform('', '', -7, 2, 4.3, 4.3, 'app');
    } else {
      this.objects.platform(
        'MONGOD',
        'One server · local storage',
        4,
        0,
        6.1,
        5.8,
        'shard',
      );
      this.objects.platform('', '', -5, 0, 4.3, 4.3, 'app');
    }
    for (const id of visibleNodes(this.topology)) {
      if (id === 'app') this.objects.application(this.positions[id]);
      else if (id[0] === 'r') this.objects.router(id, this.positions[id]);
      else this.objects.server(id, this.positions[id]);
    }
    const primary = this.frame?.model.primary ?? 'a1';
    const connections: [NodeId, NodeId, Flow['kind']][] =
      this.topology === 'sharded'
        ? [
            ['app', 'r1', 'request'],
            ['app', 'r2', 'request'],
            ['r1', primary, 'request'],
            ['r1', 'b1', 'request'],
            ['r1', 'c1', 'metadata'],
            [primary, primary === 'a1' ? 'a2' : 'a1', 'replication'],
            [primary, 'a3', 'replication'],
            ['b1', 'b2', 'replication'],
            ['b1', 'b3', 'replication'],
            ['c1', 'c2', 'metadata'],
            ['c1', 'c3', 'metadata'],
          ]
        : this.topology === 'replica'
          ? [
              ['app', primary, 'request'],
              [primary, primary === 'a1' ? 'a2' : 'a1', 'replication'],
              [primary, 'a3', 'replication'],
            ]
          : [['app', 'a1', 'request']];
    connections.forEach(([from, to, kind]) => this.getRoute(from, to, kind, true));
    this.lastModel = null;
    this.lastStep = null;
  }
  getRoute(
    from: NodeId,
    to: NodeId,
    kind: Flow['kind'],
    base = false,
  ): { route: Route; reverse: boolean } {
    // A request and its response share one curve. Callers reverse the travel direction
    // rather than creating an overlapping route for the opposite endpoint order.
    const key = from + '-' + to,
      reverseKey = to + '-' + from;
    if (this.routes.has(key)) return { route: this.routes.get(key)!, reverse: false };
    if (this.routes.has(reverseKey))
      return { route: this.routes.get(reverseKey)!, reverse: true };
    const start = this.positions[from].clone(),
      end = this.positions[to].clone();
    start.y = 0.68;
    end.y = 0.68;
    const internal = from[0] === to[0] && from !== 'app';
    const delta = end.clone().sub(start),
      len = delta.length();
    let points: THREE.Vector3[];
    if (internal) {
      const mid = start.clone().lerp(end, 0.5);
      mid.y = 0.76;
      points = [
        start,
        start.clone().lerp(mid, 0.6),
        mid,
        mid.clone().lerp(end, 0.5),
        end,
      ];
    } else {
      const midX = (start.x + end.x) / 2;
      points = [
        start,
        vec(start.x + Math.sign(delta.x) * Math.min(1, len * 0.14), 0.65, start.z),
        vec(midX, 0.58, start.z),
        vec(midX, 0.58, end.z),
        vec(end.x - Math.sign(delta.x) * Math.min(1, len * 0.14), 0.65, end.z),
        end,
      ];
    }
    // Aligned endpoints can produce duplicate control points, which distort the spline.
    points = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 0.05);
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
    const material = new THREE.MeshStandardMaterial({
      color: internal ? (kind === 'metadata' ? 0xc8bfd6 : 0xb9c5c4) : C.wire,
      roughness: 0.65,
      transparent: true,
      opacity: base ? 0.9 : 0.35,
    });
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 60, internal ? 0.047 : 0.068, 7, false),
      material,
    );
    mesh.castShadow = true;
    this.network.add(mesh);
    const active = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 60, internal ? 0.068 : 0.093, 7, false),
      new THREE.MeshStandardMaterial({
        color: flowColors[kind],
        emissive: flowColors[kind],
        emissiveIntensity: 0.15,
        roughness: 0.4,
        transparent: true,
        opacity: 0.9,
      }),
    );
    active.visible = false;
    this.network.add(active);
    const route = { curve, mesh, active, from, to, base };
    this.routes.set(key, route);
    return { route, reverse: false };
  }
  update(frame: SceneFrame) {
    const topologyChanged = frame.topology !== this.topology;
    this.frame = frame;
    if (topologyChanged) {
      this.topology = frame.topology;
      this.build();
      this.home();
    }
    // Follow once on entering a step, so it does not fight the user's camera gestures.
    if (frame.step !== this.lastStep) {
      if (frame.follow && frame.step?.focus.length) {
        const center = new THREE.Vector3();
        frame.step.focus.forEach((id) => center.add(this.positions[id]));
        center.divideScalar(frame.step.focus.length);
        this.animationTarget = center;
        this.targetZoom = this.topology === 'sharded' ? 1.18 : 1.04;
      }
      this.lastStep = frame.step;
    }
    // Snapshot identity is the invalidation signal. Mutating a published model in place
    // would leave labels stale; lesson builders must continue to produce fresh snapshots.
    if (frame.model !== this.lastModel || frame.selected !== this.lastSelected) {
      this.updateMembers();
      this.lastModel = frame.model;
      this.lastSelected = frame.selected;
    }
  }
  updateMembers() {
    if (!this.frame) return;
    const { model, selected, annotations } = this.frame;
    for (const [id, tower] of this.towers) {
      const member = model.members[id],
        offline = member && !member.alive;
      if (member) {
        tower.body.color.setHex(offline ? 0xa7b3aa : 0xeef3e9);
        tower.accent.color.setHex(
          offline ? 0x829389 : id[0] === 'c' ? C.purple : C.green,
        );
        tower.group.scale.y = offline ? 0.94 : 1;
        tower.tiles.forEach(
          (m, i) => (m.visible = id[0] === 'c' ? i < 3 : i < member.docs.length),
        );
      }
      let role =
        id === 'app'
          ? 'MongoDB driver'
          : id[0] === 'r'
            ? 'Query router'
            : offline
              ? 'Offline'
              : (member?.role ?? '');
      const annotation = annotations[id];
      const meta = annotation ? '<em class="label-value"></em>' : '';
      tower.label.dataset.node = id;
      tower.label.classList.toggle('is-selected', selected === id);
      tower.label.classList.toggle('is-offline', !!offline);
      tower.label.classList.toggle('is-secondary', role === 'Secondary');
      tower.label.innerHTML = `<button type="button" aria-label="Inspect ${nodeTitle(id)}, ${role}"><span class="node-name">${nodeTitle(id)}</span><span class="node-role ${role === 'Primary' ? 'primary' : ''} ${offline ? 'offline' : ''}"><i></i>${role}</span>${meta}</button>`;
      // Keep lesson text out of HTML interpolation.
      const valueLabel = tower.label.querySelector('.label-value');
      if (valueLabel) valueLabel.textContent = annotation ?? '';
    }
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    // Fit both a minimum scene height and its full width, including narrow viewports.
    const aspect = w / h,
      height = Math.max(
        this.topology === 'sharded' ? 31 : 22,
        (this.topology === 'sharded' ? 36 : 26) / aspect,
      );
    this.camera.left = (-height * aspect) / 2;
    this.camera.right = (height * aspect) / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.setViewOffset(w, h, 0, w > 800 ? h * 0.095 : h * 0.07, w, h);
    this.camera.updateProjectionMatrix();
  }
  home() {
    this.animationTarget =
      this.topology === 'sharded'
        ? vec(0, 0, -1)
        : this.topology === 'replica'
          ? vec(1, 0, 1)
          : vec(0, 0, 0);
    this.targetZoom = this.topology === 'sharded' ? 1.1 : 1;
    this.camera.position.copy(
      this.animationTarget
        .clone()
        .add(this.container.clientWidth < 650 ? vec(44, 44, 8) : vec(29, 35, 41)),
    );
    this.resize();
  }
  focus(id: NodeId) {
    this.animationTarget = this.positions[id].clone();
    this.targetZoom = this.topology === 'sharded' ? 1.6 : 1.3;
  }
  zoomBy(factor: number) {
    this.targetZoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.5, 3.5);
    this.animationTarget = this.controls.target.clone();
  }
  onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY };
  };
  onPointerUp = (e: PointerEvent) => {
    // OrbitControls shares the canvas: releasing a drag must not select a process.
    if (Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y) > 6)
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.world.children, true);
    for (const hit of hits) {
      // A hit may be a decorative child mesh; the owning group carries the process ID.
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.nodeId) {
          this.selection(obj.userData.nodeId);
          return;
        }
        obj = obj.parent;
      }
    }
  };
  animate = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    if (this.animationTarget) {
      // Exponential easing keeps camera motion consistent across display frame rates.
      // Reduced motion snaps the camera and hides traveling markers, retaining state cues.
      const alpha = this.reduced ? 1 : 1 - Math.exp(-5 * dt);
      const diff = this.animationTarget
        .clone()
        .sub(this.controls.target)
        .multiplyScalar(alpha);
      this.controls.target.add(diff);
      this.camera.position.add(diff);
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, this.targetZoom, alpha);
      this.camera.updateProjectionMatrix();
    }
    this.controls.update();
    // Re-derive transient visibility every frame so seeking cannot leave an old flow lit.
    this.routes.forEach((r) => {
      r.active.visible = false;
      r.mesh.visible = r.base;
    });
    this.packets.forEach((p) => (p.visible = false));
    if (this.frame) {
      const { step, progress, selected, model } = this.frame;
      const focus = step?.focus ?? [];
      this.towers.forEach((tower, id) => {
        const active = focus.includes(id) || selected === id;
        const mat = tower.ring.material as THREE.MeshBasicMaterial;
        mat.opacity = active ? 0.8 : 0;
        mat.color.setHex(
          model.members[id]?.alive === false
            ? 0xd67c49
            : id[0] === 'c'
              ? C.purple
              : C.green,
        );
      });
      let count = 0;
      for (const flow of step?.flows ?? []) {
        const { route, reverse } = this.getRoute(flow.from, flow.to, flow.kind);
        route.mesh.visible = true;
        route.active.visible = true;
        const mat = route.active.material as THREE.MeshStandardMaterial;
        mat.color.setHex(flowColors[flow.kind]);
        mat.emissive.setHex(flowColors[flow.kind]);
        // The leading marker arrives at SNAPSHOT_CHANGE_PROGRESS (0.76); the tail is decorative.
        for (let trail = 0; trail < 3 && count < this.packets.length; trail++) {
          const p = progress / 0.76 - trail * 0.065;
          if (p < 0 || p > 1) continue;
          const packet = this.packets[count++];
          packet.visible = !this.reduced;
          packet.position.copy(route.curve.getPoint(reverse ? 1 - p : p));
          packet.position.y += 0.075;
          packet.scale.setScalar(trail ? 1 - trail * 0.22 : 1.15);
          const pm = packet.material as THREE.MeshStandardMaterial;
          pm.color.setHex(flowColors[flow.kind]);
          pm.emissive.setHex(flowColors[flow.kind]);
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
    // CSS2D labels live in a DOM overlay and need the same camera update as WebGL.
    this.labels.render(this.scene, this.camera);
  };
  dispose() {
    // Stop producers of future frames/events before releasing their rendering resources.
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    disposeObjectTree(this.world);
    disposeObjectTree(this.network);
    this.packets.forEach((p) => (p.material as THREE.Material).dispose());
    this.packetGeometry.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }
}
