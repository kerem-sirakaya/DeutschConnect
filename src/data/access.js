// Runtime capabilities, separate from fictional demo profile identity.
// An authenticated provider must supply its own data repository before this
// contract can expose account mode; a demo persona is never an auth subject.
export const guestAccess = Object.freeze({
  mode: 'guest',
  subjectId: null,
  authenticationAvailable: false,
  synchronized: false,
  confirmedAttendanceAvailable: false,
});
