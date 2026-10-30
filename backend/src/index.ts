import { config } from './config';
import { connectDb } from './config/db';
import app from './app';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDb();
  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [Riayati ORC & Frequency updated]`);
  });
}

main().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
