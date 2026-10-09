// Phase 21C — deterministic, bounded primitive-mesh expansion and renderer-neutral projection.
// Geometry is generated from validated ExamBank scene data; no renderer/library options are persisted.
import { SCENE3D_LIMITS, type Interactive3DSceneSpecV1, type Scene3DCamera, type Scene3DObjectV1, type Scene3DVec3 } from "./sceneSpec";

export type Scene3DMeshVertex = { point: Scene3DVec3; objectId: string; element?: string };
export type Scene3DMeshFace = { indices: number[]; objectId: string; element?: string };
export type Scene3DMeshEdge = { a: number; b: number; objectId: string; element?: string };
export type Scene3DMesh = { vertices: Scene3DMeshVertex[]; faces: Scene3DMeshFace[]; edges: Scene3DMeshEdge[] };

export type ProjectedScene3DPoint = { x: number; y: number; depth: number; objectId: string; element?: string };
export type ProjectedScene3DFace = { id: string; points: string; depth: number; objectId: string; element?: string; palette: number; opacity: number };
export type ProjectedScene3DEdge = { id: string; x1: number; y1: number; x2: number; y2: number; depth: number; objectId: string; element?: string };
export type ProjectedScene3D = { width: number; height: number; points: ProjectedScene3DPoint[]; faces: ProjectedScene3DFace[]; edges: ProjectedScene3DEdge[] };

const add = (a: Scene3DVec3, b: Scene3DVec3): Scene3DVec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
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
function pushEllipsoid(mesh: Scene3DMesh, o: Scene3DObjectV1) {
  const lon=14, lat=9, base=mesh.vertices.length;
  for(let j=0;j<=lat;j++){
    const phi=Math.PI*j/lat-Math.PI/2, cp=Math.cos(phi), sp=Math.sin(phi);
    for(let i=0;i<lon;i++){
      const th=2*Math.PI*i/lon;
      mesh.vertices.push({point:world({x:Math.cos(th)*cp*o.size.x/2,y:sp*o.size.y/2,z:Math.sin(th)*cp*o.size.z/2},o),objectId:o.id});
    }
  }
  const idx=(j:number,i:number)=>base+j*lon+((i%lon)+lon)%lon;
  for(let j=0;j<lat;j++) for(let i=0;i<lon;i++){
    const a=idx(j,i),b=idx(j,i+1),c=idx(j+1,i+1),d=idx(j+1,i);
    mesh.faces.push({indices:[a,b,c,d],objectId:o.id});
  }
}
function pushCylinder(mesh: Scene3DMesh, o: Scene3DObjectV1, cone=false) {
  const seg=16, base=mesh.vertices.length, hy=o.size.y/2, rx=o.size.x/2, rz=o.size.z/2;
  for(let i=0;i<seg;i++){
    const th=2*Math.PI*i/seg;
    mesh.vertices.push({point:world({x:Math.cos(th)*rx,y:-hy,z:Math.sin(th)*rz},o),objectId:o.id});
  }
  const upper=mesh.vertices.length;
  for(let i=0;i<seg;i++){
    const th=2*Math.PI*i/seg, scale=cone?0.001:1;
    mesh.vertices.push({point:world({x:Math.cos(th)*rx*scale,y:hy,z:Math.sin(th)*rz*scale},o),objectId:o.id});
  }
  const bottomCenter=mesh.vertices.length; mesh.vertices.push({point:world({x:0,y:-hy,z:0},o),objectId:o.id});
  const topCenter=mesh.vertices.length; mesh.vertices.push({point:world({x:0,y:hy,z:0},o),objectId:o.id});
  for(let i=0;i<seg;i++){
    const ni=(i+1)%seg;
    mesh.faces.push({indices:[base+i,base+ni,upper+ni,upper+i],objectId:o.id});
    mesh.faces.push({indices:[bottomCenter,base+ni,base+i],objectId:o.id});
    if(!cone) mesh.faces.push({indices:[topCenter,upper+i,upper+ni],objectId:o.id});
  }
}

export function buildInteractive3DMesh(scene: Interactive3DSceneSpecV1): Scene3DMesh {
  const mesh:Scene3DMesh={vertices:[],faces:[],edges:[]};
  for(const o of scene.objects){
    if(o.kind==="box") pushBox(mesh,o);
    else if(o.kind==="pyramid") pushPyramid(mesh,o);
    else if(o.kind==="sphere"||o.kind==="ellipsoid") pushEllipsoid(mesh,o);
    else if(o.kind==="cylinder") pushCylinder(mesh,o,false);
    else if(o.kind==="cone") pushCylinder(mesh,o,true);
    if(mesh.vertices.length>SCENE3D_LIMITS.meshVertices||mesh.faces.length>SCENE3D_LIMITS.meshFaces) return {vertices:[],faces:[],edges:[]};
  }
  return mesh;
}

function cameraPoint(p: Scene3DVec3, camera: Scene3DCamera): Scene3DVec3 {
  let {x,y,z}=p;
  let c=Math.cos(camera.yaw),s=Math.sin(camera.yaw); [x,z]=[x*c+z*s,-x*s+z*c];
  c=Math.cos(camera.pitch);s=Math.sin(camera.pitch); [y,z]=[y*c-z*s,y*s+z*c];
  return {x,y,z};
}

export function projectInteractive3DScene(mesh: Scene3DMesh, scene: Interactive3DSceneSpecV1, camera: Scene3DCamera, width=720, height=500): ProjectedScene3D {
  const w=Math.max(180,Math.min(1600,width)), h=Math.max(180,Math.min(1200,height));
  const rotated=mesh.vertices.map(v=>({...cameraPoint(v.point,camera),objectId:v.objectId,element:v.element}));
  let radius=1;
  for(const p of rotated) radius=Math.max(radius,Math.abs(p.x),Math.abs(p.y),Math.abs(p.z));
  const scale=Math.min(w,h)*0.39/radius*camera.zoom;
  const points:ProjectedScene3DPoint[]=rotated.map(p=>({x:w/2+p.x*scale,y:h/2-p.y*scale,depth:p.z,objectId:p.objectId,...(p.element?{element:p.element}:{})}));
  const objectMap=new Map(scene.objects.map(o=>[o.id,o]));
  const faces:ProjectedScene3DFace[]=mesh.faces.map((f,i)=>{
    const q=f.indices.map(ix=>points[ix]);
    const depth=q.reduce((n,p)=>n+p.depth,0)/Math.max(1,q.length);
    const object=objectMap.get(f.objectId);
    return {id:"face-"+i,points:q.map(p=>p.x.toFixed(2)+","+p.y.toFixed(2)).join(" "),depth,objectId:f.objectId,...(f.element?{element:f.element}:{}),palette:object?.palette??1,opacity:object?.opacity??1};
  }).sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
  const edges:ProjectedScene3DEdge[]=mesh.edges.map((e,i)=>{
    const a=points[e.a],b=points[e.b];
    return {id:"edge-"+i,x1:a.x,y1:a.y,x2:b.x,y2:b.y,depth:(a.depth+b.depth)/2,objectId:e.objectId,...(e.element?{element:e.element}:{})};
  }).sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
  return {width:w,height:h,points,faces,edges};
}
