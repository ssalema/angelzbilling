import crypto from 'node:crypto';

// Content-Security-Policy for the built panel.

const sha256 = (source) => `'sha256-${crypto.createHash('sha256').update(source, 'utf8').digest('base64')}'`;

/** Every inline <script> in the document, so each can be allowed by hash. */
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

// Where the panel is allowed to talk to.
const apiOrigin = (apiUrl) => {
  if (!apiUrl) return [];
  try {
    return [new URL(apiUrl).origin];
  } catch {
    return [];
  }
};

// The same origin as a websocket URL. A same-origin API needs no entry: 'self'
// already covers its socket.
const websocketOrigin = (origin) => origin.replace(/^http/, 'ws');

export const contentSecurityPolicy = ({ html, apiUrl }) => {
  const scriptHashes = inlineScriptHashes(html);
  const api = apiOrigin(apiUrl);

  // Upgrading http:// to https:// would rewrite the API calls too, so skip it
  // when the API is on plain HTTP.
  const httpsOnly = !api.length || api.every((origin) => origin.startsWith('https://'));

  const directives = {
    // Nothing is fetchable unless a directive below says otherwise.
    'default-src': ["'self'"],

    // Bundled files and the handful of hashed inline snippets in index.html.
    'script-src': ["'self'", ...scriptHashes],

    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],

    'img-src': ["'self'", 'data:', 'blob:', 'https:'],

    // The websocket shares the API's origin, but ws:// and wss:// are separate
    // schemes to a CSP and have to be named.
    'connect-src': ["'self'", ...api, ...api.map(websocketOrigin)],

    'object-src': ["'none'"],
    // Saving a bill as a PDF renders it through an off-screen iframe (html2canvas),
    // so 'none' here would give a blank download.
    'frame-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],

    // Stops an injected <base> quietly repointing every relative script URL,
    // and stops a form being posted off-site.
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  if (httpsOnly) directives['upgrade-insecure-requests'] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ');
};

// Injects the CSP meta tag into the built index.html, last so the hashes cover the final document.
export const cspPlugin = ({ apiUrl } = {}) => ({
  name: 'inject-csp',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      // connect-src is frozen into the build, so a wrong API URL blocks every call
      // with nothing but a console error to show for it.
      if (!apiUrl) {
        this.warn(
          'VITE_API_URL is not set, so the CSP will only allow API calls to the panel\'s own ' +
            'origin. That is correct when the API is served from the same domain (or behind a ' +
            'path rewrite) and wrong otherwise — set VITE_API_URL to the full API base URL.'
        );
      } else if (!apiOrigin(apiUrl).length) {
        this.warn(
          `VITE_API_URL ("${apiUrl}") is not a URL with an origin, so it was left out of the ` +
            'CSP. API calls to it will be blocked in the built panel.'
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
          // Belt and braces for the two headers a meta policy cannot express
          // on its own; a host that sets real headers should set these too.
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
