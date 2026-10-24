import { resolveBranchScope } from './authorize.js';
import { emit, emitToScope, revokeSession } from '../config/socket.js';

// Broadcasts a socket event after each successful write.

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

// Send a single document so lists can update in place; otherwise just the id.
const previewOf = (body) => {
  const data = body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (!data._id && !data.id) return null;
  return data;
};

/**
 * `scoped`: send only to the write's location. `revokes`: paths that force re-login.
 * `also`: other resources affected (e.g. a bill also changes `perfumes` stock).
 */
export const announceOnWrite =
  ({ resource, scoped = false, except = [], revokes = [], also = [] } = {}) =>
  (req, res, next) => {
    if (req.method === 'GET' || except.includes(req.path)) return next();

    const json = res.json.bind(res);

    res.json = (body) => {
      // Replayed retries were already announced (see idempotency.js).
      if (res.statusCode >= 200 && res.statusCode < 300 && !res.locals.idempotentReplay) {
        try {
          announce(req, body, { resource, scoped, revokes, also });
        } catch {
          // Never fail the write just because the broadcast failed.
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
    // Lets a panel skip the toast for its own changes.
    actor: req.user ? { id: String(req.user._id), name: req.user.name, role: req.user.role } : null,
    branch: scope,
    data: previewOf(body),
    at: new Date().toISOString(),
  };

  // A specific event per resource, plus a generic one for the cache layer.
  const send = scoped ? (event) => emitToScope(event, payload, scope) : (event) => emit(event, payload);
  send(`${resource}:${action}`);
  send('resource:changed');

  // Side effects (e.g. stock) are store-wide, so send to everyone, without a preview.
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

// The message shown to a user who is signed out after an admin change.
const revokeReasonFor = (req, body) => {
  // Deactivation wins over any other change in the same edit.
  if (body?.data?.isActive === false)
    return { reason: 'Your account has been deactivated. Please contact the super admin.', severity: 'error' };
  // A handler can set its own notice (e.g. a branch move).
  if (req.revokeNotice?.reason) return { severity: 'info', ...req.revokeNotice };
  if (matches(req, '/:id/reset-password'))
    return {
      reason: 'Your password was changed by an administrator. Please sign in with your new password.',
      severity: 'info',
    };
  return { reason: 'Your access was changed by an administrator. Please sign in again.', severity: 'info' };
};

// Matches a route pattern like '/:id/status' against the request path.
const matches = (req, pattern) => {
  if (pattern === req.path) return true;
  const expected = pattern.split('/').filter(Boolean);
  const actual = req.path.split('/').filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((part, index) => part.startsWith(':') || part === actual[index]);
};

export default announceOnWrite;
