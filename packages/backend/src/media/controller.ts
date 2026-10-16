import { Controller, Get, Post, Put, Req, Res, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { MediaService } from './service.js';
@Controller('media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}
  @Post('uploads') create(@Req() req: Request) {
    return this.media.create(req);
  }
  @Get(':id') status(@Req() req: Request) {
    return this.media.status(req);
  }
  @Put(':id/upload') upload(@Req() req: Request) {
    return this.media.receive(req);
  }
  @Post(':id/playback') playback(@Req() req: Request) {
    return this.media.playback(req);
  }
  @Get(':id/stream') stream(@Req() req: Request, @Res() res: Response) {
    return this.media.stream(req, res);
  }
}
