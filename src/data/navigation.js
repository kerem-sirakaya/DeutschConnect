export function routeFromHash(hash = '') {
  const route=hash.startsWith('#')?hash.slice(1):hash;
  if(!route)return '/';
  if(!route.startsWith('/')){
    const params=new URLSearchParams(route);
    if(['access_token','refresh_token','error','error_code'].some((key)=>params.has(key)))return '/me/account';
  }
  return route;
}

// Internal return destinations only. Disallow nested return chains and arbitrary URLs.
export function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//')) return undefined;
  const [path,search = ''] = value.split('?');
  if (!/^\/(?:$|(?:events|ideas|discover|network|me|tutoring|community)(?:\/[a-zA-Z0-9_-]+){0,4}$)/.test(path)) return undefined;
  const params = new URLSearchParams(search);
  for (const key of params.keys()) if (!['view','kind','initiative','opponent'].includes(key)) return undefined;
  return path + (search ? '?' + search : '');
}
