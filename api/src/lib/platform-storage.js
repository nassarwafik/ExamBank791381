
const {BlobServiceClient}=require("@azure/storage-blob");
const CONTAINER="bank";
async function streamToBuffer(stream){const parts=[];for await(const chunk of stream)parts.push(Buffer.from(chunk));return Buffer.concat(parts)}
function getContainer(){const cs=process.env.AZURE_STORAGE_CONNECTION_STRING;if(!cs)throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");return BlobServiceClient.fromConnectionString(cs).getContainerClient(CONTAINER)}
async function downloadJsonOrNull(container,name){try{const r=await container.getBlobClient(name).download();if(!r.readableStreamBody)return null;return JSON.parse((await streamToBuffer(r.readableStreamBody)).toString("utf8"))}catch(e){if(e?.statusCode===404||e?.code==="BlobNotFound")return null;throw e}}
async function uploadJson(container,name,value){const body=JSON.stringify(value,null,2);await container.getBlockBlobClient(name).upload(body,Buffer.byteLength(body),{overwrite:true,blobHTTPHeaders:{blobContentType:"application/json; charset=utf-8"}})}
async function listJson(container,prefix){const out=[];for await(const blob of container.listBlobsFlat({prefix})){if(!blob.name.endsWith(".json"))continue;const value=await downloadJsonOrNull(container,blob.name);if(value)out.push(value)}return out}
module.exports={getContainer,downloadJsonOrNull,uploadJson,listJson};
