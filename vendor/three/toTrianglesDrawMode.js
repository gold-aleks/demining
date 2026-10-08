import {
	TriangleFanDrawMode,
	TriangleStripDrawMode,
	TrianglesDrawMode,
} from './three.module.min.js';

/**
 * Перетворює TRIANGLE_STRIP / TRIANGLE_FAN на звичайні трикутники.
 * Спрощена копія three/examples/jsm/utils/BufferGeometryUtils.toTrianglesDrawMode.
 * @param {import('three').BufferGeometry} geometry
 * @param {number} drawMode
 * @returns {import('three').BufferGeometry}
 */
export function toTrianglesDrawMode(geometry, drawMode) {
  if (drawMode === TrianglesDrawMode) return geometry;

  if (drawMode !== TriangleFanDrawMode && drawMode !== TriangleStripDrawMode) {
    console.error('toTrianglesDrawMode(): unknown draw mode', drawMode);
    return geometry;
  }

  let index = geometry.getIndex();
  if (index === null) {
    const position = geometry.getAttribute('position');
    if (!position) return geometry;
    const indices = [];
    for (let i = 0; i < position.count; i += 1) indices.push(i);
    geometry.setIndex(indices);
    index = geometry.getIndex();
  }

  const numberOfTriangles = index.count - 2;
  const newIndices = [];

  if (drawMode === TriangleFanDrawMode) {
    for (let i = 1; i <= numberOfTriangles; i += 1) {
      newIndices.push(index.getX(0), index.getX(i), index.getX(i + 1));
    }
  } else {
    for (let i = 0; i < numberOfTriangles; i += 1) {
      if (i % 2 === 0) {
        newIndices.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      } else {
        newIndices.push(index.getX(i + 2), index.getX(i + 1), index.getX(i));
      }
    }
  }

  const next = geometry.clone();
  next.setIndex(newIndices);
  next.clearGroups();
  return next;
}
