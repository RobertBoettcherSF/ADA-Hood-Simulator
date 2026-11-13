import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { activeBlocks, blockRect, cityStreetInset } from '../sim/cityLayout';
import { CELL } from '../sim/constants';
import { riverBank, riverCrossing } from './riverBanks';
import type { WorldState } from '../sim/types';
import { KERB_H, paveWidth, r01 } from './util';
import { TREE_KINDS, type TreePlacement } from './sculptTrees';
import { PondWaterMaterial } from './pondWater';
import { ElevatedTrains } from './elevatedTrains';
import { StreetTrams } from './streetTrams';
import { cityTramLines } from '../sim/trams';
import { BLOCK_MODULE_BY_ID, modulePoint, moduleRect } from '../sim/blockModules';
import { EDGE_PARK_WIDTH, edgeParkTrees } from './edgeParks';

/** Static, batched municipal grounds and inset tram rails, with the trams that run on them. */
export class CityLandscape {
  readonly group = new THREE.Group();
  readonly trees: TreePlacement[] = [];
  private materials: THREE.MeshStandardMaterial[] = [];
  private textures: THREE.Texture[] = [];
  private water?: PondWaterMaterial;
  private river?: PondWaterMaterial;
  private trains?: ElevatedTrains;
  private trams?: StreetTrams;

  constructor(w: WorldState, detailedTrees = false) {
    this.group.name = 'parks-civic-grounds-and-tramways';
    if (!w.cityLayout) return;
    // 12: the original city's river, one continuous surface. 13: the elevated
    // railway's dark riveted iron.
    const materials = [0x7f9067, 0xb9b29b, 0x416b69, 0x414c43, 0x695847, 0x394b35, 0x526347, 0x7e817a, 0x414c43,
      0x8a8576, 0x75695b, 0xaaa18d, 0x416b69, 0x2c302d]
      .map((color, i) => i === 2 ? new PondWaterMaterial() : i === 12 ? new PondWaterMaterial(true)
        : new THREE.MeshStandardMaterial({ color, roughness: i === 13 ? .7 : .93, metalness: i === 7 ? .35 : i === 13 ? .3 : 0 }));
    this.materials = materials;
    this.water = materials[2] as PondWaterMaterial;
    this.river = materials[12] as PondWaterMaterial;
    const batches = materials.map(() => [] as THREE.BufferGeometry[]);
    const add = (g: THREE.BufferGeometry, kind: number, x: number, y: number, z: number, angle = 0) => {
      if (g.index) { const source = g; g = source.toNonIndexed(); source.dispose(); }
      g.rotateY(angle); g.translate(x, y, z); batches[kind].push(g);
    };
    const box = (kind: number, x: number, y: number, z: number, width: number, height: number, depth: number, angle = 0) =>
      add(new THREE.BoxGeometry(width, height, depth), kind, x, y, z, angle);
    const line = (kind: number, ax: number, az: number, bx: number, bz: number, y: number, width: number, height: number) => {
      const length = Math.hypot(bx - ax, bz - az);
      if (length < .001) return;
      box(kind, (ax + bx) / 2, y, (az + bz) / 2, width, height, length, Math.atan2(bx - ax, bz - az));
    };
    const grass = document.createElement('canvas'); grass.width = grass.height = 256;
    const ctx = grass.getContext('2d')!; ctx.fillStyle = '#c3c8ab'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = r01(i, 923) * 256, y = r01(i, 924) * 256, radius = 8 + r01(i, 925) * 35;
      // Wrap soft soil/grass patches across the tile edge to avoid seams.
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
        const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        gradient.addColorStop(0, i % 3 ? 'rgba(83,97,60,.15)' : 'rgba(209,189,142,.18)'); gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient; ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
    for (let i = 0; i < 14000; i++) {
      const shade = Math.floor(155 + r01(i, 823) * 60);
      ctx.fillStyle = `rgba(${shade},${shade + 8},${shade - 14},.35)`;
      ctx.fillRect(r01(i, 811) * 256, r01(i, 819) * 256, 1, 2);
    }
    const grassMap = new THREE.CanvasTexture(grass); grassMap.colorSpace = THREE.SRGBColorSpace;
    grassMap.wrapS = grassMap.wrapT = THREE.RepeatWrapping; grassMap.anisotropy = 8;
    materials[0].map = grassMap; this.textures.push(grassMap);

    // Shared, metre-scaled compacted gravel: service courts should not look
    // like unbounded extensions of the public concrete sidewalk.
    const gravel = document.createElement('canvas'); gravel.width = gravel.height = 128;
    const gravelCtx = gravel.getContext('2d')!; gravelCtx.fillStyle = '#c9c5bc'; gravelCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 12000; i++) {
      const shade = Math.floor(143 + r01(i, 1490) * 80);
      gravelCtx.fillStyle = `rgb(${shade},${shade},${shade - 5})`;
      gravelCtx.fillRect(r01(i, 1491) * 128, r01(i, 1492) * 128, 1, 1);
    }
    const gravelMap = new THREE.CanvasTexture(gravel); gravelMap.colorSpace = THREE.SRGBColorSpace;
    gravelMap.wrapS = gravelMap.wrapT = THREE.RepeatWrapping; gravelMap.anisotropy = 8;
    materials[9].map = gravelMap; this.textures.push(gravelMap);

    // 1.2.23: parkland round the city's edge, so the city ends in green and not
    // in the dark. Scenery only: outside every block, never counted or walked.
    {
      const cityW = w.gridW * CELL, cityH = w.gridH * CELL, band = EDGE_PARK_WIDTH, y = -.02;
      const strip = (x: number, z: number, sw: number, sh: number) => {
        const g = new THREE.PlaneGeometry(sw, sh).rotateX(-Math.PI / 2);
        const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
        for (let n = 0; n < uv.count; n++) uv.setXY(n, (pos.getX(n) + x + sw / 2) / 9, (pos.getZ(n) + z + sh / 2) / 9);
        add(g, 0, x + sw / 2, y, z + sh / 2);
      };
      strip(-band, -band, cityW + band * 2, band);
      strip(-band, cityH, cityW + band * 2, band);
      strip(-band, 0, band, cityH);
      strip(cityW, 0, band, cityH);
      // A gravel walk round the city.
      const walk = band * .52;
      line(9, -walk, -walk, cityW + walk, -walk, y + .02, 2.4, .02);
      line(9, -walk, cityH + walk, cityW + walk, cityH + walk, y + .02, 2.4, .02);
      line(9, -walk, -walk, -walk, cityH + walk, y + .02, 2.4, .02);
      line(9, cityW + walk, -walk, cityW + walk, cityH + walk, y + .02, 2.4, .02);
      for (const [i, t] of edgeParkTrees(w).entries()) {
        const height = 5.1 + r01(i, 1987) * .9;
        if (detailedTrees) this.trees.push({ kind: TREE_KINDS[i % TREE_KINDS.length], x: t.x, y, z: t.y, height, angle: r01(i, 1988) * Math.PI * 2 });
        else {
          add(new THREE.CylinderGeometry(.10, .19, height * .6, 6), 4, t.x, y + height * .3, t.y);
          const crown = new THREE.IcosahedronGeometry(1.7, 1); crown.scale(1, 1.35, 1);
          add(crown, 5, t.x, y + height * .7, t.y);
        }
      }
    }

    for (const b of activeBlocks(w)) {
      const placement = b.layout?.module, module = placement && BLOCK_MODULE_BY_ID[placement.id];
      if (!placement || !module) continue;
      const origin = blockRect(b), ground = KERB_H + .018;
      for (const [i, patch] of module.grounds.entries()) {
        const r = moduleRect(module, placement.turn, patch), x = origin.x + r.x, z = origin.y + r.y;
        const g = new THREE.PlaneGeometry(r.w, r.h).rotateX(-Math.PI / 2);
        const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), scale = patch.surface === 'lawn' ? 9 : 2;
        for (let n = 0; n < uv.count; n++) uv.setXY(n,
          (pos.getX(n) + x + r.w / 2) / scale, (pos.getZ(n) + z + r.h / 2) / scale);
        // Below every building's ground floor, including future construction.
        add(g, patch.surface === 'lawn' ? 0 : 9, x + r.w / 2, ground + i * .0005, z + r.h / 2);
      }
      for (const wall of module.walls) {
        const a = modulePoint(module, placement.turn, wall.ax, wall.ay), e = modulePoint(module, placement.turn, wall.bx, wall.by);
        line(10, origin.x + a.x, origin.y + a.y, origin.x + e.x, origin.y + e.y, ground + .32, .18, .64);
        line(11, origin.x + a.x, origin.y + a.y, origin.x + e.x, origin.y + e.y, ground + .66, .24, .08);
      }
      for (const [i, tree] of module.trees.entries()) {
        const p = modulePoint(module, placement.turn, tree.x, tree.y), x = origin.x + p.x, z = origin.y + p.y;
        const height = 5.1 + r01(b.id, i + 187) * .8;
        this.trees.push({ kind: TREE_KINDS[(b.id + i) % TREE_KINDS.length], x, y: ground, z, height,
          angle: r01(b.id, i + 188) * Math.PI * 2 });
        if (!detailedTrees) {
          add(new THREE.CylinderGeometry(.10, .19, height * .6, 6), 4, x, ground + height * .3, z);
          const crown = new THREE.IcosahedronGeometry(1.7, 2); crown.scale(1, 1.35, 1);
          add(crown, 5, x, ground + height * .7, z);
        }
      }
    }

    const riverRects: { x: number; y: number; w: number; h: number }[] = [];
    for (const b of activeBlocks(w)) {
      if (!b.layout || b.layout.use === 'urban') continue;
      const r = blockRect(b), cx = b.center.x, cz = b.center.y, ground = KERB_H + .02;
      const park = b.layout.use === 'park';
      const yard = b.layout.landmark === 'railroad' || b.layout.landmark === 'docks';
      // Original 40 × 32 city: paved avenues and plazas, and the river.
      const crossing = riverCrossing(b);
      const avenue = b.layout.use === 'avenue' && !crossing, water = b.layout.use === 'water' || crossing, plaza = b.layout.use === 'plaza';
      const open = avenue || water;
      if (avenue) {
        // The avenue's central island: a planted median inside a paved rim, with
        // a row of trees down each side along the avenue (both ways at a crossing).
        const lawn = new THREE.PlaneGeometry(r.w - 5, r.h - 5).rotateX(-Math.PI / 2);
        const positions = lawn.getAttribute('position'), uv = lawn.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (positions.getX(i) / (r.w - 5) + .5) * r.w / 9,
          (.5 - positions.getZ(i) / (r.h - 5)) * r.h / 9);
        add(lawn, 0, cx, ground, cz);
        const content = b.original?.content;
        const axes = content === 36 ? ['x', 'z'] : content === 35 ? ['z'] : ['x'];
        // Under the elevated railway (content 41) the deck and its pylons run
        // down the cell's centre column: keep the trees and the walk clear of it.
        const railX = content === 41 && w.cityLayout?.original?.railColumn != null
          ? (w.cityLayout.original.railColumn + .5) * CELL : null;
        const clearOfRail = (x: number) => railX == null || Math.abs(x - railX) > 6;
        const tramBed = cityTramLines(w).length > 0, bed = tramBed ? 5.6 : 3;
        for (const axis of axes) {
          const length = axis === 'x' ? r.w : r.h, across = axis === 'x' ? r.h : r.w;
          // A gravel walk down the middle of the median; with trams (the
          // avenues are tramways, 0x4EC3D0) a ballast bed under both tracks,
          // unbroken under the elevated railway, whose pylons stand elsewhere.
          if (axis === 'x' && (railX == null || tramBed)) box(1, cx, ground + .012, cz, r.w - 5, .025, bed);
          else if (axis === 'x') for (const [from, to] of [[r.x + 2.5, railX! - 6], [railX! + 6, r.x + r.w - 2.5]]) {
            if (to - from > 1) box(1, (from + to) / 2, ground + .012, cz, to - from, .025, bed);
          }
          else box(1, cx, ground + .012, cz, bed, .025, r.h - 5);
          const count = Math.max(2, Math.floor((length - 8) / 9));
          for (let i = 0; i <= count; i++) for (const side of [-1, 1]) {
            const along = -length / 2 + 4 + i * (length - 8) / count, off = side * (across / 2 - 6);
            const x = axis === 'x' ? cx + along : cx + off, z = axis === 'x' ? cz + off : cz + along;
            if (!clearOfRail(x)) continue;
            // At a crossing each row's middle tree would stand on the other
            // tramway: keep a tram body and a crown's width clear of both.
            if (tramBed && content === 36 && (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5)) continue;
            const height = 4.8 + r01(b.id * 13 + i, side + 3) * 1.6;
            this.trees.push({ kind: TREE_KINDS[(b.id + i) % TREE_KINDS.length], x, y: ground, z,
              height: height + 2.2, angle: r01(b.id, i * 2 + side + 70) * Math.PI * 2 });
            if (detailedTrees) continue;
            add(new THREE.CylinderGeometry(.12, .22, height, 6), 4, x, ground + height / 2, z);
            const crown = new THREE.IcosahedronGeometry(2.1, 2); crown.scale(1, 1.25, 1);
            add(crown, 5, x, ground + height + .6, z);
          }
        }
        continue;
      }
      if (water) {
        // One channel between the banks; railings along the water's edge, which
        // at a bridge are its parapets.
        const { water: wr, railings } = riverBank(w, b);
        const sheet = new THREE.PlaneGeometry(wr.w, wr.h).rotateX(-Math.PI / 2);
        add(sheet, 12, wr.x + wr.w / 2, .03, wr.y + wr.h / 2);
        riverRects.push(wr);
        for (const rl of railings) {
          const length = Math.hypot(rl.x1 - rl.x0, rl.y1 - rl.y0);
          for (let at = 0; at <= length; at += 3) {
            const t = length ? at / length : 0;
            box(3, rl.x0 + (rl.x1 - rl.x0) * t, KERB_H + .55, rl.y0 + (rl.y1 - rl.y0) * t, .12, 1.1, .12);
          }
          line(3, rl.x0, rl.y0, rl.x1, rl.y1, KERB_H + 1.05, .08, .08);
          line(3, rl.x0, rl.y0, rl.x1, rl.y1, KERB_H + .5, .07, .07);
        }
        continue;
      }
      const lawn = park ? parkLawn(r.w, r.h) : new THREE.PlaneGeometry(r.w - 1, r.h - 1).rotateX(-Math.PI / 2);
      const positions = lawn.getAttribute('position'), uv = lawn.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i,
        (positions.getX(i) / (r.w - 1) + .5) * r.w / 9,
        (.5 - positions.getZ(i) / (r.h - 1)) * r.h / 9);
      add(lawn, water ? 2 : yard || avenue || plaza ? 1 : 0, cx, ground, cz);
      if (open || plaza) {
        // No grounds furniture on roads or water; a plaza is an open paved square.
      } else if (park) {
        if (r.w > 70 && r.h > 70) {
          const bank = new THREE.RingGeometry(8.25, 9.2, 48); bank.rotateX(-Math.PI / 2); bank.scale(1, 1, .76);
          add(bank, 1, r.x + r.w * .3, ground + .065, r.y + r.h * .3, -.3);
          const pond = new THREE.CircleGeometry(8.5, 96); pond.rotateX(-Math.PI / 2); pond.scale(1, 1, .76);
          add(pond, 2, r.x + r.w * .3, ground + .05, r.y + r.h * .3, -.3);
        }
      } else {
        // Civic grounds retain their front walk and building surround.
        box(1, cx, ground + .012, cz, 3.2, .025, r.h);
        const lot = w.lots[b.lotIds[0]], bounds = lot?.bounds;
        if (bounds) box(1, cx, ground + .025, cz, bounds.w + 3.5, .04, bounds.h + 3.5);
      }
      // Iron boundary railings, with a generous opening on every public path.
      for (let edge = 0; edge < (open ? 0 : 4); edge++) {
        const horizontal = edge % 2 === 0, length = horizontal ? r.w : r.h;
        const point = (at: number) => horizontal ? [r.x + at, edge === 0 ? r.y : r.y + r.h] : [edge === 1 ? r.x + r.w : r.x, r.y + at];
        for (let at = 1; at < length; at += 4) {
          if (Math.abs(at - length / 2) < 3) continue;
          const [x, z] = point(at); box(3, x, ground + .65, z, .12, 1.3, .12);
        }
        for (const [a, e] of [[1, length / 2 - 3.2], [length / 2 + 3.2, length - 1]]) {
          const [ax, az] = point(a), [bx, bz] = point(e);
          line(3, ax, az, bx, bz, ground + .5, .07, .08);
          line(3, ax, az, bx, bz, ground + 1.15, .07, .08);
        }
      }
      const n = yard || open ? 0 : park ? Math.round((r.w + r.h) / 9) : plaza ? 4 : 8;
      for (let i = 0; i < n; i++) {
        const vertical = i % 2 === 0, side = i % 4 < 2 ? .1 : .9;
        const along = .08 + r01(b.id * 41 + i, 517) * .84;
        if (Math.abs(along - .5) < .065) continue;
        const x = r.x + r.w * (vertical ? side : along), z = r.y + r.h * (vertical ? along : side);
        const height = 4.5 + r01(b.id, i + 33) * 2.6;
        this.trees.push({ kind: TREE_KINDS[(b.id + i) % TREE_KINDS.length], x, y: ground, z,
          height: height + 2.2, angle: r01(b.id, i + 73) * Math.PI * 2 });
        if (detailedTrees) continue;
        add(new THREE.CylinderGeometry(.12, .22, height, 6), 4, x, ground + height / 2, z);
        for (let j = 0; j < 5; j++) {
          const crown = new THREE.IcosahedronGeometry(1.7 + r01(i, j + 90) * .7, 2);
          crown.scale(1, 1.25, 1);
          add(crown, 5 + j % 2, x + (r01(i, j + 12) - .5) * 2.5, ground + height + r01(i, j + 20), z + (r01(i, j + 45) - .5) * 2.5);
        }
      }
      for (let i = 0; i < (open ? 0 : park ? 4 : 2); i++) {
        const x = cx + (i % 2 ? 1 : -1) * 3.5, z = cz + (Math.floor(i / 2) ? 1 : -1) * r.h * .28;
        box(4, x, ground + .52, z, .7, .12, 2.6);
        box(4, x + (i % 2 ? .32 : -.32), ground + .9, z, .1, .6, 2.6);
        for (const dz of [-.95, .95]) box(3, x, ground + .25, z + dz, .5, .5, .12);
      }
    }

    // The original city's elevated railway: a girder deck down the middle column
    // of its blocks, on paired pylons that stand inside blocks, never in the road.
    const rail = w.cityLayout?.original;
    if (rail?.railColumn != null) {
      const cx = (rail.railColumn + .5) * CELL, deckY = 9, length = w.gridH * CELL;
      box(13, cx, deckY, length / 2, 5.6, .8, length);                // deck girders
      for (const side of [-1, 1]) {
        line(13, cx + side * 2.75, 0, cx + side * 2.75, length, deckY + .9, .18, 1);  // side girders
        line(13, cx + side * 2.8, 0, cx + side * 2.8, length, deckY + 1.42, .3, .1);  // top flange
        // Vertical stiffeners every 2.7 m along the plate girders.
        for (let z = 1.35; z < length; z += 2.7) box(13, cx + side * 2.86, deckY + .9, z, .08, 1.05, .14);
        // Two tracks, 1.4 m either side of the centre line.
        for (const gauge of [-.72, .72]) line(3, cx + side * 1.4 + gauge, 0, cx + side * 1.4 + gauge, length, deckY + .5, .1, .12);
      }
      this.trains = new ElevatedTrains(cx, deckY, length, rail.station ? (rail.station.y + .5) * CELL : null);
      this.group.add(this.trains.group);
      for (let gy = 0; gy < w.gridH; gy++) {
        const c = w.blocks[gy * w.gridW + rail.railColumn]?.original?.content;
        if (c !== 38 && c !== 39) continue; // pylons only on land blocks along the line
        for (const along of [16, 38]) {
          const z = gy * CELL + along;
          for (const side of [-1, 1]) box(13, cx + side * 2.4, deckY / 2, z, .45, deckY, .45);
          box(13, cx, deckY - .6, z, 5.4, .5, .5);
          // Diagonal bracing between the pylon pair.
          const span = 4.8, rise = deckY * .5, angle = Math.atan2(rise, span);
          for (const dir of [-1, 1]) add(new THREE.BoxGeometry(Math.hypot(span, rise), .14, .12).rotateZ(dir * angle), 13, cx, deckY * .5, z);
        }
      }
      if (rail.station) {
        const z = (rail.station.y + .5) * CELL;
        for (const side of [-1, 1]) {
          box(1, cx + side * 4.2, deckY + .35, z, 2.8, .3, 30);          // platforms
          box(3, cx + side * 4.2, deckY + 3.2, z, 3.2, .15, 26);         // canopies
          for (const along of [-11, 0, 11]) box(3, cx + side * 5.2, deckY + 1.8, z + along, .15, 2.8, .15);
        }
      }
    }

    // Rounded inset double track, with proper 1.435 m gauge on both tracks.
    const railEdges = new Set<string>();
    const gauges = [-2.2675, -.8325, .8325, 2.2675];
    const rails = (ax: number, az: number, bx: number, bz: number, base: number) => {
      line(8, ax, az, bx, bz, base + .018, .26, .02);
      line(7, ax, az, bx, bz, base + .065, .14, .03);
    };
    for (const route of cityTramLines(w)) {
      const pts = route.points;
      if (w.cityLayout.original && pts.length === 2 && (pts[0].x === pts[1].x || pts[0].y === pts[1].y)) {
        // The original city's tramway runs straight down an avenue's middle:
        // on the ballast bed of each median (on a bridge, the deck), and at
        // road level across the side streets between them.
        const alongX = pts[0].y === pts[1].y, fixed = alongX ? pts[0].y : pts[0].x;
        const g = Math.floor(fixed / CELL), n = alongX ? w.gridW : w.gridH, pieces: [number, number, number][] = [];
        const piece = (from: number, to: number, base: number) => {
          const last = pieces[pieces.length - 1];
          if (last && last[2] === base && Math.abs(last[1] - from) < .001) last[1] = to; else pieces.push([from, to, base]);
        };
        for (let k = 0; k < n; k++) {
          const b = w.blocks[alongX ? g * w.gridW + k : k * w.gridW + g];
          const r = blockRect(b), half = (alongX ? r.w : r.h) / 2 + paveWidth(w), mid = (k + .5) * CELL;
          const raised = b.layout?.use === 'avenue' && b.original?.content !== 37 ? KERB_H + .045 : 0;
          piece(k * CELL, mid - half, 0); piece(mid - half, mid + half, raised); piece(mid + half, (k + 1) * CELL, 0);
        }
        for (const [from, to, base] of pieces) for (const offset of gauges) {
          if (alongX) rails(from, fixed + offset, to, fixed + offset, base);
          else rails(fixed + offset, from, fixed + offset, to, base);
        }
        continue;
      }
      const path = new THREE.Path();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const incoming = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
        const outgoing = new THREE.Vector2(c.x - b.x, c.y - b.y).normalize();
        path.lineTo(b.x - incoming.x * 6, b.y - incoming.y * 6);
        path.quadraticCurveTo(b.x, b.y, b.x + outgoing.x * 6, b.y + outgoing.y * 6);
      }
      path.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      const samples = path.getPoints(5);
      for (const offset of [-2.2675, -.8325, .8325, 2.2675]) {
        const rail = samples.map((p, i) => {
          const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
          const n = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize(); return p.clone().addScaledVector(n, offset);
        });
        for (let i = 1; i < rail.length; i++) {
          const a = rail[i - 1], b = rail[i];
          const key = [a, b].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join(':');
          if (railEdges.has(key)) continue; railEdges.add(key);
          // Slightly broaden the rail head for the isometric game camera;
          // a literal 65 mm head aliases into a dotted line at street zoom.
          line(8, a.x, a.y, b.x, b.y, .018, .26, .02);
          line(7, a.x, a.y, b.x, b.y, .065, .14, .03);
        }
      }
      for (const stop of route.stops) {
        const i = pts.findIndex(p => p.x === stop.pos.x && p.y === stop.pos.y), before = pts[Math.max(0, i - 1)];
        const d = new THREE.Vector2(stop.pos.x - before.x, stop.pos.y - before.y).normalize();
        const offset = 5.3 + cityStreetInset(w);
        const x = stop.pos.x - d.x * 11 - d.y * offset, z = stop.pos.y - d.y * 11 + d.x * offset;
        box(3, x, KERB_H + 1.7, z, .1, 3.4, .1);
        box(1, x, KERB_H + 3.1, z, .8, .7, .16, Math.atan2(d.x, d.y));
        box(7, x, KERB_H + 3.1, z, .58, .38, .18, Math.atan2(d.x, d.y));
      }
    }
    // The river's shading follows its whole channel: banks, bends and bridges.
    this.river?.setRiverMask(riverRects, w.gridW * CELL, w.gridH * CELL);
    batches.forEach((batch, i) => {
      if (!batch.length) return;
      const geometry = mergeGeometries(batch); batch.forEach(g => g.dispose());
      if (!geometry) throw Error('Invalid landscape geometry');
      const mesh = new THREE.Mesh(geometry, materials[i]); mesh.receiveShadow = true;
      mesh.castShadow = [3, 4, 5, 6, 10, 11, 13].includes(i); this.group.add(mesh);
    });
    if (cityTramLines(w).length) { this.trams = new StreetTrams(w); this.group.add(this.trams.group); }
  }

  updateWater(seconds: number): void {
    if (this.water) this.water.waterTime.value = seconds;
    if (this.river) this.river.waterTime.value = seconds;
  }

  /** Move the street trams to a moment of the working week (minute and fraction: they stop when paused). */
  updateTrams(minute: number): void {
    this.trams?.update(minute);
  }

  /** Advance the elevated trains to simulated-clock time (they stop when paused). */
  updateTrains(simSeconds: number): void {
    this.trains?.update(simSeconds);
  }

  dispose(): void {
    this.trains?.dispose(); this.trains = undefined;
    this.trams?.dispose(); this.trams = undefined;
    this.group.removeFromParent();
    for (const child of this.group.children) (child as THREE.Mesh).geometry.dispose();
    this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); this.group.clear();
  }
}

/** Leave the cross and loop open to the sidewalk slab below. This preserves its
 * exact texture scale, alignment and block tint without a second paving layer. */
function parkLawn(width: number, depth: number): THREE.BufferGeometry {
  const halfX = (width - 1) / 2, halfZ = (depth - 1) / 2;
  const walks = [
    { x0: -1.6, x1: 1.6, z0: -halfZ, z1: halfZ },
    { x0: -halfX, x1: halfX, z0: -1.6, z1: 1.6 },
  ];
  for (const side of [-1, 1]) {
    walks.push({ x0: side * width * .33 - 1, x1: side * width * .33 + 1, z0: -depth * .33, z1: depth * .33 });
    walks.push({ x0: -width * .33, x1: width * .33, z0: side * depth * .33 - 1, z1: side * depth * .33 + 1 });
  }
  const xs = [...new Set([-halfX, halfX, ...walks.flatMap(p => [p.x0, p.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([-halfZ, halfZ, ...walks.flatMap(p => [p.z0, p.z1])])].sort((a, b) => a - b);
  const patches: THREE.BufferGeometry[] = [];
  for (let x = 1; x < xs.length; x++) for (let z = 1; z < zs.length; z++) {
    const cx = (xs[x - 1] + xs[x]) / 2, cz = (zs[z - 1] + zs[z]) / 2;
    if (walks.some(p => cx > p.x0 && cx < p.x1 && cz > p.z0 && cz < p.z1)) continue;
    patches.push(new THREE.PlaneGeometry(xs[x] - xs[x - 1], zs[z] - zs[z - 1])
      .rotateX(-Math.PI / 2).translate(cx, 0, cz));
  }
  const lawn = mergeGeometries(patches)!;
  patches.forEach(p => p.dispose());
  return lawn;
}
