import process from 'node:process';
import { Application } from './Application.js';

const application = await Application.create();

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const timer = setTimeout(() => process.exit(1), application.config.shutdownTimeoutMs);
  if (timer.unref) timer.unref();
  try {
    await application.stop();
    process.exit(0);
  } catch {
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  application.logger.error('Unhandled promise rejection.', { reason: reason?.message ?? String(reason) });
});
process.on('uncaughtException', (error) => {
  application.logger.error('Uncaught exception, stopping.', { reason: error?.message ?? String(error) });
  process.exit(1);
});

try {
  await application.start();
} catch (error) {
  application.logger.error('The application could not start.', { reason: error?.message ?? String(error) });
  process.exit(1);
}
