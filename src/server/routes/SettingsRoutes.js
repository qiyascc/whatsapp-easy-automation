import { Router } from 'express';
import { asyncRoute } from '#server/middleware.js';
import { SettingsRepository } from '#db/repositories/SettingsRepository.js';

export class SettingsRoutes {
  constructor(container) {
    this.settings = container.repositories.settings;
    this.logger = container.logger;
  }

  router() {
    const router = Router();

    router.get('/', (request, response) => {
      response.json({ settings: this.settings.all(), secrets: this.settings.secretFlags() });
    });

    router.put(
      '/',
      asyncRoute((request, response) => {
        const body = request.body ?? {};
        const values = {};
        for (const key of Object.keys(SettingsRepository.DEFAULTS)) {
          if (body[key] === undefined) continue;
          values[key] = String(body[key]).slice(0, 2000);
        }
        this.settings.setMany(values);

        for (const key of SettingsRepository.SECRET_KEYS) {
          if (body[key] === undefined) continue;
          this.settings.setSecret(key, String(body[key]).trim());
        }

        this.logger.info('Settings were updated.');
        response.json({ ok: true });
      })
    );

    return router;
  }
}
