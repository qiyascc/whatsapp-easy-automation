import express from 'express';
import path from 'node:path';
import { authenticate, errorHandler, notFoundHandler, rateLimit, securityHeaders } from './middleware.js';
import { AuthRoutes } from './routes/AuthRoutes.js';
import { SettingsRoutes } from './routes/SettingsRoutes.js';
import { SessionRoutes } from './routes/SessionRoutes.js';
import { ContactRoutes } from './routes/ContactRoutes.js';
import { CatalogRoutes, WorkflowRoutes } from './routes/WorkflowRoutes.js';
import { RunRoutes } from './routes/RunRoutes.js';
import { ApiKeyRoutes } from './routes/ApiKeyRoutes.js';
import { WebhookRoutes } from './routes/WebhookRoutes.js';
import { SystemRoutes } from './routes/SystemRoutes.js';

export class HttpServer {
  #server = null;

  constructor(container) {
    this.container = container;
    this.config = container.config;
    this.logger = container.logger.child('http');
  }

  build() {
    const app = express();
    app.disable('x-powered-by');
    if (this.config.trustProxy) app.set('trust proxy', true);

    app.use(securityHeaders());
    app.use(express.json({ limit: this.config.requestBodyLimit }));
    app.use(express.urlencoded({ extended: false, limit: this.config.requestBodyLimit }));

    const system = new SystemRoutes(this.container);
    app.use('/api', system.publicRouter());
    app.use('/api/auth', new AuthRoutes(this.container).router());
    app.use('/api/hooks', new WebhookRoutes(this.container).router());

    app.use('/api', rateLimit({ limit: 600, windowMs: 60000 }));
    app.use('/api', authenticate({ apiKeys: this.container.services.apiKeys, requiredScope: 'admin' }));

    app.use('/api/settings', new SettingsRoutes(this.container).router());
    app.use('/api', new SessionRoutes(this.container).router());
    app.use('/api/contacts', new ContactRoutes(this.container).router());
    app.use('/api/catalog', new CatalogRoutes(this.container).router());
    app.use('/api/workflows', new WorkflowRoutes(this.container).router());
    app.use('/api/runs', new RunRoutes(this.container).router());
    app.use('/api/keys', new ApiKeyRoutes(this.container).router());
    app.use('/api', system.router());

    app.use(notFoundHandler());
    app.use(express.static(this.config.publicDir, { index: false, maxAge: '1h', fallthrough: true }));
    app.use((request, response, next) => {
      if (request.method !== 'GET') return next();
      return response.sendFile(path.join(this.config.publicDir, 'index.html'));
    });
    app.use(errorHandler(this.logger));

    return app;
  }

  listen() {
    return new Promise((resolve, reject) => {
      const app = this.build();
      this.#server = app.listen(this.config.port, this.config.host, () => resolve(this.#server));
      this.#server.on('error', reject);
    });
  }

  close() {
    return new Promise((resolve) => {
      if (!this.#server) return resolve();
      this.#server.close(() => resolve());
      return undefined;
    });
  }
}
