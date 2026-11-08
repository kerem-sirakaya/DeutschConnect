// Opt-in only. Uses dedicated confirmed fictitious accounts; never owner/student accounts.
import {test,expect} from '@playwright/test';
import {readBackendConfig} from '../../src/services/supabase.js';
try{process.loadEnvFile('.env.local');}catch{/* CI environment */}
const config=readBackendConfig(process.env);
const enabled=process.env.DC_E2E_TEST_ACCOUNTS_ONLY==='1'&&['A','B'].every(key=>process.env[`DC_E2E_${key}_EMAIL`]&&process.env[`DC_E2E_${key}_PASSWORD`]);
test.skip(!enabled,'BLOCKIERT: Zwei bestätigte dedizierte Testkonten und ausdrückliches Testkonto-Opt-in fehlen.');
test.beforeAll(()=>{if(enabled&&(!config||new URL(config.url).hostname!=='gdwxitcwtzkyfspjfoiw.supabase.co'))throw Error('Live test refused: unexpected project');});

test('LIVE: independent test accounts publish/request/accept/reload; outsiders cannot edit',async({browser})=>{
  const contexts=[],pages=[];let projectId;
  const invoke=async(page,action)=>page.evaluate(async({config,action})=>{
    const key='deutschconnect.auth.'+new URL(config.url).host,session=JSON.parse(localStorage.getItem(key));
    if(!session?.access_token)throw Error('No test session');
    const response=await fetch(config.url+'/functions/v1/platform',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(action?{action,commandId:crypto.randomUUID()}:{})});
    return {status:response.status,data:await response.json()};
  },{config,action});
  try{
    for(const key of ['A','B']){
      const context=await browser.newContext({baseURL:'http://127.0.0.1:4173',serviceWorkers:'block'});contexts.push(context);const page=await context.newPage();pages.push(page);
      await page.goto('/#/me/account');
      // Avoid logging credentials as Playwright fill-action parameters.
      await page.evaluate(({email,password})=>{
        const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        for(const [id,value] of [['account-email',email],['account-password',password]]){const el=document.getElementById(id);set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}
      },{email:process.env[`DC_E2E_${key}_EMAIL`],password:process.env[`DC_E2E_${key}_PASSWORD`]});
      await page.locator('form button[type=submit]').click();await expect(page.locator('.auth-panel form')).toHaveCount(0);
    }
    const [a,b]=pages;const first=await invoke(a),second=await invoke(b);
    expect(first.status).toBe(200);expect(second.status).toBe(200);expect(first.data.state.activeId).not.toBe(second.data.state.activeId);
    for(const response of [first,second]){
      const profile=response.data.state.profiles[response.data.state.activeId];
      expect(profile.isModerator,'Use dedicated student test accounts, never the operator account').toBe(false);
      expect(profile.displayName.startsWith('E2E TEST'),'Dedicated test profiles must be labeled E2E TEST').toBe(true);
      expect(profile.language,'The live smoke test uses German labels').toBe('de');
    }
    expect(first.data.state.profiles[first.data.state.activeId].schoolId).toBe('ers');expect(second.data.state.profiles[second.data.state.activeId].schoolId).toBe('anka');
    const title='E2E TEST '+crypto.randomUUID();await a.goto('/#/ideas/new');await a.locator('#idea-title').fill(title);await a.locator('#idea-description').fill('Fictitious integration-test project; remove after this run.');
    await a.locator('form button[type=submit]').click();await expect(a).toHaveURL(/#\/ideas\/local-/);const path=new URL(a.url()).hash.slice(1).split('?')[0];projectId=path.split('/').at(-1);
    await a.reload();await expect(a.getByRole('heading',{level:1})).toHaveText(title);
    await b.goto('/#/ideas/all');await b.getByRole('link',{name:title,exact:true}).click();await b.getByRole('button',{name:'Mitwirkung anfragen',exact:true}).click();
    await a.goto('/#'+path);await expect(a.locator('.request-review')).toBeVisible();await a.getByRole('button',{name:'Annehmen',exact:true}).click();
    await b.reload();await expect(b.getByRole('button',{name:'Projekt verlassen',exact:true})).toBeVisible();
    expect((await invoke(b,{type:'removeIdea',id:projectId})).status).toBe(400);
  }finally{
    let cleanupFailed=false;
    try{if(projectId&&pages[0]){const cleanup=await invoke(pages[0],{type:'removeIdea',id:projectId});cleanupFailed=cleanup.status!==200;}}catch{cleanupFailed=true;}
    finally{
      for(const page of pages){try{await page.goto('/#/me/account');const signOut=page.locator('.auth-panel > button');if(await signOut.count())await signOut.click();}catch{/* contexts still close; no persisted auth fixture */}}
      for(const context of contexts)await context.close();
    }
    expect(cleanupFailed,'Cleanup must soft-delete only its own test project; inspect manually if authentication expired').toBe(false);
  }
});
