const keys=['access_token','refresh_token','expires_in','expires_at','token_type','type','token_hash','code','error','error_code','error_description','provider_token','provider_refresh_token','sb'];

// Capture once before React renders. Never put this result in DOM, logs or history.
export function captureAuthCallback(location,history) {
  if(!location)return {kind:'none'};
  const query=new URLSearchParams(location.search||'');
  const raw=(location.hash||'').replace(/^#/,'');
  const fragment=new URLSearchParams(raw.startsWith('/')?'':raw);
  const get=key=>fragment.get(key)??query.get(key);
  const has=key=>fragment.has(key)||query.has(key);
  if(!['access_token','refresh_token','token_hash','code','error','error_code'].some(has))return {kind:'none'};
  let result;
  if(has('error')||has('error_code'))result={kind:'error',code:get('error_code')==='otp_expired'?'confirmation-link-expired':'confirmation-link-invalid'};
  else if(has('access_token')||has('refresh_token'))result=get('access_token')&&get('refresh_token')?{kind:'tokens',access_token:get('access_token'),refresh_token:get('refresh_token'),expires_in:Number(get('expires_in'))||3600}:{kind:'error',code:'confirmation-link-invalid'};
  else if(has('token_hash'))result=['signup','email'].includes(get('type'))?{kind:'otp',token_hash:get('token_hash'),type:get('type')}:{kind:'error',code:'confirmation-link-invalid'};
  else result={kind:'error',code:'confirmation-password-required'}; // No PKCE verifier exists in a different browser.
  for(const key of keys)query.delete(key);
  const search=query.toString();
  history?.replaceState({...history.state,dcRoute:'/me/account',...(history.state?.dcPrevious?.startsWith('/')?{}:{dcPrevious:undefined})},'',(location.pathname||'/')+(search?'?'+search:'')+'#/me/account');
  return result;
}
