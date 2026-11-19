import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createLogger } from './logger.js';

const logger = createLogger('socket-server');

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server
 * @param httpServer - HTTP server instance
 * @returns Socket.IO server instance
 */
export function initializeSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    // TODO: Validate JWT token
    // For now, allow all connections in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    next();
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // Join batch progress room
    socket.on('subscribe-batch', (batchId: string) => {
      socket.join(`batch:${batchId}`);
      logger.info({ socketId: socket.id, batchId }, 'Subscribed to batch');
    });

    // Leave batch progress room
    socket.on('unsubscribe-batch', (batchId: string) => {
      socket.leave(`batch:${batchId}`);
      logger.info({ socketId: socket.id, batchId }, 'Unsubscribed from batch');
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Client disconnected');
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}

/**
 * Get Socket.IO instance
 * @returns Socket.IO server instance or null if not initialized
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit invitation progress update
 * @param batchId - Batch ID
 * @param progress - Progress data
 */
export function emitInvitationProgress(
  batchId: string,
  progress: {
    total: number;
    sent: number;
    failed: number;
    status: string;
    currentEmail?: string;
    error?: string;
  }
): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit progress');
    return;
  }

  io.to(`batch:${batchId}`).emit('invitation-progress', {
    batchId,
    ...progress,
    timestamp: new Date().toISOString(),
  });

  logger.debug({ batchId, progress }, 'Emitted invitation progress');
}

/**
 * Emit batch completion
 * @param batchId - Batch ID
 * @param result - Final result
 */
export function emitBatchComplete(
  batchId: string,
  result: {
    total: number;
    successful: number;
    failed: number;
    failedEmails?: Array<{ email: string; reason: string }>;
  }
): void {
  if (!io) {
    logger.warn('Socket.IO not initialized, cannot emit completion');
    return;
  }

  io.to(`batch:${batchId}`).emit('batch-complete', {
    batchId,
    ...result,
    timestamp: new Date().toISOString(),
  });

  logger.info({ batchId, result }, 'Emitted batch completion');
}
