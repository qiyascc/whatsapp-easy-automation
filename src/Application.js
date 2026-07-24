import { Config } from '#config/Config.js';
import { Logger } from '#core/Logger.js';
import { EventBus } from '#core/EventBus.js';
import { SecretVault } from '#core/SecretVault.js';
import { Database } from '#db/Database.js';
import { Migrator } from '#db/Migrator.js';
import { migrations } from '#db/migrations.js';
import { SettingsRepository } from '#db/repositories/SettingsRepository.js';
import { ContactRepository } from '#db/repositories/ContactRepository.js';
import { WorkflowRepository } from '#db/repositories/WorkflowRepository.js';
import { RunRepository } from '#db/repositories/RunRepository.js';
import { EventRepository } from '#db/repositories/EventRepository.js';
import { ApiKeyRepository } from '#db/repositories/ApiKeyRepository.js';
import { LogRepository, CounterRepository, StateRepository } from '#db/repositories/SupportRepositories.js';
import { SessionManager } from '#whatsapp/SessionManager.js';
import { IngestManager } from '#ingest/IngestManager.js';
import { NodeRegistry } from '#nodes/NodeRegistry.js';
import { TriggerRegistry } from '#triggers/TriggerRegistry.js';
import { GraphValidator } from '#engine/GraphValidator.js';
import { TriggerDispatcher } from '#engine/TriggerDispatcher.js';
import { RunExecutor } from '#engine/RunExecutor.js';
import { WorkflowEngine } from '#engine/WorkflowEngine.js';
import { Pacer } from '#engine/Pacer.js';
import { ApiKeyService } from '#services/ApiKeyService.js';
import { ContactService } from '#services/ContactService.js';
import { WorkflowService } from '#services/WorkflowService.js';
import { StatsService } from '#services/StatsService.js';
import { HttpServer } from '#server/HttpServer.js';

export class Application {
  constructor(container) {
    this.container = container;
    this.config = container.config;
    this.logger = container.logger;
    this.engine = container.engine;
    this.sessions = container.sessions;
    this.database = container.database;
    this.http = new HttpServer(container);
  }

  static async create(env = process.env) {
    const config = Config.fromEnvironment(env);
    const logger = new Logger({ level: config.logLevel, scope: 'app' });
    const vault = SecretVault.resolve({ masterSecret: config.masterSecret, keyFile: config.masterKeyFile });

    const database = await Database.open(config.databaseFile, logger);
    new Migrator({ database, migrations, logger }).run({ vault });

    const repositories = {
      settings: new SettingsRepository(database, vault),
      contacts: new ContactRepository(database),
      workflows: new WorkflowRepository(database),
      runs: new RunRepository(database),
      events: new EventRepository(database),
      apiKeys: new ApiKeyRepository(database),
      logs: new LogRepository(database),
      counters: new CounterRepository(database),
      state: new StateRepository(database)
    };
    logger.attachRepository(repositories.logs);

    const eventBus = new EventBus(logger.child('events'));
    const sessions = new SessionManager({ config, logger, eventBus });
    const nodeRegistry = new NodeRegistry();
    const triggerRegistry = new TriggerRegistry();
    const validator = new GraphValidator({ nodeRegistry, triggerRegistry });

    const ingest = new IngestManager({
      events: repositories.events,
      settings: repositories.settings,
      state: repositories.state,
      contacts: repositories.contacts,
      eventBus,
      logger: logger.child('ingest')
    });

    const pacer = new Pacer({
      settings: repositories.settings,
      counters: repositories.counters,
      logger: logger.child('pacer')
    });

    const dispatcher = new TriggerDispatcher({
      repositories,
      nodeRegistry,
      triggerRegistry,
      logger: logger.child('dispatcher'),
      config
    });

    const executor = new RunExecutor({
      nodeRegistry,
      repositories,
      pacer,
      settings: repositories.settings,
      logger: logger.child('runner'),
      config
    });

    const engine = new WorkflowEngine({
      repositories,
      dispatcher,
      executor,
      ingest,
      sessions,
      settings: repositories.settings,
      logger: logger.child('engine'),
      config
    });

    const services = {
      apiKeys: new ApiKeyService({ repository: repositories.apiKeys, config, logger: logger.child('keys') }),
      contacts: new ContactService({ repository: repositories.contacts, logger: logger.child('contacts') }),
      workflows: new WorkflowService({
        repository: repositories.workflows,
        runs: repositories.runs,
        validator,
        dispatcher,
        logger: logger.child('workflows')
      }),
      stats: null
    };
    services.stats = new StatsService({
      contacts: repositories.contacts,
      runs: repositories.runs,
      counters: repositories.counters,
      sessions
    });

    return new Application({
      config,
      logger,
      vault,
      database,
      repositories,
      eventBus,
      sessions,
      ingest,
      nodeRegistry,
      triggerRegistry,
      validator,
      dispatcher,
      executor,
      engine,
      pacer,
      services
    });
  }

  async start() {
    await this.http.listen();
    this.#announce();
    await this.sessions.restore();
    this.engine.start();
  }

  async stop() {
    this.logger.info('Shutting down.');
    this.engine.stop();
    await this.http.close();
    await this.sessions.shutdown();
    this.database.close();
  }

  #announce() {
    const authRequired = this.container.services.apiKeys.authRequired;
    this.logger.info(`Control panel is listening on http://${this.config.host}:${this.config.port}`);
    this.logger.info(`Storage driver: ${this.database.driver}`);
    if (!authRequired) {
      this.logger.warn('Authentication is disabled. Set AUTH_TOKEN or create an admin API key before exposing this panel.');
    }
    if (this.config.bindsPublicInterface && !authRequired) {
      this.logger.error('The panel is bound to a public interface without authentication. Stop it and set AUTH_TOKEN.');
    }
  }
}
