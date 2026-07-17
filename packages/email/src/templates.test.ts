import { describe, expect, test } from "bun:test";
import { escapeHtml, genericEventEmail, inviteEmail } from "./templates";

describe("escapeHtml", () => {
  test("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x" onmouseover='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onmouseover=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  test("leaves plain text untouched", () => {
    expect(escapeHtml("Order ORD-2026-ABC123 confirmed")).toBe("Order ORD-2026-ABC123 confirmed");
  });
});

describe("genericEventEmail", () => {
  test("user-controlled body cannot inject markup into the HTML part", () => {
    const { html, text } = genericEventEmail({
      title: "New message",
      body: `Click here: <a href="https://evil.example">login</a>`,
    });
    expect(html).not.toContain(`<a href="https://evil.example">`);
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    // The plain-text part keeps the original characters.
    expect(text).toContain(`<a href="https://evil.example">`);
  });

  test("newlines in the body render as line breaks", () => {
    const { html } = genericEventEmail({ title: "T", body: "line one\nline two" });
    expect(html).toContain("line one<br/>line two");
  });

  test("titles cannot smuggle newlines into the subject header", () => {
    const { subject } = genericEventEmail({ title: "Hi\r\nBcc: victim", body: "b" });
    expect(subject).toBe("PharmaChain — Hi Bcc: victim");
  });

  test("escapes the title in the HTML layout", () => {
    const { html } = genericEventEmail({ title: "<script>x</script>", body: "b" });
    expect(html).not.toContain("<script>");
  });
});

describe("inviteEmail", () => {
  test("company names are escaped in the HTML part", () => {
    const { html } = inviteEmail({
      companyName: `<img src=x onerror=alert(1)>`,
      roleLabel: "Operations",
      url: "https://app.example/invite?token=t",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
