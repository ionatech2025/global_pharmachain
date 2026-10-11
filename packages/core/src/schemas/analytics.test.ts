import { describe, expect, test } from "bun:test";
import { isKnownPushEndpoint, pushSubscribeSchema } from "./analytics";

describe("isKnownPushEndpoint", () => {
  test("the browsers' push services are accepted", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:APA91b",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
      "https://web.push.apple.com/QGuQyavXutnMH",
    ]) {
      expect(isKnownPushEndpoint(endpoint)).toBe(true);
    }
  });

  test("anything else is refused — the server would POST to it", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc", // not https
      "https://169.254.169.254/latest/meta-data",
      "https://internal-service.local/hook",
      "https://fcm.googleapis.com.attacker.example/x", // lookalike suffix
      "https://evilpush.services.mozilla.com.example/x",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "not a url",
    ]) {
      expect(isKnownPushEndpoint(endpoint)).toBe(false);
    }
  });

  test("the subscribe contract enforces it", () => {
    const keys = { p256dh: "x".repeat(20), auth: "y".repeat(10) };
    expect(
      pushSubscribeSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/a", keys })
        .success,
    ).toBe(true);
    expect(pushSubscribeSchema.safeParse({ endpoint: "https://10.0.0.5/push", keys }).success).toBe(
      false,
    );
  });
});
