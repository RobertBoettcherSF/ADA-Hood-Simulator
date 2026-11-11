/**
 * Procedural geometry for Saint Volstead. Everything here is built from THREE
 * primitives and merged into a handful of low-poly shapes that are then drawn
 * with InstancedMesh, so the whole city stays inside a couple of dozen draw
 * calls. Baked vertex colours carry the parts of a shape that must not be
 * recoloured per instance (hat brims, tyres, iron work); the instance colour
 * multiplies over the top and carries gang colours and shading.
 */

import * as THREE from 'three';
import { FIRE_ESCAPE } from './fireEscapeLayout';
import { ornamentRgb, ORNAMENT_PALETTE } from './ornamentLayout';

interface Part {
  geo: THREE.BufferGeometry;
  /** Baked colour, multiplied by the per-instance colour at draw time. */
  color?: [number, number, number];
  matrix?: THREE.Matrix4;
}

const M = () => new THREE.Matrix4();

function place(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  const m = M();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  return m;
}

/** Merge parts into one non-indexed geometry with position/normal/uv/color. */
function merge(parts: Part[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    if (part.matrix) g.applyMatrix4(part.matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const [cr, cg, cb] = part.color ?? [1, 1, 1];
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      colors.push(cr, cg, cb);
    }
    g.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return out;
}

// ------------------------------------------------------------------ masses

/**
 * The wall shell of a building mass: four walls (material 0, the facade) and a
 * flat roof (material 1). A unit cube standing on y = 0, so one instance
 * matrix scales it to width / height / depth in metres.
 */
export function wallShellGeometry(openRoof = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ) => {
    const base = pos.length / 3;
    for (const v of [a, b, c, d]) pos.push(v[0], v[1], v[2]);
    for (let i = 0; i < 4; i++) nor.push(n[0], n[1], n[2]);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const h = 0.5;
  // +Z, -Z, +X, -X
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1]);
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1]);
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0]);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0]);
  if (openRoof) {
    // Cutaways expose the inside of every wall. Give those faces their own
    // winding/normals instead of changing the shared facade material side.
    const vertexCount = pos.length / 3;
    const outerIndices = idx.slice();
    for (let i = 0; i < vertexCount; i++) {
      pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      nor.push(-nor[i * 3], -nor[i * 3 + 1], -nor[i * 3 + 2]);
      uv.push(1 - uv[i * 2], uv[i * 2 + 1]);
    }
    for (let i = 0; i < outerIndices.length; i += 3)
      idx.push(vertexCount + outerIndices[i], vertexCount + outerIndices[i + 2], vertexCount + outerIndices[i + 1]);
  }
  const wallIndices = idx.length;
  // Roof.
  if (!openRoof) quad([-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h], [0, 1, 0]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.addGroup(0, wallIndices, 0);
  if (!openRoof) geo.addGroup(wallIndices, idx.length - wallIndices, 1);
  return geo;
}

/**
 * A closed band standing on y = 0 in a unit cube, with every side face mapped
 * the same way up and the same way round, so lettering reads correctly on all
 * four elevations. Storefronts, sign bands and ownership banners use it.
 */
export function bandGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ) => {
    const base = pos.length / 3;
    for (const v of [a, b, c, d]) pos.push(v[0], v[1], v[2]);
    for (let i = 0; i < 4; i++) nor.push(n[0], n[1], n[2]);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const h = 0.5;
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1]);
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1]);
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0]);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0]);
  quad([-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h], [0, 1, 0]);
  quad([-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [0, -1, 0]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** A closed unit box standing on y = 0 — cornices, parapets, plinth blocks. */
export function slabGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  return geo;
}

// ------------------------------------------------------------------ people

/**
 * A 1920s pawn: overcoat, shoulders, a felt hat, standing on a coloured base
 * disc that carries the faction colour. Deliberately over-scale so it still
 * reads at rooftop height.
 */
/**
 * The band of height occupied by a pawn's legs. The walk shader swings every
 * vertex inside it fore and aft by the sign of its x, which is what turns one
 * rigid instanced mesh into a figure that strides.
 */
export const PAWN_LEG_LO = 0.24;
export const PAWN_LEG_HI = 0.64;

const TROUSER: [number, number, number] = [0.15, 0.14, 0.16];

export function pawnGeometry(): THREE.BufferGeometry {
  // The coat is left almost white so the instance colour *is* the coat: a
  // baked-in grey multiplied by a tint came out too dark to see on a pavement.
  const coat: [number, number, number] = [0.88, 0.87, 0.9];
  const coatLit: [number, number, number] = [1, 1, 1];
  const felt: [number, number, number] = [0.1, 0.1, 0.11];
  const collar: [number, number, number] = [0.72, 0.7, 0.64];

  return merge([
    // Base disc — pure white so the instance colour comes through unchanged.
    { geo: new THREE.CylinderGeometry(0.92, 1.0, 0.16, 14), color: [1, 1, 1], matrix: place(0, 0.08, 0) },
    { geo: new THREE.CylinderGeometry(0.78, 0.82, 0.07, 14), color: [0.62, 0.62, 0.62], matrix: place(0, 0.19, 0) },
    // Legs, below the skirt of the coat: these are what the walk shader moves.
    { geo: new THREE.CylinderGeometry(0.17, 0.19, 0.42, 6), color: TROUSER, matrix: place(-0.2, 0.44, 0) },
    { geo: new THREE.CylinderGeometry(0.17, 0.19, 0.42, 6), color: TROUSER, matrix: place(0.2, 0.44, 0) },
    // Overcoat: a skirt with a slight flare and a belted waist.
    { geo: new THREE.CylinderGeometry(0.44, 0.62, 0.95, 8), color: coat, matrix: place(0, 1.1, 0) },
    { geo: new THREE.CylinderGeometry(0.45, 0.45, 0.1, 8), color: felt, matrix: place(0, 1.56, 0) },
    // Chest, with a pale shirt front showing under the lapels.
    { geo: new THREE.CylinderGeometry(0.42, 0.46, 0.6, 8), color: coatLit, matrix: place(0, 1.9, 0) },
    { geo: new THREE.BoxGeometry(0.2, 0.5, 0.12), color: collar, matrix: place(0, 1.95, 0.42) },
    // Shoulders, cut wider than the head so the figure reads from above.
    { geo: new THREE.CylinderGeometry(0.5, 0.55, 0.22, 8), color: coat, matrix: place(0, 2.29, 0) },
    // Head and felt hat.
    { geo: new THREE.CylinderGeometry(0.23, 0.25, 0.24, 7), color: [0.55, 0.44, 0.36], matrix: place(0, 2.5, 0) },
    { geo: new THREE.CylinderGeometry(0.62, 0.62, 0.07, 12), color: felt, matrix: place(0, 2.64, 0.03) },
    { geo: new THREE.CylinderGeometry(0.28, 0.34, 0.4, 10), color: [0.17, 0.16, 0.17], matrix: place(0, 2.87, 0.02) },
    { geo: new THREE.CylinderGeometry(0.35, 0.35, 0.07, 10), color: felt, matrix: place(0, 2.73, 0.02) },
  ]);
}

/**
 * The crowd's pawn: the same silhouette as pawnGeometry at a fraction of the
 * triangles, so a few thousand of them can fill the pavements. It keeps the leg
 * band of the full pawn so the same walk shader drives it.
 */
export function crowdPawnGeometry(): THREE.BufferGeometry {
  const coat: [number, number, number] = [0.88, 0.87, 0.9];
  const felt: [number, number, number] = [0.1, 0.1, 0.11];
  return merge([
    { geo: new THREE.CylinderGeometry(0.17, 0.19, 0.42, 4), color: TROUSER, matrix: place(-0.2, 0.44, 0) },
    { geo: new THREE.CylinderGeometry(0.17, 0.19, 0.42, 4), color: TROUSER, matrix: place(0.2, 0.44, 0) },
    { geo: new THREE.CylinderGeometry(0.44, 0.6, 0.95, 5), color: coat, matrix: place(0, 1.1, 0) },
    { geo: new THREE.CylinderGeometry(0.42, 0.46, 0.6, 5), color: coat, matrix: place(0, 1.9, 0) },
    { geo: new THREE.CylinderGeometry(0.5, 0.55, 0.22, 5), color: coat, matrix: place(0, 2.29, 0) },
    { geo: new THREE.CylinderGeometry(0.23, 0.25, 0.24, 5), color: [0.55, 0.44, 0.36], matrix: place(0, 2.5, 0) },
    { geo: new THREE.CylinderGeometry(0.6, 0.6, 0.07, 6), color: felt, matrix: place(0, 2.64, 0.03) },
    { geo: new THREE.CylinderGeometry(0.28, 0.33, 0.4, 5), color: [0.17, 0.16, 0.17], matrix: place(0, 2.87, 0.02) },
  ]);
}

/** A brick chimney stack; two or three sit on most roofs. */
export function chimneyGeometry(): THREE.BufferGeometry {
  return merge([
    { geo: new THREE.BoxGeometry(0.85, 2.4, 0.85), color: [0.38, 0.25, 0.2], matrix: place(0, 1.2, 0) },
    { geo: new THREE.BoxGeometry(1.0, 0.16, 1.0), color: [0.3, 0.28, 0.26], matrix: place(0, 2.45, 0) },
    { geo: new THREE.CylinderGeometry(0.13, 0.15, 0.36, 6), color: [0.16, 0.15, 0.14], matrix: place(-0.19, 2.66, 0) },
    { geo: new THREE.CylinderGeometry(0.13, 0.15, 0.36, 6), color: [0.16, 0.15, 0.14], matrix: place(0.19, 2.66, 0) },
  ]);
}

/** The stair bulkhead that gets you out onto the roof. */
export function bulkheadGeometry(): THREE.BufferGeometry {
  const prism = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1);
  prism.rotateY(Math.PI / 6);
  prism.rotateZ(Math.PI / 2);
  prism.scale(2.9, 0.5, 1.6);
  return merge([
    { geo: new THREE.BoxGeometry(2.6, 2.1, 2.0), color: [0.46, 0.43, 0.38], matrix: place(0, 1.05, 0) },
    { geo: prism, color: [0.3, 0.29, 0.28], matrix: place(0, 2.25, 0) },
    { geo: new THREE.BoxGeometry(0.9, 1.4, 0.1), color: [0.22, 0.2, 0.18], matrix: place(0, 0.7, 1.01) },
  ]);
}

// ------------------------------------------------------------------ vehicles

const TYRE: [number, number, number] = [0.11, 0.1, 0.1];
const CHROME: [number, number, number] = [0.72, 0.7, 0.66];

function wheels(x: number, z: number, r: number): Part[] {
  const out: Part[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push({
        geo: new THREE.CylinderGeometry(r, r, 0.34, 9),
        color: TYRE,
        matrix: place(sx * x, r, sz * z, 0, 0, Math.PI / 2),
      });
    }
  }
  return out;
}

/** A boxy period sedan, nose pointing along +X. */
export function sedanGeometry(): THREE.BufferGeometry {
  return merge([
    // Chassis / bonnet — white, so the instance colour paints the coachwork.
    { geo: new THREE.BoxGeometry(6.2, 1.15, 2.35), color: [1, 1, 1], matrix: place(0, 1.0, 0) },
    { geo: new THREE.BoxGeometry(2.3, 0.85, 2.15), color: [0.92, 0.92, 0.92], matrix: place(1.95, 1.85, 0) },
    // Passenger cabin, a touch darker.
    { geo: new THREE.BoxGeometry(2.9, 1.5, 2.2), color: [0.62, 0.62, 0.64], matrix: place(-0.85, 2.05, 0) },
    { geo: new THREE.BoxGeometry(3.0, 0.16, 2.3), color: [0.22, 0.22, 0.23], matrix: place(-0.85, 2.86, 0) },
    // Running boards and mudguards.
    { geo: new THREE.BoxGeometry(4.4, 0.18, 2.9), color: [0.2, 0.2, 0.21], matrix: place(-0.2, 0.86, 0) },
    // Radiator and lamps housing.
    { geo: new THREE.BoxGeometry(0.28, 1.1, 1.9), color: CHROME, matrix: place(3.16, 1.15, 0) },
    ...wheels(2.05, 1.18, 0.62),
  ]);
}

/** A stake-bed delivery truck. */
export function truckGeometry(): THREE.BufferGeometry {
  return merge([
    { geo: new THREE.BoxGeometry(3.0, 1.2, 2.5), color: [1, 1, 1], matrix: place(2.1, 1.05, 0) },
    { geo: new THREE.BoxGeometry(2.0, 1.7, 2.4), color: [0.6, 0.6, 0.62], matrix: place(1.5, 2.2, 0) },
    { geo: new THREE.BoxGeometry(2.1, 0.16, 2.5), color: [0.22, 0.22, 0.23], matrix: place(1.5, 3.06, 0) },
    // Load bed with a canvas tilt.
    { geo: new THREE.BoxGeometry(5.0, 0.4, 2.6), color: [0.32, 0.28, 0.23], matrix: place(-1.6, 1.35, 0) },
    { geo: new THREE.BoxGeometry(4.7, 1.9, 2.45), color: [0.78, 0.75, 0.68], matrix: place(-1.6, 2.5, 0) },
    { geo: new THREE.BoxGeometry(4.8, 0.2, 2.6), color: [0.55, 0.52, 0.46], matrix: place(-1.6, 3.5, 0) },
    { geo: new THREE.BoxGeometry(0.26, 1.1, 2.0), color: CHROME, matrix: place(3.6, 1.2, 0) },
    ...wheels(2.4, 1.25, 0.72),
  ]);
}

/** Two glowing lamps at the nose of a car, drawn only after dark. */
export function headlampGeometry(): THREE.BufferGeometry {
  return merge([
    { geo: new THREE.SphereGeometry(0.34, 8, 6), color: [1, 1, 1], matrix: place(0, 0, 0.78) },
    { geo: new THREE.SphereGeometry(0.34, 8, 6), color: [1, 1, 1], matrix: place(0, 0, -0.78) },
  ]);
}

// ------------------------------------------------------------------ street

/** Cast-iron standard with a lantern head. */
/** The original's corner lamp stands about 1.8 people tall (Gold Rush street
 * view, 71 px vs 40 px); the authored 4.62 m post is scaled to that (A23). */
export const LAMP_SCALE = 3.25 / 4.62;
/** The original's sidewalk tree stands about 2.1 people tall (84 px vs 40 px). */
export const TREE_SCALE = 3.8 / 5.32;

export function lampPostGeometry(): THREE.BufferGeometry {
  const iron: [number, number, number] = [0.17, 0.17, 0.18];
  return merge([
    { geo: new THREE.CylinderGeometry(.14, .18, .36, 10), color: iron, matrix: place(0, .18, 0) },
    { geo: new THREE.CylinderGeometry(.055, .085, 3.78, 10), color: iron, matrix: place(0, 2.25, 0) },
    { geo: new THREE.CylinderGeometry(.10, .07, .12, 10), color: iron, matrix: place(0, 4.14, 0) },
    { geo: new THREE.CylinderGeometry(.04, .04, .92, 8), color: iron, matrix: place(0, 4.16, 0, 0, 0, Math.PI / 2) },
    ...[-.44, .44].map(x => ({ geo: new THREE.CylinderGeometry(.11, .085, .12, 10), color: iron, matrix: place(x, 4.24, 0) })),
    ...[-.44, .44].map(x => ({ geo: new THREE.SphereGeometry(.186, 12, 8), color: [.82, .78, .66] as [number, number, number], matrix: place(x, 4.43, 0) })),
  ]).scale(LAMP_SCALE, LAMP_SCALE, LAMP_SCALE);
}

/** The lantern glass — a separate mesh so it can light up at dusk. */
export function lampGlowGeometry(): THREE.BufferGeometry {
  return merge([
    ...[-.44, .44].map(x => ({ geo: new THREE.SphereGeometry(.19, 12, 8), color: [1, 1, 1] as [number, number, number], matrix: place(x, 4.43, 0) })),
  ]).scale(LAMP_SCALE, LAMP_SCALE, LAMP_SCALE);
}

export function hydrantGeometry(): THREE.BufferGeometry {
  const red: [number, number, number] = [0.62, 0.19, 0.14];
  return merge([
    { geo: new THREE.CylinderGeometry(.15, .20, .60, 10), color: red, matrix: place(0, .30, 0) },
    { geo: new THREE.SphereGeometry(.15, 10, 8), color: red, matrix: place(0, .63, 0) },
    { geo: new THREE.CylinderGeometry(.075, .075, .46, 8), color: [0.4, 0.12, 0.1], matrix: place(0, .42, 0, Math.PI / 2, 0, 0) },
  ]);
}

export function treeGeometry(): THREE.BufferGeometry {
  const rgb = (hex: number) => new THREE.Color(hex).toArray() as [number, number, number];
  const bark = rgb(0x493b2b);
  const parts: Part[] = [
    { geo: new THREE.CylinderGeometry(.075, .115, 2.9, 8), color: bark, matrix: place(0, 1.45, 0) },
  ];
  // Thin forks stay visible below the crown, unlike the old intersecting
  // icosahedra, which read as three pale stones from street distance.
  for (const [x, y, z] of [[-.72, 3.45, .18], [.76, 3.35, -.12], [.08, 3.65, -.67]]) {
    const start = new THREE.Vector3(0, 2.35, 0);
    const end = new THREE.Vector3(x, y, z);
    const direction = end.clone().sub(start);
    const matrix = new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      new THREE.Vector3(1, 1, 1));
    parts.push({ geo: new THREE.CylinderGeometry(.035, .065, direction.length(), 6), color: bark, matrix });
  }
  const crown = (x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number) => {
    const geo = new THREE.SphereGeometry(1, 9, 7);
    geo.scale(sx, sy, sz);
    parts.push({ geo, color: rgb(hex), matrix: place(x, y, z) });
  };
  // Overlapping olive lobes form a single irregular canopy with a narrow
  // trunk and the same approximate street footprint as the original prop.
  crown(0, 4.15, 0, 1.16, 1.17, 1.03, 0x5b7138);
  crown(-.70, 3.65, .14, .76, .82, .68, 0x4d6735);
  crown(.73, 3.62, -.14, .80, .84, .72, 0x658043);
  crown(.04, 3.60, -.62, .67, .73, .62, 0x526b36);
  return merge(parts).scale(TREE_SCALE, TREE_SCALE, TREE_SCALE);
}

/** A rooftop water tank on a timber frame. */
export function waterTankGeometry(): THREE.BufferGeometry {
  const timber: [number, number, number] = [0.36, 0.27, 0.19];
  const parts: Part[] = [
    { geo: new THREE.CylinderGeometry(1.35, 1.35, 2.6, 10), color: [0.42, 0.32, 0.23], matrix: place(0, 3.5, 0) },
    { geo: new THREE.ConeGeometry(1.5, 0.85, 10), color: [0.3, 0.24, 0.18], matrix: place(0, 5.2, 0) },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        geo: new THREE.BoxGeometry(0.2, 2.2, 0.2),
        color: timber,
        matrix: place(sx * 1.0, 1.1, sz * 1.0),
      });
    }
  }
  return merge(parts);
}

/** Open iron landing and a complete descending flight, hung on +Z.
 * Every instance joins the next 4.2 m floor below, so the last landing never
 * emits an unused ladder above the roof. The front flight leaves headroom. */
export function fireEscapeGeometry(): THREE.BufferGeometry {
  const iron = new THREE.Color(0x424640).toArray() as [number, number, number];
  const parts: Part[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    parts.push({ geo: new THREE.BoxGeometry(w, h, d), color: iron, matrix: place(x, y, z) });
  const beam = (a: THREE.Vector3, b: THREE.Vector3, thickness: number) => {
    const direction = b.clone().sub(a);
    const matrix = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      new THREE.Vector3(1, 1, 1));
    parts.push({ geo: new THREE.BoxGeometry(thickness, direction.length(), thickness), color: iron, matrix });
  };
  const f = FIRE_ESCAPE, half = f.width / 2;
  // Open load-bearing grating: daylight remains between the individual bars.
  for (let i = 0; i <= 10; i++) box(.07, .05, f.landingDepth, -half + i * f.width / 10, -.025, f.landingDepth / 2);
  for (const z of [.025, f.landingDepth - .025]) box(f.width, .08, .065, 0, -.04, z);
  // End bridges meet the upper and lower ends of the front-mounted flight.
  // Their open middle leaves full headroom over the stair below.
  for (const side of [-1, 1]) {
    box(.075, .08, f.outerDepth, side * half, -.04, f.outerDepth / 2);
    for (const z of [1.15, 1.56, 1.97]) box(.55, .05, .065, side * 2.025, -.025, z);
    for (const z of [.04, 1.10, 1.99]) box(.065, f.railHeight, .065, side * half, f.railHeight / 2, z);
    box(.065, .065, f.outerDepth, side * half, f.railHeight, f.outerDepth / 2);
    box(.55, .065, .065, side * 2.025, f.railHeight, 1.99);
  }
  // Front guard rails stop short of the two access bridges.
  for (const x of [-1.65, 1.65]) box(.065, f.railHeight, .065, x, f.railHeight / 2, 1.10);
  for (const y of [.52, f.railHeight]) box(3.3, .065, .065, 0, y, 1.10);
  const lowerX = -f.flightRun / 2, upperX = f.flightRun / 2;
  // Stringers and handrails connect identical points on adjacent landings.
  for (const z of [f.flightCentreZ - f.flightWidth / 2, f.flightCentreZ + f.flightWidth / 2]) {
    beam(new THREE.Vector3(lowerX, -f.rise, z), new THREE.Vector3(upperX, 0, z), .075);
    beam(new THREE.Vector3(lowerX, -f.rise + .97, z), new THREE.Vector3(upperX, .97, z), .06);
    beam(new THREE.Vector3(lowerX, -f.rise, z), new THREE.Vector3(lowerX, -f.rise + .97, z), .06);
    beam(new THREE.Vector3(upperX, 0, z), new THREE.Vector3(upperX, .97, z), .06);
  }
  // Discrete level treads replace the opaque ramp. The first rests on the
  // previous landing (or pavement), and the last meets this landing at y=0.
  for (let step = 0; step <= f.steps; step++) {
    const t = step / f.steps;
    box(.18, .045, f.flightWidth, lowerX + t * f.flightRun, -f.rise + t * f.rise - .0225, f.flightCentreZ);
  }
  const result = merge(parts);
  for (const part of parts) part.geo.dispose();
  result.name = 'open-iron-fire-escape';
  result.userData.floorRiseMetres = f.rise;
  return result;
}

/**
 * One bay of a saw-tooth factory roof: a right-angled prism with the glazed
 * north light standing vertical at +Z and slate sloping away to -Z. Written
 * out as explicit vertices so it survives the non-uniform scaling that fits
 * it to a building's footprint.
 */
export function sawtoothGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const slate: [number, number, number] = [0.3, 0.29, 0.28];
  const glass: [number, number, number] = [0.46, 0.55, 0.6];
  const under: [number, number, number] = [0.16, 0.16, 0.15];

  const tri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    k: [number, number, number],
  ) => {
    for (const v of [a, b, c]) pos.push(v[0], v[1], v[2]);
    for (let i = 0; i < 3; i++) col.push(k[0], k[1], k[2]);
  };
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    k: [number, number, number],
  ) => {
    tri(a, b, c, k);
    tri(a, c, d, k);
  };

  const x0 = -0.5;
  const x1 = 0.5;
  // Profile: eaves at -Z on the deck, ridge above the glazing at +Z.
  const A0: [number, number, number] = [x0, 0.06, -0.5];
  const A1: [number, number, number] = [x1, 0.06, -0.5];
  const B0: [number, number, number] = [x0, 0.06, 0.5];
  const B1: [number, number, number] = [x1, 0.06, 0.5];
  const C0: [number, number, number] = [x0, 1, 0.5];
  const C1: [number, number, number] = [x1, 1, 0.5];

  quad(A0, C0, C1, A1, slate); // sloping slate, facing up and -Z
  quad(B1, C1, C0, B0, glass); // vertical glazing, facing +Z
  quad(A1, B1, B0, A0, under); // deck, facing down
  tri(A0, B0, C0, under); // end caps, facing out
  tri(A1, C1, B1, under);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/** A classical column with base and capital, one metre tall before scaling. */
export function columnGeometry(): THREE.BufferGeometry {
  const stone: [number, number, number] = [1, 1, 1];
  return merge([
    { geo: new THREE.BoxGeometry(1.5, 0.12, 1.5), color: [0.92, 0.92, 0.9], matrix: place(0, 0.06, 0) },
    { geo: new THREE.CylinderGeometry(0.44, 0.5, 0.78, 10), color: stone, matrix: place(0, 0.5, 0) },
    { geo: new THREE.BoxGeometry(1.35, 0.14, 1.35), color: [0.95, 0.95, 0.93], matrix: place(0, 0.94, 0) },
  ]);
}

/** A centred pediment: local X is width, Y is up, Z is shallow depth.
 * The triangle rests exactly on the entablature; its apex is above x=0. */
export function pedimentGeometry(): THREE.BufferGeometry {
  const triangle = new THREE.Shape();
  triangle.moveTo(-.5, 0);
  triangle.lineTo(.5, 0);
  triangle.lineTo(0, .55);
  triangle.closePath();
  const prism = new THREE.ExtrudeGeometry(triangle, { depth: 1, bevelEnabled: false });
  prism.translate(0, .26, -.5);
  const base = new THREE.BoxGeometry(1, .26, 1);
  const geometry = merge([
    { geo: base, color: [1, 1, 1], matrix: place(0, .13, 0) },
    { geo: prism, color: [.96, .96, .94] },
  ]);
  base.dispose(); prism.dispose();
  return geometry;
}

/** Compact roof-mounted belfry with real openings, a slate spire and cross.
 * A seated base intersects the nave roof; no tall invisible tower is buried in it. */
export function spireGeometry(): THREE.BufferGeometry {
  const stone = ornamentRgb(ORNAMENT_PALETTE.stone), trim = ornamentRgb(ORNAMENT_PALETTE.trim);
  const slate = ornamentRgb(ORNAMENT_PALETTE.slate), metal = ornamentRgb(ORNAMENT_PALETTE.metal);
  const parts: Part[] = [
    { geo: new THREE.BoxGeometry(2.8, 1.12, 2.8), color: stone, matrix: place(0, .56, 0) },
    { geo: new THREE.BoxGeometry(2.96, .12, 2.96), color: trim, matrix: place(0, 1.10, 0) },
  ];
  // Four stone corner piers leave front, rear and side belfry openings clear.
  for (const x of [-1.12, 1.12]) for (const z of [-1.12, 1.12])
    parts.push({ geo: new THREE.BoxGeometry(.38, 1.22, .38), color: stone, matrix: place(x, 1.77, z) });
  parts.push(
    { geo: new THREE.BoxGeometry(2.96, .14, 2.96), color: trim, matrix: place(0, 2.45, 0) },
    { geo: new THREE.ConeGeometry(.46, .62, 10), color: ornamentRgb(ORNAMENT_PALETTE.shadow), matrix: place(0, 2.0, 0) },
    { geo: new THREE.ConeGeometry(2.18, 6.0, 4), color: slate, matrix: place(0, 5.45, 0, 0, Math.PI / 4, 0) },
    { geo: new THREE.BoxGeometry(.12, .86, .12), color: metal, matrix: place(0, 8.8, 0) },
    { geo: new THREE.BoxGeometry(.60, .12, .12), color: metal, matrix: place(0, 9.0, 0) },
  );
  const result = merge(parts);
  result.name = 'roof-mounted-belfry-and-spire';
  result.userData.openBelfry = true;
  return result;
}

/** Shallow civic dome: low drum, flattened hemisphere, compact lantern/finial.
 * Geometry proportions and instance scale are independent of body height. */
export function domeGeometry(): THREE.BufferGeometry {
  const stone = ornamentRgb(ORNAMENT_PALETTE.stone), trim = ornamentRgb(ORNAMENT_PALETTE.trim);
  const copper = ornamentRgb(ORNAMENT_PALETTE.copper);
  const dome = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, .72, 1);
  const result = merge([
    { geo: new THREE.CylinderGeometry(1.03, 1.08, .32, 16), color: stone, matrix: place(0, .16, 0) },
    { geo: dome, color: copper, matrix: place(0, .30, 0) },
    { geo: new THREE.CylinderGeometry(.14, .19, .32, 10), color: trim, matrix: place(0, 1.16, 0) },
    { geo: new THREE.ConeGeometry(.20, .25, 10), color: copper, matrix: place(0, 1.43, 0) },
    { geo: new THREE.BoxGeometry(.07, .35, .07), color: ornamentRgb(ORNAMENT_PALETTE.metal), matrix: place(0, 1.68, 0) },
  ]);
  result.name = 'shallow-civic-dome';
  return result;
}

/** A striped canvas awning over a shopfront, hinged along -Z, sloping out. */
export function awningGeometry(): THREE.BufferGeometry {
  const canvas = new THREE.BoxGeometry(1, 0.08, 1);
  return merge([
    { geo: canvas, color: [1, 1, 1], matrix: place(0, 0.22, 0.06, -0.42, 0, 0) },
    // Valance hanging from the leading edge.
    { geo: new THREE.BoxGeometry(1, 0.28, 0.05), color: [0.86, 0.86, 0.86], matrix: place(0, -0.06, 0.48) },
  ]);
}
