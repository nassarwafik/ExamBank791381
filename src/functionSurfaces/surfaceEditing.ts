import type { SurfaceSpecV1 } from "./surfaceSpec";
export const SURFACE_TEMPLATE_KEYS = Object.freeze(["paraboloid","saddle","wave","dome"] as const);
export type SurfaceTemplateKey=(typeof SURFACE_TEMPLATE_KEYS)[number];
export const SURFACE_TEMPLATE_LABELS:Readonly<Record<SurfaceTemplateKey,string>>=Object.freeze({paraboloid:"قطع مكافئ z = x² + y²",saddle:"سطح سرجي z = x² − y²",wave:"سطح موجي z = sin(x) cos(y)",dome:"قبة كروية z = √(4 − x² − y²)"});
export const newSurfaceId=()=> "surface-"+Math.random().toString(36).slice(2,8);
export function surfaceTemplate(key:SurfaceTemplateKey,id=newSurfaceId()):SurfaceSpecV1{
 if(key==="saddle")return{version:1,id,title:"سطح سرجي",description:"تمثيل ثلاثي الأبعاد للدالة z = x^2-y^2.",expression:"x^2-y^2",viewport:{xMin:-2,xMax:2,yMin:-2,yMax:2,zMin:-5,zMax:5},grid:{xSteps:20,ySteps:20}};
 if(key==="wave")return{version:1,id,title:"سطح موجي",description:"تمثيل ثلاثي الأبعاد للدالة z = sin(x)*cos(y).",expression:"sin(x)*cos(y)",viewport:{xMin:-3.14159,xMax:3.14159,yMin:-3.14159,yMax:3.14159,zMin:-1.5,zMax:1.5},grid:{xSteps:20,ySteps:20}};
 if(key==="dome")return{version:1,id,title:"قبة كروية",description:"النصف العلوي من كرة نصف قطرها 2 ضمن مجال العرض.",expression:"sqrt(4-x^2-y^2)",viewport:{xMin:-2,xMax:2,yMin:-2,yMax:2,zMin:-0.2,zMax:2.5},grid:{xSteps:20,ySteps:20}};
 return{version:1,id,title:"سطح قطع مكافئ",description:"تمثيل ثلاثي الأبعاد للدالة z = x^2+y^2.",expression:"x^2+y^2",viewport:{xMin:-2,xMax:2,yMin:-2,yMax:2,zMin:-1,zMax:9},grid:{xSteps:20,ySteps:20}};
}
export const defaultSurface=(id=newSurfaceId()):SurfaceSpecV1=>surfaceTemplate("paraboloid",id);
