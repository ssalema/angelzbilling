import crypto from 'node:crypto';

// Content-Security-Policy for the built panel.

const sha256 = (source) => `'sha256-${crypto.createHash('sha256').update(source, 'utf8').digest('base64')}'`;

// Hashes of every inline <script>, so each can be allowed by hash.
const inlineScriptHashes = (html) => {
  const hashes = new Set();
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match = pattern.exec(html);
  while (match) {
    hashes.add(sha256(match[1]));
    match = pattern.exec(html);
  }
  return [...hashes];
};

const apiOrigin = (apiUrl) => {
  if (!apiUrl) return [];
  try {
    return [new URL(apiUrl).origin];
  } catch {
    return [];
  }
};

const websocketOrigin = (origin) => origin.replace(/^http/, 'ws');

export const contentSecurityPolicy = ({ html, apiUrl }) => {
  const scriptHashes = inlineScriptHashes(html);
  const api = apiOrigin(apiUrl);

  // Upgrading http:// to https:// would rewrite the API calls too, so skip it
  // when the API is on plain HTTP.
  const httpsOnly = !api.length || api.every((origin) => origin.startsWith('https://'));

  const directives = {
    'default-src': ["'self'"],

    'script-src': ["'self'", ...scriptHashes],

    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],

    'img-src': ["'self'", 'data:', 'blob:', 'https:'],

    // ws:// and wss:// must be listed separately from http(s).
    'connect-src': ["'self'", ...api, ...api.map(websocketOrigin)],

    'object-src': ["'none'"],
    // PDF export renders bills in an off-screen iframe (html2canvas).
    'frame-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],

    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  if (httpsOnly) directives['upgrade-insecure-requests'] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ');
};

// transformIndexHtml runs without a plugin context, so `this.warn` is not there.
const warn = (message) => console.warn(`\n\x1b[33m[inject-csp] ${message}\x1b[0m\n`);

// Runs last so the script hashes cover the final index.html.
export const cspPlugin = ({ apiUrl } = {}) => ({
  name: 'inject-csp',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      // connect-src is baked into the build; a wrong API URL blocks every call.
      if (!apiUrl) {
        warn(
          'VITE_API_URL is not set, so the CSP will only allow API calls to the panel\'s own ' +
            'origin. That is correct when the API is served from the same domain (or behind a ' +
            'path rewrite) and wrong otherwise — set VITE_API_URL to the full API base URL.'
        );
      } else if (!apiOrigin(apiUrl).length) {
        warn(
          `VITE_API_URL ("${apiUrl}") is not a URL with an origin, so it was left out of the ` +
            'CSP. API calls to it will be blocked in the built panel.'
        );
      } else if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(apiUrl)) {
        // Fine on this computer, and nowhere else: every other device reads
        // "localhost" as itself and never reaches the server.
        warn(
          `VITE_API_URL is "${apiUrl}". This build only works in a browser on the same computer ` +
            'as the API — phones and other devices will never reach the server. Set VITE_API_URL ' +
            "to the server's public address before building for deployment."
        );
      }

      const policy = contentSecurityPolicy({ html, apiUrl });
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
          {
            tag: 'meta',
            attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  },
});

export default cspPlugin;
