
// Deploy this directory as a separate Node.js serverless project. No secrets in the static site.
const origins=new Set(['https://foundationaiadvisory.com','https://www.foundationaiadvisory.com']);
const emailPattern=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const line=value=>typeof value==='string'&&!/[\r\n\x00-\x1f\x7f]/.test(value);
export async function processContact(req,env=process.env,fetcher=fetch){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const origin=req.headers.get('origin');
 const reply=(status,error)=>new Response(JSON.stringify(status===200?{ok:true}:{ok:false,error}),{status,headers});
 if(!origins.has(origin))return reply(403,'Origin not allowed.');
 headers['Access-Control-Allow-Origin']=origin;
 headers['Access-Control-Allow-Methods']='POST, OPTIONS';
 headers['Access-Control-Allow-Headers']='Content-Type';
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,'Use POST.');
 if(!env.RESEND_API_KEY||!env.TURNSTILE_SECRET_KEY)return reply(503,'Service unavailable.');
 if(!(req.headers.get('content-type')||'').startsWith('application/json'))return reply(415,'Use JSON.');
 let body;try{
  const reader=req.body?.getReader();if(!reader)return reply(400,'Missing body.');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return reply(413,'Request too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  body=JSON.parse(new TextDecoder().decode(bytes));
 }catch{return reply(400,'Invalid request.');}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,'Invalid request.');
 const {name,email,company,message='',website='',token,submissionId,context='Website inquiry'}=body;
 if(!line(name)||!name.trim()||name.length>120||!line(company)||!company.trim()||company.length>160||
 !line(email)||email.length>254||!emailPattern.test(email)||typeof message!=='string'||message.length>4000||
 !line(context)||context.length>160||typeof website!=='string'||website||
 typeof token!=='string'||!token||token.length>2048||
 typeof submissionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId))
 return reply(400,'Check the form fields.');
 try{
  const verification=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),
   body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token})
  });
  if(!verification.ok)return reply(503,'Security check unavailable.');
  const verified=await verification.json();
  if(!verified.success||verified.action!=='contact'||!['foundationaiadvisory.com','www.foundationaiadvisory.com'].includes(verified.hostname))
   return reply(400,'Please repeat the security check.');
  const response=await fetcher('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'faa-contact/'+submissionId},
   body:JSON.stringify({
    from:'Foundation AI Advisory Website <website@foundationaiadvisory.com>',
    to:['blueprint@foundationaiadvisory.com'],reply_to:email,
    subject:'FAA website inquiry',
    text:['Name: '+name.trim(),'Work email: '+email,'Company: '+company.trim(),'Interest: '+context,'','What they would like to improve:',message.trim()||'(Not provided)'].join('\n')
   })
  });
  if(!response.ok)return reply(502,'Unable to confirm submission.');
  const result=await response.json();if(!result.id)return reply(502,'Unable to confirm submission.');
  return reply(200);
 }catch{return reply(503,'Unable to confirm submission.');}
}
// Vercel Node handler; also usable behind another Node host via processContact.
export default async function handler(req,res){
 const headers=new Headers();
 for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
 const method=req.method||'GET';
 let body;
 if(!['GET','HEAD','OPTIONS'].includes(method)){
  // Runtime-parsed bodies are bounded again by processContact.
  if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else {const {Readable}=await import('node:stream');body=Readable.toWeb(req);}
 }
 const response=await processContact(new Request('https://contact.internal/api/contact',{method,headers,body,duplex:'half'}));
 res.statusCode=response.status;for(const [key,value] of response.headers)res.setHeader(key,value);
 res.end(await response.text());
}
