import { createPlatformHandler } from '../_shared/platformHandler.js';

Deno.serve(createPlatformHandler({
  url:Deno.env.get('SUPABASE_URL')!,
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  publicKey:Deno.env.get('SUPABASE_ANON_KEY')!,
  origins:(Deno.env.get('DC_ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value=>value.trim()).filter(Boolean),
  moderators:(Deno.env.get('DC_MODERATOR_IDS') || '').split(',').map(value=>value.trim()).filter(Boolean),
}));
