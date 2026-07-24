import { Router } from 'express';
import { clamp } from '#core/Support.js';

export class SystemRoutes {
  constructor(container) {
    this.stats = container.services.stats;
    this.logs = container.repositories.logs;
    this.config = container.config;
    this.startedAt = Date.now();
  }

  publicRouter() {
    const router = Router();
    router.get('/health', (request, response) => {
      response.json({
        ok: true,
        version: this.config.version,
        uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000)
      });
    });
    return router;
  }

  router() {
    const router = Router();

    router.get('/stats', (request, response) => {
      response.json(this.stats.snapshot());
    });

    router.get('/logs', (request, response) => {
      const level = String(request.query.level ?? '');
      response.json({
        logs: this.logs.list({
          level: ['debug', 'info', 'warn', 'error'].includes(level) ? level : '',
          limit: clamp(Number.parseInt(request.query.limit ?? '100', 10) || 100, 1, 500)
        })
      });
    });

    return router;
  }
}
