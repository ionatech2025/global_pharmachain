import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import net from "node:net";
import { createEmailProvider, emailConfigFromEnv } from "./provider";

describe("emailConfigFromEnv", () => {
  test("with nothing configured, mail is printed rather than sent", () => {
    const config = emailConfigFromEnv({});
    expect(config.provider).toBe("console");
    expect(config.from).toBe("PharmaChain <no-reply@pharmachain.local>");
  });

  test("a configured relay is used without also having to set EMAIL_PROVIDER", () => {
    expect(emailConfigFromEnv({ SMTP_HOST: "smtp.example.com" }).provider).toBe("smtp");
    // A stale value from a previous provider must not silence a real relay.
    expect(
      emailConfigFromEnv({ SMTP_HOST: "smtp.example.com", EMAIL_PROVIDER: "resend" }).provider,
    ).toBe("smtp");
  });

  test("EMAIL_PROVIDER overrides the inference in both directions", () => {
    expect(
      emailConfigFromEnv({ SMTP_HOST: "smtp.example.com", EMAIL_PROVIDER: "console" }).provider,
    ).toBe("console");
    expect(emailConfigFromEnv({ EMAIL_PROVIDER: "smtp" }).provider).toBe("smtp");
  });

  test("EMAIL_FROM falls back to the mailbox we authenticate as", () => {
    expect(emailConfigFromEnv({ SMTP_USER: "relay@example.com" }).from).toBe(
      "PharmaChain <relay@example.com>",
    );
    // A relay whose username is not an address leaves the placeholder…
    expect(emailConfigFromEnv({ SMTP_USER: "apikey" }).from).toBe(
      "PharmaChain <no-reply@pharmachain.local>",
    );
    // …and an explicit EMAIL_FROM always wins.
    expect(
      emailConfigFromEnv({ SMTP_USER: "relay@example.com", EMAIL_FROM: "PharmaChain <a@b.c>" })
        .from,
    ).toBe("PharmaChain <a@b.c>");
  });

  test("a bare address is given the product's name to send under", () => {
    // Recipients see the display name, not the mailbox — an unnamed address
    // reads as a stranger's personal account (QA 2026-08-30).
    expect(emailConfigFromEnv({ EMAIL_FROM: "ops@pharmachain.io" }).from).toBe(
      "PharmaChain <ops@pharmachain.io>",
    );
    // An operator who set their own name keeps it.
    expect(emailConfigFromEnv({ EMAIL_FROM: "Acme Pharma <ops@acme.io>" }).from).toBe(
      "Acme Pharma <ops@acme.io>",
    );
  });

  test("a consumer relay sends as the mailbox it authenticates as, replies to EMAIL_FROM", () => {
    // Gmail replaces a From naming any other mailbox, taking the display name
    // with it, so send the aligned address and keep the configured one as the
    // reply path.
    const config = emailConfigFromEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "relay-account@gmail.com",
      EMAIL_FROM: "globalpharmachain@gmail.com",
    });
    expect(config.from).toBe("PharmaChain <relay-account@gmail.com>");
    expect(config.replyTo).toBe("globalpharmachain@gmail.com");
  });

  test("a relay that already owns the From is left alone", () => {
    // Same mailbox on both sides: nothing to realign, nothing to reply-to.
    const aligned = emailConfigFromEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "relay@gmail.com",
      EMAIL_FROM: "PharmaChain <relay@gmail.com>",
    });
    expect(aligned.from).toBe("PharmaChain <relay@gmail.com>");
    expect(aligned.replyTo).toBeUndefined();

    // A transactional relay or company MTA is *expected* to send as any
    // address on a verified domain — overriding EMAIL_FROM there would be the
    // regression, so only the consumer hosts get realigned.
    const domainRelay = emailConfigFromEnv({
      SMTP_HOST: "smtp.sendgrid.net",
      SMTP_USER: "postmaster@mg.pharmachain.io",
      EMAIL_FROM: "PharmaChain <no-reply@pharmachain.io>",
    });
    expect(domainRelay.from).toBe("PharmaChain <no-reply@pharmachain.io>");
    expect(domainRelay.replyTo).toBeUndefined();
  });

  test("EMAIL_FROM_VERIFIED lets an authorised alias through untouched", () => {
    // Once the mailbox is a verified "Send mail as" alias, Gmail no longer
    // rewrites it — and realigning would be us overriding correct config.
    const config = emailConfigFromEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "relay-account@gmail.com",
      EMAIL_FROM: "PharmaChain <globalpharmachain@gmail.com>",
      EMAIL_FROM_VERIFIED: "true",
    });
    expect(config.from).toBe("PharmaChain <globalpharmachain@gmail.com>");
    expect(config.replyTo).toBeUndefined();
  });

  test("SMTP_SECURE follows the port when it is not set", () => {
    expect(emailConfigFromEnv({ SMTP_PORT: "465" }).smtp?.secure).toBe(true);
    expect(emailConfigFromEnv({ SMTP_PORT: "587" }).smtp?.secure).toBe(false);
    expect(emailConfigFromEnv({ SMTP_PORT: "25" }).smtp?.secure).toBe(false);
    // …and an explicit value always wins over the convention.
    expect(emailConfigFromEnv({ SMTP_PORT: "465", SMTP_SECURE: "false" }).smtp?.secure).toBe(false);
    expect(emailConfigFromEnv({ SMTP_PORT: "587", SMTP_SECURE: "true" }).smtp?.secure).toBe(true);
  });

  test("a missing or unusable port falls back to submission on 587", () => {
    expect(emailConfigFromEnv({}).smtp?.port).toBe(587);
    expect(emailConfigFromEnv({ SMTP_PORT: "" }).smtp?.port).toBe(587);
    expect(emailConfigFromEnv({ SMTP_PORT: "not-a-port" }).smtp?.port).toBe(587);
    expect(emailConfigFromEnv({ SMTP_PORT: "2525" }).smtp?.port).toBe(2525);
  });

  test("blank credentials mean an unauthenticated relay, not an empty login", () => {
    const config = emailConfigFromEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
    });
    expect(config.smtp?.user).toBeUndefined();
    expect(config.smtp?.password).toBeUndefined();
  });

  test("reads the password from SMTP_PASSWORD", () => {
    expect(emailConfigFromEnv({ SMTP_PASSWORD: "s3cret" }).smtp?.password).toBe("s3cret");
  });
});

describe("createEmailProvider", () => {
  test("smtp without a host is a startup failure, not a silent console fallback", () => {
    // Falling back would print invite and password-reset links to the log while
    // looking configured — the failure mode this guard exists to prevent.
    expect(() => createEmailProvider({ provider: "smtp", from: "a@b.c", smtp: {} })).toThrow(
      "EMAIL_PROVIDER=smtp requires SMTP_HOST to be set",
    );
  });
});

/** Enough of RFC 5321 to accept one message and hand it back to the test. */
function smtpSink() {
  const received: { auth?: string; from?: string; to?: string; data: string }[] = [];
  const server = net.createServer((socket) => {
    const session: { auth?: string; from?: string; to?: string; data: string } = { data: "" };
    let inData = false;
    let buffer = "";

    socket.write("220 test.local ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\r\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === ".") {
            inData = false;
            received.push({ ...session });
            socket.write("250 2.0.0 Queued\r\n");
          } else {
            // Undo dot-stuffing so the body compares as it was written.
            session.data += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          }
        } else if (/^EHLO|^HELO/i.test(line)) {
          socket.write("250-test.local\r\n250 AUTH PLAIN LOGIN\r\n");
        } else if (/^AUTH PLAIN /i.test(line)) {
          session.auth = Buffer.from(line.slice(11).trim(), "base64").toString("utf8");
          socket.write("235 2.7.0 Accepted\r\n");
        } else if (/^MAIL FROM:/i.test(line)) {
          session.from = line.slice(10).trim();
          socket.write("250 2.1.0 Ok\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          session.to = line.slice(8).trim();
          socket.write("250 2.1.5 Ok\r\n");
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 2.0.0 Ok\r\n");
        }
        index = buffer.indexOf("\r\n");
      }
    });
    socket.on("error", () => undefined);
  });
  return { server, received };
}

describe("SmtpEmailProvider", () => {
  const { server, received } = smtpSink();
  let port = 0;

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;
  });
  afterAll(() => server.close());

  test("delivers the message over SMTP with both MIME parts", async () => {
    const provider = createEmailProvider({
      provider: "smtp",
      from: "PharmaChain <no-reply@pharmachain.test>",
      smtp: { host: "127.0.0.1", port, secure: false, user: "relay-user", password: "relay-pass" },
    });

    await provider.send({
      to: "invitee@example.com",
      subject: "You're invited to join Nile Pharma Industries",
      html: "<p>Join <b>Nile Pharma</b></p>",
      text: "Join Nile Pharma",
    });

    expect(received).toHaveLength(1);
    const [message] = received;
    if (!message) throw new Error("the sink recorded no message");
    expect(message.auth).toContain("relay-user");
    expect(message.auth).toContain("relay-pass");
    expect(message.from).toContain("no-reply@pharmachain.test");
    expect(message.to).toContain("invitee@example.com");
    expect(message.data).toContain("You're invited to join Nile Pharma Industries");
    expect(message.data).toContain("multipart/alternative");
    // Both parts travel: the HTML for mail clients, the text for everything else.
    expect(message.data).toContain("Join Nile Pharma");
    expect(message.data).toContain("Nile Pharma</b>");
  });

  test("a configured Reply-To reaches the recipient's mail client", async () => {
    const provider = createEmailProvider({
      provider: "smtp",
      from: "PharmaChain <relay-account@gmail.test>",
      replyTo: "globalpharmachain@gmail.test",
      smtp: { host: "127.0.0.1", port, secure: false, user: "relay-user", password: "relay-pass" },
    });

    await provider.send({
      to: "invitee@example.com",
      subject: "You're invited",
      html: "<p>Join</p>",
      text: "Join",
    });

    const message = received.at(-1);
    if (!message) throw new Error("the sink recorded no message");
    expect(message.data).toContain("Reply-To: globalpharmachain@gmail.test");
  });

  test("an unreachable relay fails without leaking what was sent", async () => {
    const provider = createEmailProvider({
      provider: "smtp",
      from: "PharmaChain <no-reply@pharmachain.test>",
      // Port 1 is reserved and refuses immediately.
      smtp: { host: "127.0.0.1", port: 1, secure: false, user: "relay-user", password: "hunter2" },
    });

    const send = provider.send({
      to: "invitee@example.com",
      subject: "Reset your password",
      html: "<p>link</p>",
      text: "link",
    });
    await expect(send).rejects.toThrow(/SMTP send failed/);
    await expect(send).rejects.not.toThrow(/hunter2/);
  });
});
