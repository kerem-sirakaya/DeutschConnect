export default function Avatar({ profile, size = 'md' }) {
  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`;
  return (
    <span className={`avatar avatar--${size}`} style={{ '--avatar-color': profile.avatarColor }} aria-hidden="true">
      {initials}
    </span>
  );
}
