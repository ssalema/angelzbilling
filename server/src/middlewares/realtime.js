import { resolveBranchScope } from './authorize.js';
import { emit, emitToScope, revokeSession } from '../config/socket.js';

// Turns a successful write into an announcement. Reads the response on its way
// out, the same way the cache invalidators next to it do.

const actionFor = (req) => {
  const method = req.method.toUpperCase();
  if (method === 'POST') return req.path === '/' ? 'created' : 'changed';
  if (method === 'DELETE') return 'deleted';
  if (method === 'PATCH' || method === 'PUT') return 'updated';
  return 'changed';
};

const idFrom = (req, body) => {
  const data = body?.data;
  const id = data?._id || data?.id || data?.bill?._id || data?.perfume?._id || req.params?.id;
  return id ? String(id) : null;
};

// A single document, small enough to hand to the screens so a list can update in
// place. Anything else is announced by id alone.
const previewOf = (body) => {
  const data = body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!data._id && !data.id) return null;
  return data;
};

/**
 * Announces every successful write on the router it is mounted on.
 * `scoped` sends to the location the write landed in rather than store-wide;
 * `revokes` lists the paths after which the affected account must sign in again.
 * `also` names the other resources this write moves — raising or refunding a
 * bill changes stock, and the catalogue screens watch `perfumes`, not `bills`.
 */
export const announceOnWrite =
  ({ resource, scoped = false, except = [], revokes = [], also = [] } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET' || except.includes(req.path)) return next();

    const json = res.json.bind(res);

    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          announce(req, body, { resource, scoped, revokes, also });
        } catch {
          // A screen that misses one nudge refetches on its next interaction.
          // Failing the write that caused it would be far worse.
        }
      }
      return json(body);
    };

    return next();
  };

const announce = (req, body, { resource, scoped, revokes, also = [] }) => {
  const action = actionFor(req);

  let scope = null;
  if (scoped) {
    try {
      scope = resolveBranchScope(req) ?? null;
    } catch {
      scope = null; // unknown location — tell everyone rather than nobody
    }
  }

  const payload = {
    resource,
    action,
    id: idFrom(req, body),
    path: req.path,
    // Whose change this was, so a panel can skip the toast for its own work.
    actor: req.user ? { id: String(req.user._id), name: req.user.name, role: req.user.role } : null,
    branch: scope,
    data: previewOf(body),
    at: new Date().toISOString(),
  };

  // A specific event for a screen that wants one resource, and a generic one for
  // the cache layer that watches everything.
  const send = scoped ? (event) => emitToScope(event, payload, scope) : (event) => emit(event, payload);
  send(`${resource}:${action}`);
  send('resource:changed');

  // A knock-on change: the bill was scoped to one counter, but the stock it
  // moved is the whole store's, so this half goes to everyone. It carries no
  // preview — the body is a bill, not the perfume whose shelf just changed.
  also.filter(Boolean).forEach((name) => {
    const knock = { ...payload, resource: name, action: 'changed', id: null, data: null, via: resource };
    emit(`${name}:changed`, knock);
    emit('resource:changed', knock);
  });

  if (revokes.some((pattern) => matches(req, pattern))) {
    const { reason, severity } = revokeReasonFor(req, body);
    revokeSession(req.params?.id, reason, severity);
  }
};

// A deactivated account cannot sign back in, so say that rather than asking for
// a fresh sign-in that would only be refused — and say it in the red the sign-in
// form itself would use, since that refusal is what a retry would earn. A new
// password needs naming too, or the old one is the first thing the person tries.
const revokeReasonFor = (req, body) => {
  // Deactivation outranks anything else the same edit did — there is no signing
  // back in to the new location.
  if (body?.data?.isActive === false)
    return { reason: 'Your account has been deactivated. Please contact the super admin.', severity: 'error' };
  // A handler that knows exactly what it changed words the notice itself —
  // moving an account between locations names both ends of the move.
  if (req.revokeNotice?.reason) return { severity: 'info', ...req.revokeNotice };
  if (matches(req, '/:id/reset-password'))
    return {
      reason: 'Your password was changed by an administrator. Please sign in with your new password.',
      severity: 'info',
    };
  return { reason: 'Your access was changed by an administrator. Please sign in again.', severity: 'info' };
};

// `'/:id/status'` against the path this request actually took.
const matches = (req, pattern) => {
  if (pattern === req.path) return true;
  const expected = pattern.split('/').filter(Boolean);
  const actual = req.path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((part, index) => part.startsWith(':') || part === actual[index]);
};

export default announceOnWrite;
