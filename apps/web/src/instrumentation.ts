import { registerOTel } from "@vercel/otel";

/** OpenTelemetry for the web tier (review finding: logs-only observability).
 *  On Vercel this feeds the platform's tracing; with an OTLP endpoint
 *  configured via OTEL_* env vars it exports there instead. No-op locally. */
export function register() {
  registerOTel({ serviceName: "pharmachain-web" });
}
