import type { NextRequest } from "next/server";
import { API_URL } from "@/env";

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];
const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "host", "cookie"]);

/**
 * Same-origin proxy for browser calls: the httpOnly session cookie never
 * reaches client JS; this route converts it into the Bearer token the API
 * expects. 401s pass through — the QueryProvider redirects to /login.
 */
async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const url = new URL(`${API_URL}/${path.join("/")}`);
  url.search = req.nextUrl.search;

  const headers = new Headers();
  for (const [key, value] of req.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  }
  let token: string | undefined;
  for (const name of SESSION_COOKIES) {
    token = req.cookies.get(name)?.value;
    if (token) break;
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // The proxy owns the client-identity headers — overwrite, never forward,
  // so a browser cannot spoof its own IP to rotate rate-limit buckets.
  // x-proxy-secret proves they come from the web tier (the API ignores
  // x-client-ip without it).
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  headers.set("x-forwarded-for", forwardedFor);
  headers.set("x-client-ip", forwardedFor.split(",")[0]?.trim() ?? "");
  headers.set("x-proxy-secret", process.env.AUTH_SECRET ?? "");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const res = await fetch(url, { method: req.method, headers, body, redirect: "manual" });
  const responseHeaders = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  return new Response(res.body, { status: res.status, headers: responseHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path);
}
