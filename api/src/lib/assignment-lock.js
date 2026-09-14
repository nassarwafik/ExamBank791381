
// Per-assignment lifecycle lock (Roadmap #7 concurrency hardening).
//
// WHY: optimistic concurrency (mutateJsonWithRetry) is single-blob only. An assignment and its student
// submissions live in DIFFERENT blobs, so an ETag CAS on one cannot serialize an operation that spans
// both — e.g. archive scanning the submission set then committing assignment.status, versus a student
// starting a new attempt / creating the first submission document. This lock makes the lifecycle
// operations and the state-CREATING student writes SERIALIZABLE with respect to each other.
//
// HOW: an Azure Blob lease on a tiny per-assignment lock blob. A lease is the canonical Azure distributed
// mutex and is CROSS-INSTANCE safe (Azure Functions may scale to many workers): the lease is enforced by
// the storage service, not by any single process, so it holds across instances. The lease is FINITE and
// auto-expires, so a worker that crashes mid-critical-section never blocks the assignment forever. The
// lock blob is only ever leased, never written during the critical section, so leasing it never interferes
// with the assignment/submission blob writes it guards. The lock is PER ASSIGNMENT (its own lock blob), so
// operations on different assignments never serialize against each other.
const {uploadJsonConditional}=require("./platform-storage");

const LOCK_PREFIX="platform/locks/assignment-";
// Azure blob lease duration must be 15..60s (or -1 infinite). Every critical section here is a handful of
// blob ops (sub-second), so 30s is comfortably longer than any real hold while still auto-releasing fast
// after a crash. We never renew: a section that somehow exceeded 30s would simply lose the lease, which is
// far safer than an infinite lease that a crash could strand.
const LEASE_SECONDS=30;
const ACQUIRE_ATTEMPTS=8;   // ~ capped exponential backoff below; total worst-case wait stays well under the lease TTL
const BASE_DELAY_MS=60;

// 503-style domain error: the assignment is momentarily busy under another lifecycle/state-write. Callers
// surface it as a retryable 503 rather than blocking a request thread indefinitely.
class AssignmentLockBusyError extends Error{
 constructor(assignmentId){super("الواجب قيد عملية أخرى. حاول مرة أخرى بعد لحظات.");this.name="AssignmentLockBusyError";this.assignmentId=assignmentId;this.httpStatus=503}
}

function lockName(assignmentId){return LOCK_PREFIX+String(assignmentId)+".lock"}

// During acquire the only expected 409 is lease contention (LeaseAlreadyPresent). Treat any 409 while
// acquiring as contention (retryable); anything else propagates as a real error.
function isLeaseContention(e){
 const status=Number(e?.statusCode??e?.response?.status??0);
 const code=String(e?.code||e?.details?.errorCode||e?.errorCode||"");
 return status===409||code==="LeaseAlreadyPresent";
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Ensure the tiny lock blob exists so a lease can be taken against it. Create-only (If-None-Match:*); a
// concurrent create (BlobAlreadyExists / ConditionNotMet) is fine — the blob just needs to exist.
async function ensureLockBlob(container,name){
 try{await uploadJsonConditional(container,name,{lock:true},null);}
 catch(e){
  const status=Number(e?.statusCode??e?.response?.status??0);
  const code=String(e?.code||e?.details?.errorCode||e?.errorCode||"");
  if(status===409||status===412||code==="BlobAlreadyExists"||code==="ConditionNotMet")return;
  throw e;
 }
}

// Run fn() while holding the per-assignment lease. The lease is ALWAYS released in finally — on the happy
// path AND when fn throws a domain error — so a rejected/validation path never strands the lock. Contention
// is retried with capped exponential backoff + jitter; if the lock stays held for the whole budget,
// AssignmentLockBusyError (503, retryable) is thrown and fn is NEVER run.
async function withAssignmentLock(container,assignmentId,fn,opts={}){
 const name=lockName(assignmentId);
 const leaseSeconds=opts.leaseSeconds||LEASE_SECONDS;
 const attempts=opts.attempts||ACQUIRE_ATTEMPTS;
 const base=opts.baseDelayMs||BASE_DELAY_MS;
 await ensureLockBlob(container,name);
 const leaseClient=container.getBlobClient(name).getBlobLeaseClient();
 let acquired=false;
 for(let i=0;i<attempts&&!acquired;i++){
  try{await leaseClient.acquireLease(leaseSeconds);acquired=true;}
  catch(e){
   if(!isLeaseContention(e))throw e;
   if(i===attempts-1)throw new AssignmentLockBusyError(assignmentId);
   await sleep(base*(2**i)+Math.floor(Math.random()*base));
  }
 }
 try{return await fn();}
 finally{try{await leaseClient.releaseLease();}catch{/* lease may have already expired — safe to ignore */}}
}

module.exports={withAssignmentLock,AssignmentLockBusyError,lockName,ensureLockBlob};
