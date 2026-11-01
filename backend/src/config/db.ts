import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import { config } from './index';

export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
    });
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection error:', err);
    setTimeout(() => {
      logger.info('Retrying MongoDB connection...');
      connectDb().catch((e) => logger.error('MongoDB retry failed:', e));
    }, 5000);
  }
}

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
