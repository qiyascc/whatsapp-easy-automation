import { Router } from 'express';
import { asyncRoute } from '#server/middleware.js';
import { ValidationError } from '#core/AppError.js';

export class ApiKeyRoutes {
  constructor(container) {
    this.apiKeys = container.services.apiKeys;
  }

  router() {
    const router = Router();

    router.get('/', (request, response) => {
      response.json({ keys: this.apiKeys.list() });
    });

    router.post(
      '/',
      asyncRoute((request, response) => {
        const issued = this.apiKeys.issue({ name: request.body?.name, scopes: request.body?.scopes });
        const host = request.get('origin') || `${request.protocol}://${request.get('host')}`;
        response.json({
          ok: true,
          id: issued.id,
          key: issued.key,
          prefix: issued.prefix,
          scopes: issued.scopes,
          webhookUrl: this.apiKeys.webhookUrlFor(issued.key, host)
        });
      })
    );

    router.delete(
      '/:id',
      asyncRoute((request, response) => {
        const id = Number.parseInt(request.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid API key id.');
        this.apiKeys.revoke(id);
        response.json({ ok: true });
      })
    );

    return router;
  }
}
