import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export const ports: Record<string, number> = {
  gateway: 4100,
  identity: 4101,
  catalog: 4102,
  learning: 4103,
  orders: 4104,
  payments: 4105,
  media: 4106,
};
export const origin = process.env.WEB_ORIGIN || 'http://localhost:5173';
export function database(name: string) {
  return new pg.Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: 5432,
    user: process.env.POSTGRES_USER || 'learnly',
    password: process.env.POSTGRES_PASSWORD || 'learnly_local',
    database: name,
  });
}
export function secret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 32)
    throw new Error(`${name} must contain at least 32 characters. Copy .env.example to .env.`);
  return value;
}
