import { groupFor } from '../../supabase/functions/_shared/platform.js';

// Account snapshots already contain the authorized roster; private participation
// data has been removed and must not be used to reconstruct it on the client.
export function displayedGroup(state, id, mode) {
  return mode === 'account' ? state.modules.groups.find((group)=>group.id===id) || null : groupFor(state,id);
}
