const fs=require('node:fs');const path=require('node:path');
const {serve,json,body,signToken,verifyToken}=require('./common');const {presign}=require('./presign');
function start(port=8088,options={}){
 const userUrl=options.userUrl||process.env.USER_SERVICE_URL||'http://127.0.0.1:3001';const orderUrl=options.orderUrl||process.env.ORDER_SERVICE_URL||'http://127.0.0.1:3002';
 const hits=new Map();const timer=setInterval(()=>{const now=Date.now();for(const [key,times]of hits)if(!times.length||times[times.length-1]<=now-1000)hits.delete(key);},1000);timer.unref();
 async function upstream(base,route){try{const response=await fetch(base+route,{signal:AbortSignal.timeout(3000)});return {status:response.status,data:await response.json()};}catch{const e=new Error('Upstream service unavailable');e.status=502;throw e;}}
 const server=serve(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'../public/index.html')));}
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{status:'ok',service:'gateway'});
  // Sliding window per TCP peer IP; never trust client supplied X-Forwarded-For.
  const key=req.socket.remoteAddress;const now=Date.now();const recent=(hits.get(key)||[]).filter(t=>t>now-1000);
  if(recent.length>=10)return json(res,429,{error:'Rate limit exceeded: 10 requests/second'},{'Retry-After':String(Math.max(1,Math.ceil((recent[0]+1000-now)/1000)))});
  recent.push(now);hits.set(key,recent);
  if(req.method==='POST'&&url.pathname==='/auth/login'){
   const input=await body(req);const id=Number(input.userId);if(![1,2].includes(id)||input.password!==(process.env.DEMO_PASSWORD||'demo123'))return json(res,401,{error:'Invalid credentials'});
   return json(res,200,{accessToken:signToken(id),tokenType:'Bearer',expiresIn:3600});
  }
  const auth=req.headers.authorization||'';const claims=verifyToken(auth.startsWith('Bearer ')?auth.slice(7):'');if(!claims)return json(res,401,{error:'Valid Bearer JWT required'});
  if(req.method==='GET'&&url.pathname==='/dashboard'){
   const [user,orders]=await Promise.all([upstream(userUrl,'/users/'+claims.sub),upstream(orderUrl,'/orders?userId='+claims.sub)]);
   if(user.status!==200||orders.status!==200)return json(res,502,{error:'Unable to aggregate dashboard'});
   return json(res,200,{user:user.data,orders:orders.data,summary:{orderCount:orders.data.length,totalAmount:orders.data.reduce((sum,o)=>sum+o.total,0)}});
  }
  if(req.method==='POST'&&url.pathname==='/users/me/avatar-upload-url'){
   const input=await body(req);const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};if(!extensions[input.contentType])return json(res,400,{error:'Choose image/jpeg, image/png or image/webp'});
   return json(res,200,presign(claims.sub,extensions[input.contentType]));
  }
  let target;if(/^\/users(?:\/\d+)?$/.test(url.pathname))target=userUrl;if(/^\/orders(?:\/\d+)?$/.test(url.pathname))target=orderUrl;
  if(target&&req.method==='GET'){const result=await upstream(target,url.pathname+url.search);return json(res,result.status,result.data);}
  json(res,404,{error:'Not found'});
 },port,options.host||process.env.GATEWAY_HOST||'127.0.0.1');
 server.on('close',()=>clearInterval(timer));return server;
}
if(require.main===module)start();module.exports={start};
