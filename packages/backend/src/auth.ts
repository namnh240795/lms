import { betterAuth } from 'better-auth';
import { database, origin, secret } from './config.js';
export const auth = betterAuth({
  database: database('identity'),
  secret: secret('BETTER_AUTH_SECRET'),
  baseURL: origin,
  basePath: '/api/auth',
  trustedOrigins: [origin],
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  user: { additionalFields: { role: { type: 'string', defaultValue: 'student', input: false } } },
});
