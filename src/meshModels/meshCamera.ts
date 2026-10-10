// Phase 21D-B.1 — pure camera math of the mesh renderer (column-major 4×4, glTF axes: +Y up, the default view looks along −Z).
// The camera orbits the model's bounding-box centre on the SAME (yaw, pitch, zoom) state the shared Phase 21D orbit controller produces,
// and the framing distance is derived from the bounding SPHERE, so rotating never changes the model's size on screen (21D rule).
import { mat4Multiply, type MeshBounds, type Vec3 } from "./glbAsset";

export const MESH_FOV_Y = (35 * Math.PI) / 180;
export type OrbitState = { yaw: number; pitch: number; zoom: number };
export type MeshView = { view: Float32Array; proj: Float32Array; viewProj: Float32Array; eye: Vec3; center: Vec3; radius: number; near: number; far: number; distance: number };

export function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Float32Array {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
  ]);
}
export const boundsCenter = (b: MeshBounds): Vec3 => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
export const boundsRadius = (b: MeshBounds): number => Math.max(1e-6, Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2);

/** The orbit view of a model: the whole bounding sphere fits the narrower field of view at zoom 1, whatever the orientation. */
export function orbitView(bounds: MeshBounds, camera: OrbitState, aspect: number, fovY = MESH_FOV_Y): MeshView {
  const center = boundsCenter(bounds), radius = boundsRadius(bounds);
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(0.1, aspect));
  const fit = radius / Math.sin(Math.min(fovY, fovX) / 2);
  const distance = (fit * 1.04) / Math.max(0.05, camera.zoom);
  const cp = Math.cos(camera.pitch);
  const eye: Vec3 = [center[0] + distance * cp * Math.sin(camera.yaw), center[1] + distance * Math.sin(camera.pitch), center[2] + distance * cp * Math.cos(camera.yaw)];
  const near = Math.max(distance - radius * 1.5, radius * 0.01), far = distance + radius * 1.5;
  const view = lookAt(eye, center, [0, 1, 0]), proj = perspective(fovY, Math.max(0.1, aspect), near, far);
  return { view, proj, viewProj: mat4Multiply(proj, view), eye, center, radius, near, far, distance };
}

/** The inverse-transpose of the upper 3×3 of a model matrix (column-major 3×3), for normals under non-uniform scale. */
export function normalMatrix(m: Float32Array): Float32Array {
  const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
  const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
  const det = a00 * b01 + a01 * b11 + a02 * b21, id = Math.abs(det) > 1e-20 ? 1 / det : 0;
  return new Float32Array([
    b01 * id, (-a22 * a01 + a02 * a21) * id, (a12 * a01 - a02 * a11) * id,
    b11 * id, (a22 * a00 - a02 * a20) * id, (-a12 * a00 + a02 * a10) * id,
    b21 * id, (-a21 * a00 + a01 * a20) * id, (a11 * a00 - a01 * a10) * id
  ]);
}
/** A view-space direction (the light rig follows the camera) expressed in world space: the view rotation is orthonormal. */
export function viewDirToWorld(view: Float32Array, d: Vec3): Vec3 {
  const x = view[0] * d[0] + view[1] * d[1] + view[2] * d[2], y = view[4] * d[0] + view[5] * d[1] + view[6] * d[2], z = view[8] * d[0] + view[9] * d[1] + view[10] * d[2];
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
/** World point → normalised device coordinates (x, y in −1…1 when visible; z is the depth) or null behind the camera. */
export function projectPoint(viewProj: Float32Array, p: Vec3): Vec3 | null {
  const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
  const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
  const z = viewProj[2] * p[0] + viewProj[6] * p[1] + viewProj[10] * p[2] + viewProj[14];
  const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
  return w > 1e-9 ? [x / w, y / w, z / w] : null;
}
/** Part index ⇄ the RGBA8 colour of the GPU picking pass (0 = nothing selectable). */
export const encodePickId = (id: number): [number, number, number, number] => [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255, 1];
export const decodePickId = (r: number, g: number, b: number): number => r | (g << 8) | (b << 16);
