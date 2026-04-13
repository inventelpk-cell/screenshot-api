import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from './logger';
import { rapidApiAuth } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { launchBrowser, closeBrowser } from './services/browser';
import screenshotRouter from './routes/screenshot';
import pdfRouter from './routes/pdf';
import healthRouter from './routes/health';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(cors());
app.disable('x-powered-by');

app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path, ip: req.ip }, 'Incoming request');
  next();
});

app.use('/health', healthRouter);

app.use('/screenshot', rapidApiAuth, rateLimit, screenshotRouter);
app.use('/pdf', rapidApiAuth, rateLimit, pdfRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

let server: ReturnType<typeof app.listen>;

async function start() {
  try {
    await launchBrowser();
    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'Server started');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  await closeBrowser();
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

start();
