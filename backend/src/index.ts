import { config } from './config';
import { connectDb } from './config/db';
import app from './app';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [Riayati ORC & Frequency updated]`);
  });
  connectDb().catch((err) => {
    logger.error('Failed initial MongoDB connection', err);
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
});
