import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
/**
 * Removing meshes from a scene does not release their GPU resources. This helper
 * releases mesh geometry/materials and detaches CSS2D labels from their DOM overlay.
 * Textures remain owned by the card/index cache; callers dispose those separately.
 * Non-mesh objects such as grid LineSegments also need separate cleanup.
 */
export function disposeObjectTree(group: THREE.Group) {
  // Several meshes can share a resource; dispose each one only once per tree.
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    }
    if (object instanceof CSS2DObject) object.element.remove();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.clear();
}
