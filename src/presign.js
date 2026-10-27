const crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const hmac=(key,value)=>crypto.createHmac('sha256',key).update(value).digest();
const encode=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
function presign(userId,extension){
 const endpoint=new URL(process.env.MINIO_PUBLIC_URL||'http://localhost:9000');
 const bucket=process.env.MINIO_BUCKET||'avatars';const access=process.env.MINIO_ACCESS_KEY||'minioadmin';const secret=process.env.MINIO_SECRET_KEY||'minioadmin123';
 const key=`${userId}/${crypto.randomUUID()}.${extension}`;const path='/'+encode(bucket)+'/'+key.split('/').map(encode).join('/');
 const timestamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');const date=timestamp.slice(0,8);const scope=`${date}/us-east-1/s3/aws4_request`;
 const params={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`${access}/${scope}`,'X-Amz-Date':timestamp,'X-Amz-Expires':'300','X-Amz-SignedHeaders':'host'};
 const query=Object.keys(params).sort().map(k=>encode(k)+'='+encode(params[k])).join('&');
 const canonical=['PUT',path,query,`host:${endpoint.host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');
 const stringToSign=['AWS4-HMAC-SHA256',timestamp,scope,hash(canonical)].join('\n');
 const signing=hmac(hmac(hmac(hmac('AWS4'+secret,date),'us-east-1'),'s3'),'aws4_request');
 return {uploadUrl:`${endpoint.origin}${path}?${query}&X-Amz-Signature=${hmac(signing,stringToSign).toString('hex')}`,objectKey:key,bucket,expiresIn:300,method:'PUT'};
}
module.exports={presign};
