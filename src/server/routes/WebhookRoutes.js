import { Router } from 'express';
import crypto from 'node:crypto';
import { asyncRoute, rateLimit, extractToken } from '#server/middleware.js';
import { ForbiddenError, UnauthorizedError } from '#core/AppError.js';

export class WebhookRoutes {
  constructor(container) {
    this.apiKeys = container.services.apiKeys;
    this.ingest = container.ingest;
    this.logger = container.logger;
  }

  router() {
    const router = Router();
    const limiter = rateLimit({
      limit: 120,
      windowMs: 60000,
      keyResolver: (request) => `${request.ip}:${String(request.params.key ?? extractToken(request)).slice(0, 24)}`
    });

    const handler = asyncRoute((request, response) => {
      const token = request.params.key || extractToken(request);
      const principal = this.apiKeys.authRequired
        ? this.apiKeys.authenticate(token)
        : { scopes: ['webhook'], keyId: null, keyName: 'open access', prefix: 'open' };

      if (!principal) throw new UnauthorizedError('Unknown or revoked webhook key.');
      if (!principal.scopes.includes('webhook')) throw new ForbiddenError('This key lacks the "webhook" scope.');

      const outcome = this.ingest.webhook().accept({
        keyId: principal.keyId,
        keyName: principal.keyName,
        keyPrefix: principal.prefix,
        body: request.body,
        requestId: crypto.randomUUID()
      });

      response.json({ ok: true, accepted: outcome.accepted, phones: outcome.phones });
    });

    router.post('/:key', limiter, handler);
    router.post('/', limiter, handler);
    return router;
  }
}
