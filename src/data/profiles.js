import { guestMembers } from './modules.js';
import { publicProfile } from '../../supabase/functions/_shared/profiles.js';

export function selectPublicProfile(state, id) {
  if (state.activities) {
    // Never infer additional sharing from an older deployed server's payload.
    if (state.modules.profileCapabilities) return state.modules.publicProfiles?.[id] || null;
    const profile = state.modules.visibility[id] && state.profiles[id];
    return profile ? { id, displayName:profile.displayName, schoolId:'', interests:[], sharing:{}, ownedProjectIds:[], currentProjectIds:[], completedProjectIds:[], awards:[], counts:{} } : null;
  }
  const fixture = guestMembers.find((member) => member.id === id);
  const demo = fixture ? { ...state, profiles:{ ...state.profiles,[id]:fixture }, modules:{ ...state.modules,visibility:{ ...state.modules.visibility,[id]:true } } } : state;
  return publicProfile(demo,id);
}
