"use client";

// Last-resort boundary (root layout itself failed) — must render its own
// <html>/<body> and cannot rely on the design system being available.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fbfcfb",
          color: "#1c2420",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>PharmaChain hit an unexpected error</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#5c6660" }}>
            Reloading usually fixes this.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: "#1b6e4b",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
