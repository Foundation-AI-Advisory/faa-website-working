import test from 'node:test';
import assert from 'node:assert/strict';
import {processContact} from './api/contact.mjs';
const env={RESEND_API_KEY:'test-secret',TURNSTILE_SECRET_KEY:'test-challenge'};
const valid={name:'Test User',email:'test@example.com',company:'Test Company',message:'Improve cycle time.',token:'token',submissionId:'77af4160-23a4-47ba-a6c4-e38ba368eabc'};
const request=(body=valid,origin='https://foundationaiadvisory.com',method='POST')=>new Request('https://backend.example/api/contact',{method,headers:{origin,'content-type':'application/json'},body:method==='POST'?JSON.stringify(body):undefined});
const verify={success:true,hostname:'foundationaiadvisory.com',action:'contact'};
test('valid submission has fixed recipient, reply-to, idempotency and no public secret',async()=>{
 const calls=[];const mock=async(url,options)=>{calls.push({url,options});return Response.json(calls.length===1?verify:{id:'email-123'});};
 const r=await processContact(request({...valid,to:'attacker@example.com'}),env,mock);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
 const payload=JSON.parse(calls[1].options.body);
 assert.deepEqual(payload.to,['blueprint@foundationaiadvisory.com']);assert.equal(payload.reply_to,'test@example.com');
 assert.equal(calls[1].options.headers['Idempotency-Key'],'faa-contact/'+valid.submissionId);
});
test('reject bad origins, missing secrets, malformed fields and oversized body without outbound requests',async()=>{
 const noFetch=()=>{throw new Error('Unexpected network call');};
 for(const [req,settings,expected] of [
 [request(valid,'https://evil.example'),env,403],[request(),{},503],
 [request({...valid,email:'a\r\nb@example.com'}),env,400],
 [request({...valid,website:'spam'}),env,400],[request({...valid,name:''}),env,400],
 [request({...valid,message:'x'.repeat(17000)}),env,413],
 [request(null),env,400],[request({...valid,token:''}),env,400]]){
 assert.equal((await processContact(req,settings,noFetch)).status,expected);
 }
});
test('challenge must match hostname and action; no send on failed verification',async()=>{
 for(const result of [{success:false},{...verify,hostname:'evil.example'},{...verify,action:'other'}]){
 let count=0;const r=await processContact(request(),env,async()=>{count++;return Response.json(result);});
 assert.equal(r.status,400);assert.equal(count,1);
 }
});
test('provider errors and network failures never report success or disclose secrets',async()=>{
 for(const failure of ['reject','throw','missing-id']){
 let count=0;const r=await processContact(request(),env,async()=>{if(++count===1)return Response.json(verify);if(failure==='throw')throw new Error('test-secret');return failure==='reject'?Response.json({message:'private provider error'},{status:429}):Response.json({});});
 assert.ok(r.status>=500);const text=await r.text();assert.ok(!text.includes('test-secret'));assert.ok(!text.includes('private'));
 }
});
test('CORS preflight and unsupported methods',async()=>{
 assert.equal((await processContact(request(valid,undefined,'OPTIONS'),env)).status,204);
 assert.equal((await processContact(request(valid,undefined,'GET'),env)).status,405);
});
