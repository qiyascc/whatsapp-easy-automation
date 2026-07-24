import { Router } from 'express';
import { asyncRoute } from '../middleware.js';
import { ValidationError } from '../../core/AppError.js';

export class ContactRoutes {
  constructor(container) {
    this.contacts = container.services.contacts;
  }

  router() {
    const router = Router();

    router.get('/', (request, response) => {
      response.json(this.contacts.list(request.query));
    });

    router.post(
      '/',
      asyncRoute((request, response) => {
        const outcome = this.contacts.addFromText(request.body?.input);
        response.json({ ok: true, ...outcome });
      })
    );

    router.post(
      '/bulk-delete',
      asyncRoute((request, response) => {
        const deleted = this.contacts.removeMany(request.body?.ids);
        response.json({ ok: true, deleted });
      })
    );

    router.patch(
      '/:id',
      asyncRoute((request, response) => {
        const id = ContactRoutes.#identifier(request.params.id);
        const contact = this.contacts.update(id, request.body ?? {});
        response.json({ ok: true, contact });
      })
    );

    router.delete(
      '/:id',
      asyncRoute((request, response) => {
        this.contacts.remove(ContactRoutes.#identifier(request.params.id));
        response.json({ ok: true });
      })
    );

    return router;
  }

  static #identifier(raw) {
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) throw new ValidationError('Invalid contact id.');
    return id;
  }
}
