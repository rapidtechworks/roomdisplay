import type { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { config } from '../config.js';

// Augment the Fastify session type so TypeScript knows what we store
declare module 'fastify' {
  interface Session {
    adminLoggedIn?: boolean;
  }
}

export async function registerSessionPlugin(server: FastifyInstance) {
  // Cookie plugin must be registered before session
  await server.register(fastifyCookie);

  await server.register(fastifySession, {
    secret: config.SESSION_SECRET,
    cookieName: 'roomdisplay_session',
    cookie: {
      httpOnly: true,
      secure: false,   // LAN deployment uses plain HTTP; no HTTPS required
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in ms
      path: '/',
    },
    saveUninitialized: false,  // Don't create a session until something is stored
  });
}
