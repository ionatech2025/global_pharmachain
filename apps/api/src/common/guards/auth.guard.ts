import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { decodeSessionToken } from "@pharmachain/auth/session";
import { prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import { env } from "../../env";
import { IS_PUBLIC_KEY } from "../decorators";
import { unauthorized } from "../errors";

const COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

function tokenFrom(req: FastifyRequest): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name && COOKIE_NAMES.includes(name)) return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/**
 * Global authentication: verifies the Auth.js session JWE (Bearer from the
 * web proxy, or the session cookie on same-domain deployments) and re-reads
 * the user each request — deactivation and sessionVersion bumps revoke
 * instantly. @Public() routes skip it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = tokenFrom(req);
    if (!token) throw unauthorized();

    const payload = await decodeSessionToken(token, env.AUTH_SECRET);
    if (!payload?.sub) throw unauthorized("Session invalid or expired");

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        isSuperAdmin: true,
        sessionVersion: true,
      },
    });
    if (user?.status !== "ACTIVE" || user.sessionVersion !== payload.sv) {
      throw unauthorized("Session invalid or expired");
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      sessionVersion: user.sessionVersion,
    };
    return true;
  }
}
