import path from 'node:path';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  dbPath: path.join(dataDir, 'homegestion.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  password: process.env.APP_PASSWORD ?? '',
  production: process.env.NODE_ENV === 'production',
  maxUploadBytes: 20 * 1024 * 1024,
};
