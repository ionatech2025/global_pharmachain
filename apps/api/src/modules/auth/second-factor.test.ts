import { describe, expect, test } from "bun:test";
import { secondFactorFor } from "./second-factor";

const plan = (isSuperAdmin: boolean, passkeyCount: number, totpEnabled: boolean) =>
  secondFactorFor({ isSuperAdmin, passkeyCount, totpEnabled });

describe("secondFactorFor", () => {
  test("nothing enrolled: nothing is asked for — a release cannot lock anyone out", () => {
    expect(plan(false, 0, false)).toBe("none");
    expect(plan(true, 0, false)).toBe("none");
  });

  test("TOTP alone behaves as before", () => {
    expect(plan(false, 0, true)).toBe("totp");
    expect(plan(true, 0, true)).toBe("totp");
  });

  test("a platform admin with a passkey must use it, even if they also have TOTP", () => {
    expect(plan(true, 1, false)).toBe("passkey");
    expect(plan(true, 2, true)).toBe("passkey");
  });

  test("an ordinary user with a passkey and TOTP may use either", () => {
    expect(plan(false, 1, true)).toBe("passkey-or-totp");
  });

  test("an ordinary user with only a passkey must use it", () => {
    expect(plan(false, 1, false)).toBe("passkey");
  });
});
