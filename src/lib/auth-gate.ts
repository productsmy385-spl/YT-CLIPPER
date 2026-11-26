/**
 * Site-wide access gate. When APP_PASSWORD is set, every page and API requires HTTP Basic auth with that
 * password (any username). Edge-runtime safe (no Node APIs). Without APP_PASSWORD the app is open, which is
 * only appropriate for local development.
 */
export function isAuthorized(authorization: string | null): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  if (!authorization?.startsWith('Basic ')) return false;
  let decoded = '';
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return false;
  }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  // Constant-time comparison.
  if (password.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const UNAUTHORIZED_HEADERS = { 'WWW-Authenticate': 'Basic realm="GTA 6 Shorts Studio", charset="UTF-8"' };
