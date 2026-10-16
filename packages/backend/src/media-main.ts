import 'reflect-metadata';
import { Module, Catch, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { z } from 'zod';
import { ports } from './config.js';
import { MediaController } from './media/controller.js';
import { MediaService } from './media/service.js';
@Catch()
class MediaErrors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (res.headersSent) return;
    const status = error instanceof z.ZodError ? 400 : error.status || 500;
    res.status(status).json({
      message:
        status === 500
          ? 'Media service unavailable. Please try again.'
          : error instanceof z.ZodError
            ? error.issues[0].message
            : error.message,
    });
    if (status === 500) console.error(error);
  }
}
@Module({ controllers: [MediaController], providers: [MediaService] })
class MediaModule {}
const app = await NestFactory.create(MediaModule, { bodyParser: false });
app.use(express.json({ limit: '64kb' }));
app.useGlobalFilters(new MediaErrors());
app
  .getHttpAdapter()
  .get('/health', (_req: any, res: any) => res.json({ service: 'media', status: 'ok' }));
await app.listen(ports.media, '127.0.0.1');
console.log(`Media service listening at http://localhost:${ports.media}`);
