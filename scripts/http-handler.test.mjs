import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformHandler } from '../supabase/functions/_shared/platformHandler.js';

const verified={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email_confirmed_at:'2026-01-01'};
const create=()=>createPlatformHandler({url:'https://test.invalid',serviceKey:'server-only',publicKey:'public-test',origins:['http://127.0.0.1:4180'],moderators:[],fetcher:async()=>Response.json(verified)});
test('HTTP boundary rejects malformed JSON and non-object envelopes as invalid input, not server outages',async()=>{
  for(const body of ['{broken','null','[]','"text"']){
    const response=await create()(new Request('https://test.invalid/functions/v1/platform',{method:'POST',headers:{Authorization:'Bearer fixture'},body}));
    assert.equal(response.status,400,body);assert.deepEqual(await response.json(),{error:'invalid-input'});
  }
});
test('HTTP boundary checks method, origin, authentication and command ID before database access',async()=>{
  let databaseCalls=0;
  const handler=createPlatformHandler({url:'https://test.invalid',serviceKey:'server-only',publicKey:'public-test',origins:['http://127.0.0.1:4180'],moderators:[],fetcher:async(url)=>{if(url.includes('/rest/'))databaseCalls++;return Response.json(verified);}});
  for(const [method,headers,body,status] of [['GET',{},undefined,403],['POST',{Origin:'https://other.invalid'},'{}',403],['POST',{},'{}',401],['POST',{Authorization:'Bearer fixture'},'{"action":{"type":"preferences"},"commandId":"bad!"}',400]]){
    const response=await handler(new Request('https://test.invalid/functions/v1/platform',{method,headers,body}));assert.equal(response.status,status);
  }
  assert.equal(databaseCalls,0);
});
test('HTTP boundary rejects unconfirmed identities before accessing the database',async()=>{
  let requests=0;
  const handler=createPlatformHandler({url:'https://test.invalid',serviceKey:'server-only',publicKey:'public-test',origins:['http://127.0.0.1:4180'],moderators:[],fetcher:async()=>{requests++;return Response.json({id:verified.id});}});
  const response=await handler(new Request('https://test.invalid/functions/v1/platform',{method:'POST',headers:{Authorization:'Bearer fixture'},body:'{}'}));
  assert.equal(response.status,403);assert.equal(requests,1);assert.deepEqual(await response.json(),{error:'verification-required'});
});
