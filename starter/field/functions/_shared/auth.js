// Extract the authenticated user's email from Cloudflare Access headers.
//
// In production, Cloudflare Access gates the app and injects
// `Cf-Access-Authenticated-User-Email`. Some Pages configurations only
// forward the JWT, so we also decode `Cf-Access-Jwt-Assertion`. In
// local dev (wrangler pages dev without an Access policy) we return
// 'anonymous@local' so you can exercise the API.

export function getEmail(request) {
  const direct = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (direct) return direct;

  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (jwt) {
    try {
      const parts = jwt.split('.');
      if (parts.length === 3) {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const payload = JSON.parse(atob(padded));
        if (payload?.email) return payload.email;
      }
    } catch (_) { /* fall through */ }
  }

  return 'anonymous@local';
}
