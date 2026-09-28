import path from 'path';
import dotenv from 'dotenv';

// When launched from Electron's utilityProcess, BACKEND_CWD points to the
// backend directory so dotenv can find .env even without a matching cwd.
const baseDir = process.env.BACKEND_CWD || process.cwd();
dotenv.config({ path: path.join(baseDir, '.env') });

// Database: use MONGODB_URI if set; otherwise switch by DB_MODE (local | atlas)
const dbMode = (process.env.DB_MODE || 'atlas').toLowerCase();
const mongodbUri =
  process.env.MONGODB_URI ||
  (dbMode === 'atlas'
    ? process.env.MONGODB_URI_ATLAS
    : process.env.MONGODB_URI_LOCAL) ||
  'mongodb://localhost:27017/supermarket_inventory';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri,
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};
