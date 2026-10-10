// Phase 21C — deterministic, bounded primitive-mesh expansion and renderer-neutral projection.
// Geometry is generated from validated ExamBank scene data; no renderer/library options are persisted.
// Phase 21D — geometry fidelity and stable framing:
//   • curved solids are tessellated by a QUALITY level (draft / low / medium / high) and the builder steps down a level rather than
//     failing when a large scene would exceed the mesh bounds; polyhedra (box, pyramid) keep their exact faces at every level;
//   • the cone has a true apex vertex, cylinder and cone caps are single polygons, sphere poles are triangle fans (no degenerate quads);
//   • every face carries its OUTWARD unit normal (convex solids: oriented away from the object's centre), and every mesh edge is
//     classified once as a CREASE (a true geometric edge: box / pyramid edges, cylinder and cone rims) or a smooth FACET edge between
//     two facets of a curved surface — the projection draws creases where visible and facet edges only where they form the silhouette;
//   • the projection frames the scene by its bounding SPHERE (centre + radius computed in world space), so the drawn size never depends
//     on the camera's orientation (the 21C projection re-scaled every frame from the rotated extents: a cube pulsed by ×1.41 per turn);
//   • faces are lit in camera space (key + fill light, ambient, a soft highlight on curved surfaces) instead of one flat colour.
import { SCENE3D_LIMITS, type Interactive3DSceneSpecV1, type Scene3DCamera, type Scene3DObjectV1, type Scene3DVec3 } from "./sceneSpec";

export const SCENE3D_QUALITIES = Object.freeze(["draft", "low", "medium", "high"] as const);
export type Scene3DQuality = (typeof SCENE3D_QUALITIES)[number];
/** Tessellation of curved solids per quality: sphere / ellipsoid longitude × latitude segments, cylinder / cone segments. */
export const SCENE3D_TESSELLATION: Readonly<Record<Scene3DQuality, { lon: number; lat: number; seg: number }>> = Object.freeze({
  draft: { lon: 16, lat: 8, seg: 16 },
  low: { lon: 24, lat: 12, seg: 24 },
  medium: { lon: 40, lat: 20, seg: 40 },
  high: { lon: 64, lat: 32, seg: 64 }
});

export type Scene3DMeshVertex = { point: Scene3DVec3; objectId: string; element?: string };
export type Scene3DMeshFace = { indices: number[]; objectId: string; element?: string; normal?: Scene3DVec3; curved?: boolean };
export type Scene3DMeshEdge = { a: number; b: number; objectId: string; element?: string };
/** A rendering line of the mesh: the two faces it separates and whether it is a true geometric edge (crease). */
export type Scene3DMeshLine = { a: number; b: number; f1: number; f2: number; crease: boolean; objectId: string };
export type Scene3DMesh = {
  vertices: Scene3DMeshVertex[]; faces: Scene3DMeshFace[]; edges: Scene3DMeshEdge[];
  lines?: Scene3DMeshLine[]; quality?: Scene3DQuality; bounds?: { center: Scene3DVec3; radius: number };
};

export type ProjectedScene3DPoint = { x: number; y: number; depth: number; objectId: string; element?: string; visible?: boolean };
export type ProjectedScene3DFace = {
  id: string; points: string; depth: number; objectId: string; element?: string; palette: number; opacity: number;
  /** faces the viewer (outward normal towards the camera) */
  front: boolean; fill: string; curved: boolean;
  /** a curved-surface facet facing slightly away, next to the silhouette: drawn behind the front facets so the outline reaches the
   *  true limb (culling alone would leave the outline one facet short of it) */
  rim: boolean;
};
export type ProjectedScene3DEdge = { id: string; x1: number; y1: number; x2: number; y2: number; depth: number; objectId: string; element?: string; visible?: boolean };
export type ProjectedScene3DLine = { id: string; x1: number; y1: number; x2: number; y2: number; depth: number; objectId: string; kind: "crease" | "silhouette" | "facet"; front: boolean };
export type ProjectedScene3D = {
  width: number; height: number; scale: number;
  points: ProjectedScene3DPoint[]; faces: ProjectedScene3DFace[]; edges: ProjectedScene3DEdge[]; lines: ProjectedScene3DLine[];
};

const add = (a: Scene3DVec3, b: Scene3DVec3): Scene3DVec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Scene3DVec3, b: Scene3DVec3): Scene3DVec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Scene3DVec3, b: Scene3DVec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Scene3DVec3): Scene3DVec3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
function rotate(p: Scene3DVec3, r?: Scene3DVec3): Scene3DVec3 {
  if (!r) return p;
  let { x, y, z } = p;
  let c = Math.cos(r.x), s = Math.sin(r.x); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r.y); s = Math.sin(r.y); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(r.z); s = Math.sin(r.z); [x, y] = [x * c - y * s, x * s + y * c];
  return { x, y, z };
}
function world(local: Scene3DVec3, o: Scene3DObjectV1): Scene3DVec3 { return add(rotate(local, o.rotation), o.center); }

function pushBox(mesh: Scene3DMesh, o: Scene3DObjectV1) {
  const hx=o.size.x/2, hy=o.size.y/2, hz=o.size.z/2;
  const defs: [string, Scene3DVec3][] = [
    ["A",{x:-hx,y:-hy,z:hz}],["B",{x:hx,y:-hy,z:hz}],["C",{x:hx,y:hy,z:hz}],["D",{x:-hx,y:hy,z:hz}],
    ["E",{x:-hx,y:-hy,z:-hz}],["F",{x:hx,y:-hy,z:-hz}],["G",{x:hx,y:hy,z:-hz}],["H",{x:-hx,y:hy,z:-hz}]
  ];
  const base=mesh.vertices.length;
  defs.forEach(([element,p])=>mesh.vertices.push({ point:world(p,o), objectId:o.id, element }));
  const ix=(name:string)=>base+defs.findIndex(d=>d[0]===name);
  const faces:[string,string[]][]=[
    ["front",["A","B","C","D"]],["back",["E","H","G","F"]],["left",["A","D","H","E"]],
    ["right",["B","F","G","C"]],["top",["D","C","G","H"]],["bottom",["A","E","F","B"]]
  ];
  faces.forEach(([element,names])=>mesh.faces.push({indices:names.map(ix),objectId:o.id,element}));
  for(const e of ["AB","BC","CD","DA","EF","FG","GH","HE","AE","BF","CG","DH"]) mesh.edges.push({a:ix(e[0]),b:ix(e[1]),objectId:o.id,element:e});
}
function pushPyramid(mesh: Scene3DMesh, o: Scene3DObjectV1) {
  const hx=o.size.x/2, hy=o.size.y/2, hz=o.size.z/2;
  const defs:[string,Scene3DVec3][]=[
    ["A",{x:-hx,y:-hy,z:hz}],["B",{x:hx,y:-hy,z:hz}],["C",{x:hx,y:-hy,z:-hz}],["D",{x:-hx,y:-hy,z:-hz}],["E",{x:0,y:hy,z:0}]
  ];
  const base=mesh.vertices.length;
  defs.forEach(([element,p])=>mesh.vertices.push({point:world(p,o),objectId:o.id,element}));
  const ix=(name:string)=>base+defs.findIndex(d=>d[0]===name);
  const faces:[string,string[]][]=[
    ["base",["A","D","C","B"]],["sideAB",["A","B","E"]],["sideBC",["B","C","E"]],["sideCD",["C","D","E"]],["sideDA",["D","A","E"]]
  ];
  faces.forEach(([element,names])=>mesh.faces.push({indices:names.map(ix),objectId:o.id,element}));
  for(const e of ["AB","BC","CD","DA","AE","BE","CE","DE"]) mesh.edges.push({a:ix(e[0]),b:ix(e[1]),objectId:o.id,element:e});
}
/** Sphere / ellipsoid: latitude rings between two poles; triangle fans at the poles, quads elsewhere. Full extents = size. */
function pushEllipsoid(mesh: Scene3DMesh, o: Scene3DObjectV1, lon: number, lat: number) {
  const a=o.size.x/2, b=o.size.y/2, c=o.size.z/2;
  const south=mesh.vertices.length; mesh.vertices.push({point:world({x:0,y:-b,z:0},o),objectId:o.id});
  const ring0=mesh.vertices.length;
  for(let j=1;j<lat;j++){
    const phi=Math.PI*j/lat-Math.PI/2, cp=Math.cos(phi), sp=Math.sin(phi);
    for(let i=0;i<lon;i++){ const th=2*Math.PI*i/lon; mesh.vertices.push({point:world({x:Math.cos(th)*cp*a,y:sp*b,z:Math.sin(th)*cp*c},o),objectId:o.id}); }
  }
  const north=mesh.vertices.length; mesh.vertices.push({point:world({x:0,y:b,z:0},o),objectId:o.id});
  const v=(j:number,i:number)=>ring0+(j-1)*lon+((i%lon)+lon)%lon;
  for(let i=0;i<lon;i++){
    mesh.faces.push({indices:[south,v(1,i+1),v(1,i)],objectId:o.id,curved:true});
    for(let j=1;j<lat-1;j++) mesh.faces.push({indices:[v(j,i),v(j,i+1),v(j+1,i+1),v(j+1,i)],objectId:o.id,curved:true});
    mesh.faces.push({indices:[v(lat-1,i),v(lat-1,i+1),north],objectId:o.id,curved:true});
  }
}
/** Cylinder / cone along the object's y axis, elliptic cross-section (radii size.x/2, size.z/2), height size.y. */
function pushCylinder(mesh: Scene3DMesh, o: Scene3DObjectV1, seg: number, cone=false) {
  const hy=o.size.y/2, rx=o.size.x/2, rz=o.size.z/2, base=mesh.vertices.length;
  for(let i=0;i<seg;i++){ const th=2*Math.PI*i/seg; mesh.vertices.push({point:world({x:Math.cos(th)*rx,y:-hy,z:Math.sin(th)*rz},o),objectId:o.id}); }
  const ring=(i:number)=>base+((i%seg)+seg)%seg;
  if(cone){
    const apex=mesh.vertices.length; mesh.vertices.push({point:world({x:0,y:hy,z:0},o),objectId:o.id});
    for(let i=0;i<seg;i++) mesh.faces.push({indices:[ring(i),ring(i+1),apex],objectId:o.id,curved:true});
  }else{
    const upper=mesh.vertices.length;
    for(let i=0;i<seg;i++){ const th=2*Math.PI*i/seg; mesh.vertices.push({point:world({x:Math.cos(th)*rx,y:hy,z:Math.sin(th)*rz},o),objectId:o.id}); }
    for(let i=0;i<seg;i++) mesh.faces.push({indices:[ring(i),ring(i+1),upper+((i+1)%seg),upper+i],objectId:o.id,curved:true});
    mesh.faces.push({indices:Array.from({length:seg},(_,i)=>upper+seg-1-i),objectId:o.id});
  }
  mesh.faces.push({indices:Array.from({length:seg},(_,i)=>ring(i)),objectId:o.id});
}

/** Newell normal of a planar polygon (robust for n-gons and slightly non-planar quads). */
function newell(points: Scene3DVec3[]): Scene3DVec3 {
  let x=0,y=0,z=0;
  for(let i=0;i<points.length;i++){ const p=points[i], q=points[(i+1)%points.length]; x+=(p.y-q.y)*(p.z+q.z); y+=(p.z-q.z)*(p.x+q.x); z+=(p.x-q.x)*(p.y+q.y); }
  return {x,y,z};
}
const centroid = (points: Scene3DVec3[]): Scene3DVec3 => { const s=points.reduce((a,p)=>add(a,p),{x:0,y:0,z:0}); return {x:s.x/points.length,y:s.y/points.length,z:s.z/points.length}; };
/** Outward normals (every supported solid is convex), crease / facet classification of every mesh edge, bounding sphere. */
function finish(mesh: Scene3DMesh, objects: Scene3DObjectV1[]) {
  const centers=new Map(objects.map(o=>[o.id,o.center]));
  for(const f of mesh.faces){
    const pts=f.indices.map(i=>mesh.vertices[i].point), n=norm(newell(pts));
    f.normal=dot(n,sub(centroid(pts),centers.get(f.objectId)!))<0?{x:-n.x,y:-n.y,z:-n.z}:n;
  }
  const seen=new Map<string,number>(), lines:Scene3DMeshLine[]=[];
  mesh.faces.forEach((f,fi)=>f.indices.forEach((a,k)=>{
    const b=f.indices[(k+1)%f.indices.length], key=a<b?a+"-"+b:b+"-"+a, other=seen.get(key);
    if(other===undefined){ seen.set(key,fi); return; }
    const n1=mesh.faces[other].normal!, n2=f.normal!;
    lines.push({a,b,f1:other,f2:fi,crease:dot(n1,n2)<Math.cos(Math.PI/6),objectId:f.objectId});
    seen.delete(key);
  }));
  mesh.lines=lines;
  let lo={x:Infinity,y:Infinity,z:Infinity}, hi={x:-Infinity,y:-Infinity,z:-Infinity};
  for(const v of mesh.vertices){ const p=v.point; lo={x:Math.min(lo.x,p.x),y:Math.min(lo.y,p.y),z:Math.min(lo.z,p.z)}; hi={x:Math.max(hi.x,p.x),y:Math.max(hi.y,p.y),z:Math.max(hi.z,p.z)}; }
  const center={x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2,z:(lo.z+hi.z)/2};
  let radius=0; for(const v of mesh.vertices) radius=Math.max(radius,Math.hypot(v.point.x-center.x,v.point.y-center.y,v.point.z-center.z));
  mesh.bounds={center,radius:Math.max(radius,1e-6)};
}

function buildAt(scene: Interactive3DSceneSpecV1, quality: Scene3DQuality): Scene3DMesh | null {
  const t=SCENE3D_TESSELLATION[quality], mesh:Scene3DMesh={vertices:[],faces:[],edges:[],quality};
  for(const o of scene.objects){
    if(o.kind==="box") pushBox(mesh,o);
    else if(o.kind==="pyramid") pushPyramid(mesh,o);
    else if(o.kind==="sphere"||o.kind==="ellipsoid") pushEllipsoid(mesh,o,t.lon,t.lat);
    else if(o.kind==="cylinder") pushCylinder(mesh,o,t.seg,false);
    else if(o.kind==="cone") pushCylinder(mesh,o,t.seg,true);
    if(mesh.vertices.length>SCENE3D_LIMITS.meshVertices||mesh.faces.length>SCENE3D_LIMITS.meshFaces) return null;
  }
  finish(mesh,scene.objects);
  return mesh;
}
/** The scene's mesh at `quality`, or at the highest LOWER quality that stays within the mesh bounds (never an empty mesh for a
 *  scene that fits at the draft level, which is at least as coarse as the 21C tessellation). */
export function buildInteractive3DMesh(scene: Interactive3DSceneSpecV1, quality: Scene3DQuality = "medium"): Scene3DMesh {
  for(let q=SCENE3D_QUALITIES.indexOf(quality);q>=0;q--){ const m=buildAt(scene,SCENE3D_QUALITIES[q]); if(m) return m; }
  return {vertices:[],faces:[],edges:[]};
}
/** Faces the scene would have at a quality (cheap: no geometry built) — for level-of-detail budgets. */
export function scene3DFaceCount(scene: Interactive3DSceneSpecV1, quality: Scene3DQuality): number {
  const t=SCENE3D_TESSELLATION[quality];
  return scene.objects.reduce((n,o)=>n+(o.kind==="box"?6:o.kind==="pyramid"?5:o.kind==="sphere"||o.kind==="ellipsoid"?t.lon*t.lat:o.kind==="cylinder"?t.seg+2:t.seg+1),0);
}

// ── lighting ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Palette base colours (sRGB), same hue families as 21C (1 slate … 6 rose … 8 lavender) with enough depth to carry shading. */
export const SCENE3D_PALETTE = Object.freeze(["#cfd8e3","#8fbbe0","#5e9fd2","#4a86bf","#5fae8f","#cf6f7f","#d9a83f","#8f97b5"] as const);
const toLinear=(c:number)=>{const s=c/255;return s<=0.04045?s/12.92:Math.pow((s+0.055)/1.055,2.4);};
const toSrgb=(l:number)=>{const v=l<=0.0031308?l*12.92:1.055*Math.pow(l,1/2.4)-0.055;return Math.round(Math.max(0,Math.min(1,v))*255);};
const LINEAR=SCENE3D_PALETTE.map(h=>[1,3,5].map(i=>toLinear(parseInt(h.slice(i,i+2),16))));
const KEY=norm({x:-0.42,y:0.58,z:0.70}), FILL=norm({x:0.62,y:-0.18,z:0.76}), HALF=norm({x:KEY.x,y:KEY.y,z:KEY.z+1});
const hex2=(n:number)=>n.toString(16).padStart(2,"0");
/** Lit colour of a face whose camera-space unit normal is n (viewer on +z). Back faces (seen through a transparent object) are dimmed. */
export function shadeScene3DFace(palette: number, n: Scene3DVec3, curved: boolean, front = true): string {
  const base=LINEAR[((Math.round(palette)-1)%LINEAR.length+LINEAR.length)%LINEAR.length];
  const lit=0.30+0.62*Math.max(0,dot(n,KEY))+0.20*Math.max(0,dot(n,FILL))+0.06*Math.max(0,n.y);
  const spec=curved?0.22*Math.pow(Math.max(0,dot(n,HALF)),36):0.05*Math.pow(Math.max(0,dot(n,HALF)),12);
  const k=front?1:0.55;
  return "#"+base.map(c=>hex2(toSrgb((c*lit+spec)*k))).join("");
}

/** The camera rotation (yaw about y, then pitch about x) with its sines and cosines computed once per projection. */
function cameraRotation(camera: Scene3DCamera): (p: Scene3DVec3) => Scene3DVec3 {
  const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  return p=>{const x=p.x*cy+p.z*sy, z=-p.x*sy+p.z*cy; return {x,y:p.y*cp-z*sp,z:p.y*sp+z*cp};};
}
/** Fraction of the viewer's shorter side the bounding sphere's diameter fills at zoom 1 (never clipped in any orientation at zoom ≤ 1). */
export const SCENE3D_FRAME = 0.9;

/** Orthographic projection framed by the scene's bounding sphere: rotation never changes the scale. Faces are back-to-front (painter),
 *  every face is returned with its facing and lit colour (renderers draw the front faces of opaque objects), lines are classified. */
/** Optional draw filter: a renderer passes what it will actually draw, so the per-frame work (point strings, shading, line objects,
 *  depth sorting) is spent only on those items. Without it every face and line is returned (the 21C projection contract). */
export type Scene3DProjectionFilter = {
  face?: (f: { front: boolean; rim: boolean; objectId: string }) => boolean;
  line?: (l: { kind: ProjectedScene3DLine["kind"]; front: boolean }) => boolean;
};
export function projectInteractive3DScene(mesh: Scene3DMesh, scene: Interactive3DSceneSpecV1, camera: Scene3DCamera, width=720, height=500, filter: Scene3DProjectionFilter={}): ProjectedScene3D {
  const w=Math.max(180,Math.min(1600,width)), h=Math.max(180,Math.min(1200,height));
  if(!mesh.bounds) finish(mesh,scene.objects);
  const {center,radius}=mesh.bounds!;
  const scale=Math.min(w,h)*SCENE3D_FRAME/2/radius*camera.zoom, rotate=cameraRotation(camera);
  const points:ProjectedScene3DPoint[]=mesh.vertices.map(v=>{const p=rotate(sub(v.point,center));return {x:w/2+p.x*scale,y:h/2-p.y*scale,depth:p.z,objectId:v.objectId,...(v.element?{element:v.element}:{}),visible:false};});
  const objectMap=new Map(scene.objects.map(o=>[o.id,o]));
  const normals=mesh.faces.map(f=>rotate(f.normal??{x:0,y:0,z:1})), front=normals.map(n=>n.z>1e-9);
  // a point is visible when a face that uses it faces the viewer (independent of what the renderer draws)
  mesh.faces.forEach((f,i)=>{ if(front[i]) for(const ix of f.indices) points[ix].visible=true; });
  // back to front (painter); equal depths keep the mesh order, so the drawing is deterministic
  const byDepth=(keep:number[],size:number,depth:(i:number)=>number)=>{const d=new Float64Array(size);for(const i of keep)d[i]=depth(i);return keep.sort((a,b)=>d[a]-d[b]||a-b);};
  const faceDepth=(f:Scene3DMeshFace)=>{let n=0;for(const ix of f.indices)n+=points[ix].depth;return n/Math.max(1,f.indices.length);};
  const rimOf=(i:number)=>!!mesh.faces[i].curved&&!front[i]&&normals[i].z>-0.25;
  const keptFaces:number[]=[];
  mesh.faces.forEach((f,i)=>{ if(!filter.face||filter.face({front:front[i],rim:rimOf(i),objectId:f.objectId})) keptFaces.push(i); });
  const faces:ProjectedScene3DFace[]=byDepth(keptFaces,mesh.faces.length,i=>faceDepth(mesh.faces[i])).map(i=>{
    const f=mesh.faces[i], q=f.indices.map(ix=>points[ix]), n=normals[i];
    const object=objectMap.get(f.objectId), palette=object?.palette??1, curved=!!f.curved, rim=rimOf(i);
    return {id:"face-"+i,points:q.map(p=>p.x.toFixed(2)+","+p.y.toFixed(2)).join(" "),depth:faceDepth(f),objectId:f.objectId,...(f.element?{element:f.element}:{}),palette,opacity:object?.opacity??1,
      front:front[i],curved,rim,fill:front[i]||rim?shadeScene3DFace(palette,n,curved,true):shadeScene3DFace(palette,{x:-n.x,y:-n.y,z:-n.z},curved,false)};
  });
  const lift=radius*0.02;
  // a semantic edge is visible when one of the two faces it separates faces the viewer
  const lineFront=new Map((mesh.lines??[]).map(l=>[l.a<l.b?l.a+"-"+l.b:l.b+"-"+l.a,front[l.f1]||front[l.f2]]));
  const edges:ProjectedScene3DEdge[]=byDepth(mesh.edges.map((_,i)=>i),mesh.edges.length,i=>(points[mesh.edges[i].a].depth+points[mesh.edges[i].b].depth)/2).map(i=>{
    const e=mesh.edges[i], a=points[e.a],b=points[e.b];
    return {id:"edge-"+i,x1:a.x,y1:a.y,x2:b.x,y2:b.y,depth:(a.depth+b.depth)/2,objectId:e.objectId,...(e.element?{element:e.element}:{}),visible:lineFront.get(e.a<e.b?e.a+"-"+e.b:e.b+"-"+e.a)??true};
  });
  const meshLines=mesh.lines??[], kindOf=(l:Scene3DMeshLine):ProjectedScene3DLine["kind"]=>l.crease?"crease":front[l.f1]!==front[l.f2]?"silhouette":"facet";
  const keptLines:number[]=[];
  meshLines.forEach((l,i)=>{ if(!filter.line||filter.line({kind:kindOf(l),front:front[l.f1]||front[l.f2]})) keptLines.push(i); });
  const lines:ProjectedScene3DLine[]=byDepth(keptLines,meshLines.length,i=>(points[meshLines[i].a].depth+points[meshLines[i].b].depth)/2).map(i=>{
    const l=meshLines[i], a=points[l.a], b=points[l.b];
    return {id:"line-"+i,x1:a.x,y1:a.y,x2:b.x,y2:b.y,depth:(a.depth+b.depth)/2+lift,objectId:l.objectId,kind:kindOf(l),front:front[l.f1]||front[l.f2]};
  });
  return {width:w,height:h,scale,points,faces,edges,lines};
}

/** Faces allowed at rest and while the camera moves (auto quality): detail at rest, fluid motion while turning. Calibrated in real
 *  Chromium with a 4x CPU slowdown (docs/phase21d-3d-performance.md): up to about 700 faces (≈ 400 drawn polygons) keep a dragged
 *  model at 60 frames per second there; the rest budget bounds the single redraw when the motion settles. */
export const SCENE3D_REST_BUDGET = 4500;
export const SCENE3D_INTERACTION_BUDGET = 700;
/** The highest quality at or below `ceiling` whose face count fits the budget (draft if none does). */
export function scene3DQualityFor(scene: Interactive3DSceneSpecV1, budget: number, ceiling: Scene3DQuality = "high"): Scene3DQuality {
  for (let q = SCENE3D_QUALITIES.indexOf(ceiling); q > 0; q--) if (scene3DFaceCount(scene, SCENE3D_QUALITIES[q]) <= budget) return SCENE3D_QUALITIES[q];
  return "draft";
}
