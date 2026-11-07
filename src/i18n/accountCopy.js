export function accountCopy(t) {
  const r = t.real;
  return { ...t, demoNotice:r.eventNotOpen,
    app:{ ...t.app, demoShort:r.accountShort, demoExplain:r.liveHint, demoLabel:r.account, formHint:r.formHint, privacyHint:r.privacyHint, saved:r.saved, updated:r.saved, collaborator:r.member, status:{ ...t.app.status, interested:r.interested, joined:r.registered, organized:r.organized } },
    personal:{ ...t.personal, guest:r.account, guestHint:r.liveHint, summary:r.summary, countHint:r.liveHint, pastDemo:r.past, noMemberships:t.personal.noProjects, eventRegistrations:r.eventRegistrations, projectMemberships:r.projectMemberships, collaborating:r.memberships, projectStates:{ ...t.personal.projectStates, member:r.member, requested:r.requested, interested:r.interested }, projectHint:r.projectHint, registrationHint:r.registrationHint, registrationSaved:r.registrationSaved, registered:r.registered, register:r.register, request:r.request, incomingRequests:r.incomingRequests, accept:r.accept, decline:r.decline, leave:r.leave, requestSaved:r.requestSaved, memberSaved:r.saved, noAttendance:r.noAttendance, groupsHint:r.groupsHint, recentPosts:r.recentPosts, settingsIntro:r.settingsIntro, demoNotice:r.accountShort },
    ext:{ ...t.ext, tutoring:{ ...t.ext.tutoring, localHint:r.tutoringHint, contactHint:r.contactHint, contactSaved:r.contactSaved }, community:{ ...t.ext.community, localHint:r.messageHint, privacy:r.shareHint, shared:r.shared, reported:r.reported, ownPosts:r.recentPosts, noActivity:r.noActivity, emptyRoom:r.noActivity } },
  };
}
