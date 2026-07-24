import { Router } from 'express';
import { asyncRoute, rateLimit, extractToken } from '#server/middleware.js';
import { UnauthorizedError } from '#core/AppError.js';

export class AuthRoutes {
  constructor(container) {
    this.apiKeys = container.services.apiKeys;
  }

  router() {
    const router = Router();

    router.get('/status', (request, response) => {
      const required = this.apiKeys.authRequired;
      const principal = required ? this.apiKeys.authenticate(extractToken(request)) : null;
      response.json({ authRequired: required, authenticated: required ? Boolean(principal) : true });
    });

    router.post(
      '/login',
      rateLimit({ limit: 10, windowMs: 300000 }),
      asyncRoute((request, response) => {
        if (!this.apiKeys.authRequired) return response.json({ ok: true, scopes: ['admin', 'webhook'] });
        const principal = this.apiKeys.authenticate(request.body?.token);
        if (!principal || !principal.scopes.includes('admin')) {
          throw new UnauthorizedError('That token is not valid for the control panel.');
        }
        return response.json({ ok: true, scopes: principal.scopes });
      })
    );

    return router;
  }
}
