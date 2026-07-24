import { Router } from 'express';
import { asyncRoute } from '#server/middleware.js';
import { NotFoundError, ValidationError } from '#core/AppError.js';
import { clamp } from '#core/Support.js';

export class RunRoutes {
  constructor(container) {
    this.runs = container.repositories.runs;
    this.logger = container.logger;
  }

  router() {
    const router = Router();

    router.get('/', (request, response) => {
      const workflowId = request.query.workflowId ? Number.parseInt(request.query.workflowId, 10) : null;
      response.json({
        runs: this.runs.list({
          workflowId: Number.isFinite(workflowId) ? workflowId : null,
          status: String(request.query.status ?? ''),
          limit: clamp(Number.parseInt(request.query.limit ?? '100', 10) || 100, 1, 500)
        })
      });
    });

    router.post(
      '/clear',
      asyncRoute((request, response) => {
        const status = String(request.body?.status ?? '');
        const deleted = status ? this.runs.deleteByStatus(status) : this.runs.deleteFinished();
        response.json({ ok: true, deleted });
      })
    );

    router.post(
      '/:id/retry',
      asyncRoute((request, response) => {
        const run = this.#require(request.params.id);
        this.runs.update(run.id, { status: 'active', attempts: 0, resumeAt: null, lastError: null });
        response.json({ ok: true });
      })
    );

    router.post(
      '/:id/cancel',
      asyncRoute((request, response) => {
        const run = this.#require(request.params.id);
        this.runs.update(run.id, { status: 'cancelled', resumeAt: null });
        response.json({ ok: true });
      })
    );

    return router;
  }

  #require(raw) {
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid run id.');
    const run = this.runs.find(id);
    if (!run) throw new NotFoundError('Run');
    return run;
  }
}
