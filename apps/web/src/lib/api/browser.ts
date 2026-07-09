"use client";

import { createApiClient } from "./http";

/**
 * Browser-side API client. Requests go through /api/proxy (same-origin, the
 * httpOnly session cookie rides along); the proxy attaches the Bearer token.
 */
export const api = createApiClient("/api/proxy");
