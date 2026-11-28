export const ADMIN_EMAIL = 'shashankpulluri1@gmail.com';

/**
 * Checks if a given user email is the authorized admin for Scrollbound.
 * Admin possesses exclusive rights to publish novels to the public library
 * and view the user activity & usage statistics dashboard.
 */
export function isAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const configuredAdmin = process.env.ADMIN_EMAIL
    ? process.env.ADMIN_EMAIL.trim().toLowerCase()
    : ADMIN_EMAIL;
  return normalized === ADMIN_EMAIL || normalized === configuredAdmin;
}
