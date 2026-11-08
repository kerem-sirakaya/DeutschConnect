// Read-only checks against the explicitly allowed Codex test project.
// Never print keys, tokens, accounts, response bodies or configuration values.
import { readBackendConfig } from '../src/services/supabase.js';
try { process.loadEnvFile('.env.local'); } catch { /* environment may supply it */ }
const config=readBackendConfig(process.env);
const expectedHost='gdwxitcwtzkyfspjfoiw.supabase.co';
if(!config || new URL(config.url).hostname!==expectedHost) throw Error('Live probe refused: missing configuration or unexpected project.');
const checks=[];
async function probe(name,path,{method='GET',headers={},body}={}){
  try{
    const response=await fetch(config.url+path,{method,headers:{apikey:config.key,...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    let data;try{data=await response.json();}catch{/* preflight may have no JSON */}
    checks.push({name,status:response.status,...(name==='auth-settings'&&response.ok?{emailEnabled:data?.external?.email,signupDisabled:data?.disable_signup,emailAutoconfirm:data?.mailer_autoconfirm}:{}),...(data?.code?{code:data.code}:{}),...(response.headers.get('access-control-allow-origin')?{allowedOrigin:response.headers.get('access-control-allow-origin')}: {})});
  }catch{checks.push({name,status:'NETWORK_UNAVAILABLE'});}
}
await probe('auth-settings','/auth/v1/settings');
await probe('platform-preflight','/functions/v1/platform',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:5173','Access-Control-Request-Method':'POST'}});
await probe('platform-anonymous','/functions/v1/platform',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json'},body:{}});
await probe('platform-invalid-token','/functions/v1/platform',{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json',Authorization:'Bearer invalid-test-token'},body:{}});
await probe('platform-forbidden-origin','/functions/v1/platform',{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json'},body:{}});
await probe('workspace-anonymous','/rest/v1/dc_workspace?select=id&limit=0');
await probe('commands-anonymous','/rest/v1/dc_commands?select=command_id&limit=0');
console.log(JSON.stringify({checkedAt:new Date().toISOString(),target:'Codex test project only',checks},null,2));
const expected=[200,200,401,401,403,401,401];
if(checks.some((check,index)=>check.status!==expected[index]))process.exitCode=1;
