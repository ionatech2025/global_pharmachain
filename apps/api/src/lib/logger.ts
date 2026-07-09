// Structured JSON logs — one line per event, ready for a collector.
// OpenTelemetry can be layered on later without touching call sites.
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};
