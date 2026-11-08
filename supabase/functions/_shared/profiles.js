// Shared read rules. Real input reaches these selectors only after server validation.
export const sharingKeys = ['school', 'interests', 'projects'];
export function validSharing(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => sharingKeys.includes(key) && typeof value[key] === 'boolean');
}
export function sharingFor(profile) {
  return Object.fromEntries(sharingKeys.map((key) => [key, profile?.profileSharing?.[key] === true]));
}
export function completedProject(idea, now = new Date()) {
  const evidence = idea.completion;
  return idea.lifecycle !== 'deleted' && idea.lifecycle !== 'withdrawn' &&
    typeof evidence?.confirmedBy === 'string' && evidence.confirmedBy.length > 0 &&
    Number.isFinite(Date.parse(evidence.confirmedAt)) && Date.parse(evidence.confirmedAt) <= Number(now) &&
    Array.isArray(evidence.memberIds);
}
export function publicProfile(state, id, now = new Date()) {
  const profile = state.profiles[id];
  if (!profile || state.modules.visibility[id] !== true) return null;
  const sharing = sharingFor(profile);
  const ideas = state.ideas.filter((idea) => !['deleted', 'withdrawn'].includes(idea.lifecycle));
  const owned = sharing.projects ? ideas.filter((idea) => idea.ownerId === id) : [];
  const current = sharing.projects ? ideas.filter((idea) => !completedProject(idea, now) && idea.participantIds.includes(id)) : [];
  const completed = sharing.projects ? ideas.filter((idea) => completedProject(idea, now) && idea.completion.memberIds.includes(id)) : [];
  const awards = state.modules.awardSharing?.[id] === true ? (state.modules.awards || []).filter((award) => award.ownerId === id).map(({ id, kind, awardedAt }) => ({ id, kind, awardedAt })) : [];
  return { id, displayName: profile.displayName, schoolId: sharing.school ? profile.schoolId : '',
    interests: sharing.interests ? [...profile.interests, ...(profile.customInterests || [])] : [],
    sharing, ownedProjectIds: owned.map((idea) => idea.id), currentProjectIds: current.map((idea) => idea.id),
    completedProjectIds: completed.map((idea) => idea.id), awards,
    counts: { ownedProjects: owned.length, projectMemberships: current.length, completedProjects: completed.length, awards: awards.length } };
}
