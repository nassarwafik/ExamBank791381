
const {BlobServiceClient}=require("@azure/storage-blob");
const CONTAINER="bank";
async function streamToBuffer(stream){const parts=[];for await(const chunk of stream)parts.push(Buffer.from(chunk));return Buffer.concat(parts)}
function getContainer(){const cs=process.env.AZURE_STORAGE_CONNECTION_STRING;if(!cs)throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");return BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER)}
async function downloadJsonOrNull(container,name){try{const r=await container.getBlobClient(name).download();if(!r.readableStreamBody)return null;return JSON.parse((await streamToBuffer(r.readableStreamBody)).toString("utf8"))}catch(e){if(e?.statusCode===404||e?.code==="BlobNotFound")return null;throw e}}
async function uploadJson(container,name,value){const body=JSON.stringify(value,null,2);await container.getBlockBlobClient(name).upload(body,Buffer.byteLength(body),{overwrite:true,blobHTTPHeaders:{blobContentType:"application/json; charset=utf-8"}})}
// Roadmap #27 — bounded-concurrency reads. Every teacher workflow used to download blobs strictly one
// after another (max 1 in flight), so wall time was (blob count × storage latency). Reads that are
// independent of each other now run up to READ_CONCURRENCY at a time. Semantics are unchanged: results
// keep the listing/input ORDER, missing blobs are still null/skipped, and the first non-404 error still
// rejects the whole operation (like Promise.all) — nothing is swallowed or reordered.
let READ_CONCURRENCY=8;
function setReadConcurrency(n){const v=Number(n);READ_CONCURRENCY=Number.isFinite(v)&&v>=1?Math.floor(v):8;return READ_CONCURRENCY}
function getReadConcurrency(){return READ_CONCURRENCY}
// Order-preserving concurrent map with a fixed number of workers. Stops scheduling new items after the
// first failure and rethrows that failure once the in-flight workers have settled (no unhandled rejections).
async function mapConcurrent(items,limit,fn){
 const list=Array.isArray(items)?items:[];const out=new Array(list.length);const workers=Math.max(1,Math.min(Math.floor(Number(limit)||1),list.length||1));
 let next=0,failure=null;
 async function worker(){while(!failure){const i=next++;if(i>=list.length)return;try{out[i]=await fn(list[i],i)}catch(e){if(!failure)failure=e;return}}}
 await Promise.all(Array.from({length:workers},worker));
 if(failure)throw failure;
 return out;
}
// Downloads many blobs by name (bounded concurrency); the result is aligned with `names` (null for missing).
async function downloadManyJson(container,names,limit){return mapConcurrent(names,limit||READ_CONCURRENCY,name=>downloadJsonOrNull(container,name))}
async function listJson(container,prefix){const names=await listBlobNames(container,prefix);const docs=await downloadManyJson(container,names);const out=[];for(const value of docs)if(value)out.push(value);return out}
// Returns the names of the .json blobs under a prefix (no download) — for callers that need to act on
// blobs by name, e.g. deleting a whole prefix.
async function listBlobNames(container,prefix){const out=[];for await(const blob of container.listBlobsFlat({prefix})){if(blob.name.endsWith(".json"))out.push(blob.name)}return out}
// Deletes a single blob if it exists (no error when it's already gone).
async function deleteBlob(container,name){await container.getBlobClient(name).deleteIfExists()}

// --- Optimistic concurrency helpers (opt-in; existing callers keep using uploadJson unchanged) ---

const MAX_MUTATE_ATTEMPTS=5;

class StorageConflictError extends Error{
 constructor(message){super(message||"Optimistic concurrency conflict.");this.name="StorageConflictError"}
}

function isConcurrencyConflict(e){
 const status=Number(e?.statusCode??e?.response?.status??0);
 const code=String(e?.code||e?.details?.errorCode||e?.errorCode||"");
 // 412 (If-Match precondition failed) is unambiguous — Azure Blob only returns it for a
 // failed conditional-header check, so any 412/ConditionNotMet is a real conflict.
 if(status===412||code==="ConditionNotMet")return true;
 // 409 is NOT unambiguous — Azure Blob also returns 409 for unrelated conditions (e.g. lease/
 // container state). Only treat it as a concurrency conflict when the code confirms it was our
 // If-None-Match creation race (BlobAlreadyExists); otherwise let it propagate as a real error.
 if(status===409&&code==="BlobAlreadyExists")return true;
 return false;
}

// Like downloadJsonOrNull, but also returns the blob's ETag (null when the blob doesn't exist)
// so a later write can be made conditional on nothing having changed it in between.
async function downloadJsonWithEtagOrNull(container,name){
 try{
  const r=await container.getBlobClient(name).download();
  if(!r.readableStreamBody)return {value:null,etag:null};
  const value=JSON.parse((await streamToBuffer(r.readableStreamBody)).toString("utf8"));
  return {value,etag:r.etag||null};
 }catch(e){
  if(e?.statusCode===404||e?.code==="BlobNotFound")return {value:null,etag:null};
  throw e;
 }
}

// Writes only if the blob still has the given ETag (update), or does not exist yet (etag===null,
// create-only via If-None-Match). Throws on conflict — callers should treat that as retryable via
// isConcurrencyConflict / mutateJsonWithRetry, not as an ordinary error.
async function uploadJsonConditional(container,name,value,etag){
 const body=JSON.stringify(value,null,2);
 const conditions=etag?{ifMatch:etag}:{ifNoneMatch:"*"};
 const r=await container.getBlockBlobClient(name).upload(body,Buffer.byteLength(body),{blobHTTPHeaders:{blobContentType:"application/json; charset=utf-8"},conditions});
 return r.etag||null;
}

// Roadmap #9 — optional observability hook. `observer` (when supplied) may implement onConflict/onRetry/
// onExhausted; each is invoked inside try/catch so an observer failure can never affect the write. This is an
// OPTIONAL 4th argument — every existing 3-arg call site is unaffected, and CAS correctness/retry timing are
// unchanged (the observer only WATCHES the same events). It never receives document contents, only an attempt
// counter, so nothing sensitive can be logged through it.
function safeObserve(observer,method,info){
 try{ if(observer&&typeof observer[method]==="function") observer[method](info);}catch{ /* observing must never break the write */ }
}

// Read-modify-write with automatic retry on optimistic-concurrency conflicts only.
// mutateFn(current) receives the freshest document (or null if it doesn't exist yet) on every
// attempt — including retries — and must return the full new document to write, or throw for any
// domain/validation failure (which is never retried and propagates immediately).
async function mutateJsonWithRetry(container,name,mutateFn,observer){
 for(let attempt=0;attempt<MAX_MUTATE_ATTEMPTS;attempt++){
  const {value,etag}=await downloadJsonWithEtagOrNull(container,name);
  const next=await mutateFn(value);
  try{
   await uploadJsonConditional(container,name,next,etag);
   return next;
  }catch(e){
   if(!isConcurrencyConflict(e))throw e;
   safeObserve(observer,"onConflict",{attempt:attempt+1});
   if(attempt+1<MAX_MUTATE_ATTEMPTS) safeObserve(observer,"onRetry",{attempt:attempt+1});
  }
 }
 safeObserve(observer,"onExhausted",{attempts:MAX_MUTATE_ATTEMPTS});
 throw new StorageConflictError("Optimistic concurrency conflict after "+MAX_MUTATE_ATTEMPTS+" attempts.");
}

module.exports={getContainer,downloadJsonOrNull,uploadJson,listJson,listBlobNames,deleteBlob,downloadJsonWithEtagOrNull,uploadJsonConditional,mutateJsonWithRetry,StorageConflictError,isConcurrencyConflict,mapConcurrent,downloadManyJson,setReadConcurrency,getReadConcurrency};
