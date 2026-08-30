
const {BlobServiceClient}=require("@azure/storage-blob");
const CONTAINER="bank";
async function streamToBuffer(stream){const parts=[];for await(const chunk of stream)parts.push(Buffer.from(chunk));return Buffer.concat(parts)}
function getContainer(){const cs=process.env.AZURE_STORAGE_CONNECTION_STRING;if(!cs)throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");return BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER)}
async function downloadJsonOrNull(container,name){try{const r=await container.getBlobClient(name).download();if(!r.readableStreamBody)return null;return JSON.parse((await streamToBuffer(r.readableStreamBody)).toString("utf8"))}catch(e){if(e?.statusCode===404||e?.code==="BlobNotFound")return null;throw e}}
async function uploadJson(container,name,value){const body=JSON.stringify(value,null,2);await container.getBlockBlobClient(name).upload(body,Buffer.byteLength(body),{overwrite:true,blobHTTPHeaders:{blobContentType:"application/json; charset=utf-8"}})}
async function listJson(container,prefix){const out=[];for await(const blob of container.listBlobsFlat({prefix})){if(!blob.name.endsWith(".json"))continue;const value=await downloadJsonOrNull(container,blob.name);if(value)out.push(value)}return out}

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

// Read-modify-write with automatic retry on optimistic-concurrency conflicts only.
// mutateFn(current) receives the freshest document (or null if it doesn't exist yet) on every
// attempt — including retries — and must return the full new document to write, or throw for any
// domain/validation failure (which is never retried and propagates immediately).
async function mutateJsonWithRetry(container,name,mutateFn){
 for(let attempt=0;attempt<MAX_MUTATE_ATTEMPTS;attempt++){
  const {value,etag}=await downloadJsonWithEtagOrNull(container,name);
  const next=await mutateFn(value);
  try{
   await uploadJsonConditional(container,name,next,etag);
   return next;
  }catch(e){
   if(!isConcurrencyConflict(e))throw e;
  }
 }
 throw new StorageConflictError("Optimistic concurrency conflict after "+MAX_MUTATE_ATTEMPTS+" attempts.");
}

module.exports={getContainer,downloadJsonOrNull,uploadJson,listJson,downloadJsonWithEtagOrNull,uploadJsonConditional,mutateJsonWithRetry,StorageConflictError,isConcurrencyConflict};
