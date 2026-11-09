/**
 * DEMO – fiktive öffentliche Profile für den Demo-Modus (abgemeldet).
 * Basieren auf den fiktiven Demo-Profilen aus profiles.js. Keine echten Personen.
 * Zeigt bewusst unterschiedliche Freigaben: Elif gibt fast alles frei, Deniz nur den Vornamen.
 * Alex ist privat (taucht im Verzeichnis nicht auf).
 */
import { demoProfiles } from './profiles.js';
import { seedIdeas } from './ideas.js';
import { PUBLIC_IDEA_STATUSES } from '../lib/ideasApi.js';

const DEMO_SHARING = {
  elif: { isPublic: true, school: true, interests: true, projects: true, activity: true },
  deniz: { isPublic: true, school: false, interests: false, projects: false, activity: false },
  alex: { isPublic: false, school: false, interests: false, projects: false, activity: false },
};

export function demoSharingFor(profileId) {
  return { ...(DEMO_SHARING[profileId] ?? DEMO_SHARING.alex) };
}

function toPublic(profile, viewerId) {
  const sharing = demoSharingFor(profile.id);
  if (!sharing.isPublic && profile.id !== viewerId) return null;
  const projects = sharing.projects
    ? seedIdeas
        .filter((idea) => idea.authorId === profile.id && PUBLIC_IDEA_STATUSES.includes(idea.status))
        .map((idea) => ({ id: idea.id, title: idea.title, summary: idea.summary, status: idea.status,
          schoolId: idea.schoolId, topics: idea.topics, createdAt: idea.createdAt }))
    : [];
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: '',
    avatarColor: profile.avatarColor,
    schoolId: sharing.school ? profile.schoolId : null,
    interests: sharing.interests ? [...profile.interests] : [],
    isPublic: sharing.isPublic,
    isSelf: profile.id === viewerId,
    showProjects: sharing.projects,
    showActivity: sharing.activity,
    projects,
    activity: sharing.activity
      ? { ideasPublished: projects.length, eventsPast: 1, supportsReceived: 3 }
      : null,
    isDemo: true,
  };
}

export function demoDirectory(viewerId) {
  return demoProfiles
    .filter((profile) => demoSharingFor(profile.id).isPublic)
    .map((profile) => toPublic(profile, viewerId));
}

export function demoPublicProfile(profileId, viewerId) {
  const profile = demoProfiles.find((p) => p.id === profileId);
  return profile ? toPublic(profile, viewerId) : null;
}
