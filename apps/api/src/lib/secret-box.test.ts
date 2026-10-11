import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isSealed, openSecret, sealSecret } from "./secret-box";

const env = process.env as Record<string, string | undefined>;
const saved = env.AUTH_SECRET;
beforeAll(() => {
  env.AUTH_SECRET = "test-auth-secret-of-sufficient-length-0123456789";
});
afterAll(() => {
  if (saved === undefined) delete env.AUTH_SECRET;
  else env.AUTH_SECRET = saved;
});

describe("secret box", () => {
  test("round-trips, and the stored form reveals nothing", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(openSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
  });

  test("the same secret seals differently each time (random IV)", () => {
    expect(sealSecret("whsec_abc")).not.toBe(sealSecret("whsec_abc"));
  });

  test("legacy plaintext values still open, unchanged", () => {
    expect(openSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
    expect(openSecret("whsec_0123")).toBe("whsec_0123");
  });

  test("a tampered value fails to open instead of yielding garbage", () => {
    // Flip a real ciphertext byte. (Editing the last base64 character is not
    // a reliable tamper: it may only touch the encoding's unused pad bits.)
    const prefix = "enc:v1:";
    const raw = Buffer.from(sealSecret("JBSWY3DPEHPK3PXP").slice(prefix.length), "base64url");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0x01;
    expect(() => openSecret(`${prefix}${raw.toString("base64url")}`)).toThrow();
  });

  test("a different AUTH_SECRET cannot open it", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP");
    env.AUTH_SECRET = "a-completely-different-secret-value-9876543210";
    expect(() => openSecret(sealed)).toThrow();
    env.AUTH_SECRET = "test-auth-secret-of-sufficient-length-0123456789";
  });
});
