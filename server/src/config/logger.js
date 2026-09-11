import winston from 'winston';
import env from './env.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} ${level}: ${stack || message}`;
});

export const logger = winston.createLogger({
  // 'http' rather than 'info' in production.
  level: env.isProd ? 'http' : 'debug',
  // The e2e suite drives hundreds of requests; their access logs would bury the
  // assertion results it prints.
  silent: env.nodeEnv === 'test',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    env.isProd ? json() : combine(colorize(), devFormat)
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

// morgan pipes its access log lines through here so everything lands in one stream
export const httpLogStream = {
  write: (message) => logger.http?.(message.trim()) ?? logger.info(message.trim()),
};

export default logger;
