import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
  type CanActivate,
  Controller,
  Get,
  type MessageEvent,
  Module,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Observable } from "rxjs";
import { conflict, unauthorized } from "../common/errors";
import { AllExceptionsFilter } from "../common/filters/all-exceptions.filter";
import { registerRequestLogging } from "./request-log";

/**
 * The request log must record the status the client actually received.
 * Bug (found 2026-11-12 while verifying the shipment-status fix): every
 * request that ended in an exception was logged as 200 — the old interceptor
 * logged in RxJS `finalize`, before the exception filter had set the status —
 * and requests refused by a guard (401/403/429) or matching no route were
 * never logged at all, because Nest runs guards before interceptors.
 */

class DenyGuard implements CanActivate {
  canActivate(): boolean {
    throw unauthorized();
  }
}

@Controller()
class ProbeController {
  @Get("ok")
  ok() {
    return { ok: true };
  }

  @Get("conflict")
  conflicted() {
    throw conflict("already at that stage");
  }

  @Get("boom")
  boom() {
    throw new Error("unexpected");
  }

  @Get("guarded")
  @UseGuards(DenyGuard)
  guarded() {
    return { reached: true };
  }

  @Sse("stream")
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((s) => {
      s.next({ data: { baseline: true } } as MessageEvent);
      s.complete();
    });
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

type Logged = { message: string; status?: number; path?: string; requestId?: string };

let app: NestFastifyApplication;
let base = "";
const lines: Logged[] = [];
const spies: Array<{ mockRestore: () => void }> = [];

beforeAll(async () => {
  for (const method of ["log", "error"] as const) {
    spies.push(
      spyOn(console, method).mockImplementation((line: unknown) => {
        try {
          lines.push(JSON.parse(String(line)) as Logged);
        } catch {
          // not one of ours
        }
      }),
    );
  }
  app = await NestFactory.create<NestFastifyApplication>(ProbeModule, new FastifyAdapter(), {
    logger: false,
  });
  // The same wiring createApp() uses, before routes are registered.
  registerRequestLogging(app.getHttpAdapter().getInstance());
  app.useGlobalFilters(new AllExceptionsFilter());
  // A real socket, not fastify.inject(): SSE needs one (setKeepAlive).
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app?.close();
  for (const spy of spies) spy.mockRestore();
});

/** Make one request and return the status sent plus the request log line for it. */
async function hit(path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${path}`, { headers });
  await response.text(); // drain (an SSE stream ends when the observable completes)
  // The log line is written as the response finishes; give it a tick.
  await new Promise((r) => setTimeout(r, 20));
  const logged = lines.filter((l) => l.message === "request" && l.path === path);
  return {
    res: {
      statusCode: response.status,
      headers: { "x-request-id": response.headers.get("x-request-id") ?? undefined },
    },
    logged,
  };
}

describe("request log records what the client received", () => {
  test("a successful request is logged once with 200", async () => {
    const { res, logged } = await hit("/ok");
    expect(res.statusCode).toBe(200);
    expect(logged.map((l) => l.status)).toEqual([200]);
  });

  test("a domain error is logged with its status, not 200", async () => {
    const { res, logged } = await hit("/conflict");
    expect(res.statusCode).toBe(409);
    expect(logged.map((l) => l.status)).toEqual([409]);
  });

  test("an unexpected error is logged as 500", async () => {
    const { res, logged } = await hit("/boom");
    expect(res.statusCode).toBe(500);
    expect(logged.map((l) => l.status)).toEqual([500]);
  });

  test("a request refused by a guard is logged (it used to vanish)", async () => {
    const { res, logged } = await hit("/guarded");
    expect(res.statusCode).toBe(401);
    expect(logged.map((l) => l.status)).toEqual([401]);
  });

  test("a request for an unknown route is logged as 404", async () => {
    const { res, logged } = await hit("/no-such-route");
    expect(res.statusCode).toBe(404);
    expect(logged.map((l) => l.status)).toEqual([404]);
  });

  test("a server-sent event stream is logged when it ends", async () => {
    const { res, logged } = await hit("/stream");
    expect(res.statusCode).toBe(200);
    expect(logged.map((l) => l.status)).toEqual([200]);
  });

  test("the caller's request id is echoed and logged; otherwise one is minted", async () => {
    const given = await hit("/conflict", { "x-request-id": "req-abc-123" });
    expect(given.res.headers["x-request-id"]).toBe("req-abc-123");
    expect(given.logged.at(-1)?.requestId).toBe("req-abc-123");

    const minted = await hit("/guarded");
    const id = minted.res.headers["x-request-id"];
    expect(typeof id).toBe("string");
    expect(minted.logged.at(-1)?.requestId).toBe(id as string);
  });

  test("a malformed or oversized incoming id is replaced, not echoed into logs", async () => {
    for (const bad of ["a".repeat(300), 'x" "status":200']) {
      const { res, logged } = await hit("/ok", { "x-request-id": bad });
      const id = res.headers["x-request-id"] as string;
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(logged.at(-1)?.requestId).toBe(id);
    }
  });
});
