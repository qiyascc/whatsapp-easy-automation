import { Router } from 'express';
import { asyncRoute } from '#server/middleware.js';

export class SessionRoutes {
  constructor(container) {
    this.sessions = container.sessions;
  }

  router() {
    const router = Router();

    router.get('/sessions', (request, response) => {
      response.json({ sessions: this.sessions.list(), anyOpen: this.sessions.hasOpen() });
    });

    router.post(
      '/sessions',
      asyncRoute(async (request, response) => {
        const session = await this.sessions.create(request.body?.id ?? '');
        response.json({ ok: true, id: session.id });
      })
    );

    router.get('/sessions/:id/qr', (request, response) => {
      const session = this.sessions.get(request.params.id);
      if (!session) return response.json({ status: 'gone', qr: null });
      return response.json({ status: session.status, qr: session.qr });
    });

    router.delete(
      '/sessions/:id',
      asyncRoute(async (request, response) => {
        await this.sessions.remove(request.params.id);
        response.json({ ok: true });
      })
    );

    router.get(
      '/groups',
      asyncRoute(async (request, response) => {
        await this.#respondWithGroups(response, false);
      })
    );

    router.post(
      '/groups/refresh',
      asyncRoute(async (request, response) => {
        await this.#respondWithGroups(response, true);
      })
    );

    return router;
  }

  async #respondWithGroups(response, force) {
    const session = this.sessions.pickOpen();
    if (!session?.gateway) {
      return response.json({ ok: false, groups: [], reason: 'no_open_session' });
    }
    try {
      const groups = await session.gateway.listGroups({ force });
      return response.json({ ok: true, groups });
    } catch (error) {
      return response.json({ ok: false, groups: [], reason: error.message });
    }
  }
}
