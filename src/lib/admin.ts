export function isAdmin(user: { email?: string | null } | null | undefined): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  const admins = (import.meta.env.PANTHER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email);
}
