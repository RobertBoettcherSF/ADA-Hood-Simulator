import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { characterInView, characterNeedsDetail, characterPixelHeight, noteStreetFrame, resetSimpleFigures, simpleFigures } from '../src/render/characterDetail';

function camera(zoom: number, flipped = false) {
  const h = 240 / zoom;
  const c = new THREE.OrthographicCamera(-h, h, h / 2, -h / 2, .1, 1600);
  const side = flipped ? -1 : 1;
  c.position.set(side * 600, 600 * Math.SQRT2 * Math.tan(Math.PI / 6), side * 600);
  c.lookAt(0, 0, 0); c.updateMatrixWorld(true);
  return c;
}

describe('character detail at city viewing sizes', () => {
  it('uses the detailed bodies throughout the former 2.3 zoom boundary', () => {
    for (const zoom of [2.19, 2.2, 2.29, 2.3, 3, 6]) {
      const c = camera(zoom), pixels = characterPixelHeight(c, 668);
      const foot = new THREE.Vector3().project(c), head = new THREE.Vector3(0, 1.8, 0).project(c);
      expect(pixels).toBeCloseTo(Math.abs(head.y - foot.y) * 668 / 2);
      expect(characterNeedsDetail(pixels), `zoom ${zoom}, ${pixels}px`).toBe(true);
    }
  });
  it('only simplifies tiny figures, allowing large windows and selected people to retain detail', () => {
    const c = camera(.7);
    expect(characterNeedsDetail(characterPixelHeight(c, 668))).toBe(false);
    expect(characterNeedsDetail(characterPixelHeight(camera(1.5), 668))).toBe(false);
    expect(characterNeedsDetail(characterPixelHeight(camera(1.5), 1080))).toBe(true);
    expect(characterNeedsDetail(characterPixelHeight(c, 2160))).toBe(true);
    expect(characterNeedsDetail(characterPixelHeight(c, 668), true)).toBe(true);
    expect(characterPixelHeight(camera(2.2, true), 668)).toBeCloseTo(characterPixelHeight(camera(2.2), 668));
  });
  it('rejects off-screen and depth-clipped people while allowing bodies across an edge', () => {
    expect(characterInView({ x: 1.03, y: 1.03, z: .2 })).toBe(true);
    expect(characterInView({ x: 1.2, y: 0, z: 0 })).toBe(false);
    expect(characterInView({ x: 0, y: -1.3, z: 0 })).toBe(false);
    expect(characterInView({ x: 0, y: 0, z: 1.1 })).toBe(false);
  });
  it('drops every figure together after a run of slow frames, and brings them back only after a run of quick ones', () => {
    resetSimpleFigures();
    expect(simpleFigures()).toBe(false);
    for (let i = 0; i < 14; i++) noteStreetFrame(60);
    expect(simpleFigures()).toBe(false);
    noteStreetFrame(60);
    expect(simpleFigures()).toBe(true);
    for (let i = 0; i < 119; i++) noteStreetFrame(16);
    expect(simpleFigures()).toBe(true);
    noteStreetFrame(16);
    expect(simpleFigures()).toBe(false);
    noteStreetFrame(60);
    noteStreetFrame(16);
    expect(simpleFigures()).toBe(false);
    resetSimpleFigures();
  });
});
