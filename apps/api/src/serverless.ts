import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { createApp } from "./bootstrap";

/**
 * Vercel serverless entry for the API, deployed as ONE function inside the web
 * app's deployment (single monorepo project). The route is mounted at
 * /api/backend/* and the platform owns the socket — no app.listen.
 *
 * The Nest app is created once per warm instance and reused. The mount prefix
 * is stripped so controllers (mounted at /auth, /rfqs, …) match. Scheduled
 * jobs don't run here (JOBS_IN_PROCESS=false); run the worker elsewhere.
 */
const MOUNT_PREFIX = "/api/backend";

let ready: Promise<FastifyInstance> | undefined;

async function getServer(): Promise<FastifyInstance> {
  const app = await createApp();
  await app.init();
  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
  await fastify.ready();
  return fastify;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url?.startsWith(MOUNT_PREFIX)) {
    req.url = req.url.slice(MOUNT_PREFIX.length) || "/";
  }
  ready ??= getServer();
  const fastify = await ready;
  fastify.server.emit("request", req, res);
}
