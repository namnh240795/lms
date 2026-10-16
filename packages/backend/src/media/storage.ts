import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
export interface VideoStorage {
  path(id: string, kind: 'original' | 'playback' | 'partial'): string;
  prepare(): Promise<void>;
}
export class LocalVideoStorage implements VideoStorage {
  private root = resolve(
    process.env.MEDIA_STORAGE_PATH ||
      fileURLToPath(new URL('../../../../.storage/videos', import.meta.url)),
  );
  path(id: string, kind: 'original' | 'playback' | 'partial') {
    z.uuid().parse(id);
    return join(
      this.root,
      `${id}.${kind === 'playback' ? 'mp4' : kind === 'partial' ? 'part' : 'upload'}`,
    );
  }
  async prepare() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
}
export const maxUploadBytes = Number(process.env.MEDIA_MAX_BYTES || 104857600);
if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1 || maxUploadBytes > 2147483648)
  throw new Error('MEDIA_MAX_BYTES must be between 1 and 2147483648.');
