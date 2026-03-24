/**
 * Kraken Logger
 * 
 * Structured logging with Winston
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// JSON format for production
const prodFormat = printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...meta,
  });
});

const isDev = process.env['NODE_ENV'] !== 'production';

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || (isDev ? 'debug' : 'info'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    isDev ? combine(colorize(), devFormat) : prodFormat
  ),
  transports: [
    new winston.transports.Console(),
    // Add file transport in production
    ...(isDev ? [] : [
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      }),
      new winston.transports.File({ 
        filename: 'logs/combined.log',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
    ]),
  ],
  exceptionHandlers: isDev ? [] : [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: isDev ? [] : [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
});

// Performance logging helper
export function logPerformance(
  operation: string,
  startTime: number,
  meta?: Record<string, unknown>
): void {
  const duration = Date.now() - startTime;
  logger.debug(`${operation} completed`, {
    duration_ms: duration,
    ...meta,
  });
}

// Request logging middleware
export function requestLogger(
  req: { method: string; path: string; ip?: string },
  res: { statusCode: number },
  duration: number
): void {
  const level = res.statusCode >= 500 ? 'error' : 
                res.statusCode >= 400 ? 'warn' : 'info';
  
  logger.log(level, 'HTTP Request', {
    method: req.method,
    path: req.path,
    status: res.statusCode,
    duration_ms: duration,
    ip: req.ip,
  });
}
