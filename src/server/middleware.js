import { AppError, RateLimitError, UnauthorizedError, ForbiddenError } from '../core/AppError.js';
import { SlidingWindowLimiter } from '../core/Support.js';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

export function securityHeaders() {
  return (request, response, next) => {
    response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  };
}

export function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function rateLimit({ limit, windowMs, keyResolver = (request) => request.ip }) {
  const limiter = new SlidingWindowLimiter({ limit, windowMs });
  return (request, response, next) => {
    const outcome = limiter.check(keyResolver(request));
    if (outcome.allowed) return next();
    response.setHeader('Retry-After', String(outcome.retryAfterSeconds));
    return next(new RateLimitError(outcome.retryAfterSeconds));
  };
}

export function extractToken(request) {
  const header = request.get('X-Api-Key');
  if (header) return header.trim();
  const authorization = request.get('Authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return '';
}

export function authenticate({ apiKeys, requiredScope = 'admin' }) {
  return (request, response, next) => {
    if (!apiKeys.authRequired) {
      request.principal = { scopes: ['admin', 'webhook'], keyId: null, keyName: 'open access', prefix: 'open' };
      return next();
    }
    const principal = apiKeys.authenticate(extractToken(request));
    if (!principal) return next(new UnauthorizedError('A valid API key is required.'));
    if (!principal.scopes.includes(requiredScope)) return next(new ForbiddenError(`This key lacks the "${requiredScope}" scope.`));
    request.principal = principal;
    return next();
  };
}

export function notFoundHandler() {
  return (request, response, next) => {
    if (request.path.startsWith('/api')) {
      return next(new AppError('not_found', 'This endpoint does not exist.', 404));
    }
    return next();
  };
}

export function errorHandler(logger) {
  return (error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error instanceof AppError) {
      if (error.status >= 500) logger.error(error.message, { path: request.path });
      return response.status(error.status).json(error.toResponse());
    }
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: 'payload_too_large', message: 'The request body is too large.' });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'invalid_json', message: 'The request body is not valid JSON.' });
    }
    logger.error('Unhandled request failure.', { path: request.path, reason: error?.message });
    return response.status(500).json({ error: 'internal_error', message: 'Something went wrong while handling the request.' });
  };
}
