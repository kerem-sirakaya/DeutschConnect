// LOCAL SIMULATOR: real HTTP + production handler/models; fake Auth and SQL/CAS.
// No request from this adapter reaches Supabase or another external service.
import { createServer } from 'node:http';
import { createPlatformHandler } from '../../supabase/functions/_shared/platformHandler.js';
import { emptyPlatform,addAccount,applyPlatformAction } from '../../supabase/functions/_shared/platform.js';

export const password='Fictional-Test-Password-123';
const ids={a:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',b:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',c:'cccccccc-cccc-4ccc-cccc-cccccccccccc'};
export async function startBackend(){
  let state,revision,users,sessions,commands,failNext,loseNext,delayNext,release;
  const log=[];
  const reset=()=>{
    state=emptyPlatform();revision=0;users=new Map();sessions=new Map();commands=new Set();failNext=null;loseNext=null;delayNext=null;release?.();release=null;log.length=0;
    for(const [key,id] of Object.entries(ids)){
      const user={id,email:`${key}@test.invalid`,email_confirmed_at:new Date().toISOString(),user_metadata:{displayName:`Test ${key.toUpperCase()}`,language:'de'}};
      users.set(user.email,user);state=addAccount(state,user);
      state=applyPlatformAction(state,{type:'preferences',patch:{schoolId:key==='b'?'anka':'ers'}},id);
    }
  };
  reset();
  const json=(data,status=200)=>Response.json(data,{status});
  const identity=(request)=>sessions.get((request.headers.get('authorization')||'').replace('Bearer ',''));
  const handler=createPlatformHandler({url:'http://127.0.0.1:4181',serviceKey:'server-test-only',publicKey:'sb_publishable_local_e2e',origins:['http://127.0.0.1:4180'],moderators:[ids.c],
    fetcher:async(url,options={})=>{
      const request=new Request(url,options),path=new URL(url).pathname;
      if(path==='/auth/v1/user'){const user=identity(request);return user?json(user):json({error:'invalid-token'},401);}
      if(request.headers.get('apikey')!=='server-test-only')return json({code:'42501'},401);
      if(path==='/rest/v1/dc_workspace')return json([{revision,payload:structuredClone(state)}]);
      if(path==='/rest/v1/dc_commands'){
        const search=new URL(url).searchParams;
        return json(commands.has(search.get('actor_id')?.slice(3)+'|'+search.get('command_id')?.slice(3))?[{command_id:'exists'}]:[]);
      }
      if(path==='/rest/v1/rpc/dc_commit'){
        const body=await request.json(),key=body.p_actor+'|'+body.p_command;
        if(commands.has(key))return json(true);
        if(body.p_revision!==revision)return json(false);
        state=structuredClone(body.p_payload);revision++;commands.add(key);return json(true);
      }
      throw Error('Unexpected simulator request');
    }});
  const server=createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const text=Buffer.concat(chunks).toString();const path=new URL(req.url,'http://127.0.0.1:4181').pathname;
    const cors={'Access-Control-Allow-Origin':'http://127.0.0.1:4180','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
    const send=(data,status=200)=>{res.writeHead(status,cors);res.end(JSON.stringify(data));};
    if(req.method==='OPTIONS'){send({});return;}
    const request=new Request('http://127.0.0.1:4181'+req.url,{method:req.method,headers:req.headers,...(req.method!=='GET'?{body:text}:{})});
    if(path==='/functions/v1/platform'){
      let action;try{action=JSON.parse(text).action;}catch{/* handler checks invalid JSON */}
      if(action){log.push({type:action.type,actor:identity(request)?.id,commandId:JSON.parse(text).commandId});}
      if(action?.type===failNext){failNext=null;send({error:'unavailable'},503);return;}
      if(action?.type===delayNext){delayNext=null;await new Promise(resolve=>{release=resolve;});release=null;}
      const response=await handler(request);
      if(action?.type===loseNext){loseNext=null;res.writeHead(200,cors);res.write('{"interrupted":');res.flushHeaders();setTimeout(()=>res.destroy(),20);return;}
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(path==='/auth/v1/user'){const user=identity(request);send(user||{error:'invalid-token'},user?200:401);return;}
    let body={};try{body=JSON.parse(text||'{}');}catch{send({error:'invalid-input'},400);return;}
    if(path==='/auth/v1/token'){
      const user=body.refresh_token? sessions.get(body.refresh_token):users.get(body.email);
      if(!user || (!body.refresh_token&&body.password!==password)){send({error:'invalid_credentials'},400);return;}
      if(!user.email_confirmed_at){send({error:'email_not_confirmed'},400);return;}
      const access='access-'+crypto.randomUUID(),refresh='refresh-'+crypto.randomUUID();sessions.set(access,user);sessions.set(refresh,user);
      send({access_token:access,refresh_token:refresh,expires_in:3600});return;
    }
    if(path==='/auth/v1/signup'){
      if(!users.has(body.email))users.set(body.email,{id:crypto.randomUUID(),email:body.email,user_metadata:body.data||{}});
      send({});return;
    }
    if(path==='/auth/v1/resend'){send({});return;}
    if(path==='/auth/v1/logout'){sessions.delete((req.headers.authorization||'').replace('Bearer ',''));send({});return;}
    send({error:'not-found'},404);
  });
  await new Promise(resolve=>server.listen(4181,'127.0.0.1',resolve));
  return {ids,log,reset,getState:()=>structuredClone(state),getRevision:()=>revision,
    failNext:type=>{failNext=type;},loseNext:type=>{loseNext=type;},delayNext:type=>{delayNext=type;},release:()=>release?.(),
    confirm:email=>{users.get(email).email_confirmed_at=new Date().toISOString();},expire:()=>sessions.clear(),
    close:()=>new Promise(resolve=>server.close(resolve)),
  };
}
