import { Router } from 'express';
import { asyncRoute } from '../middleware.js';
import { ValidationError } from '../../core/AppError.js';
import { NodeRegistry } from '../../nodes/NodeRegistry.js';

export class CatalogRoutes {
  constructor(container) {
    this.nodes = container.nodeRegistry;
    this.triggers = container.triggerRegistry;
  }

  router() {
    const router = Router();
    router.get('/', (request, response) => {
      response.json({
        nodes: this.nodes.describeAll(),
        triggers: this.triggers.describeAll(),
        categories: NodeRegistry.categories
      });
    });
    return router;
  }
}

export class WorkflowRoutes {
  constructor(container) {
    this.workflows = container.services.workflows;
  }

  router() {
    const router = Router();

    router.get('/', (request, response) => {
      response.json({ workflows: this.workflows.list() });
    });

    router.post(
      '/',
      asyncRoute((request, response) => {
        const id = this.workflows.create({
          name: request.body?.name,
          graph: request.body?.graph,
          enabled: request.body?.enabled
        });
        response.json({ ok: true, id });
      })
    );

    router.get(
      '/:id',
      asyncRoute((request, response) => {
        response.json({ ok: true, workflow: this.workflows.get(WorkflowRoutes.#identifier(request.params.id)) });
      })
    );

    router.put(
      '/:id',
      asyncRoute((request, response) => {
        this.workflows.update(WorkflowRoutes.#identifier(request.params.id), request.body ?? {});
        response.json({ ok: true });
      })
    );

    router.delete(
      '/:id',
      asyncRoute((request, response) => {
        this.workflows.remove(WorkflowRoutes.#identifier(request.params.id));
        response.json({ ok: true });
      })
    );

    router.post(
      '/:id/duplicate',
      asyncRoute((request, response) => {
        const id = this.workflows.duplicate(WorkflowRoutes.#identifier(request.params.id));
        response.json({ ok: true, id });
      })
    );

    router.post(
      '/:id/test',
      asyncRoute((request, response) => {
        const runs = this.workflows.test(WorkflowRoutes.#identifier(request.params.id), request.body ?? {});
        response.json({ ok: true, runs });
      })
    );

    return router;
  }

  static #identifier(raw) {
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid workflow id.');
    return id;
  }
}
