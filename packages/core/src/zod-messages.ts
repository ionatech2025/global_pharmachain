import { z } from "zod";

/**
 * Human wording for zod's stock length/required messages.
 *
 * Out of the box a short field reads "Too small: expected string to have >=2
 * characters" — developer text that went straight onto the registration form
 * (client review, 2026-10-20). This is the app-wide fallback, applied wherever a
 * schema does not write its own message (an explicit message always wins, so
 * "At least 8 characters" and the like are untouched). Imported once from the
 * package entry, so web forms and API error bodies both pick it up.
 */
z.config({
  // Strict CSP on dynamic routes forbids 'unsafe-eval', so Zod v4's `new Function("")`
  // JIT probe always fails in the browser and logs a DevTools CSP kEvalViolation issue.
  jitless: true,
  customError: (issue) => {
    if (issue.code === "too_small") {
      const min = Number(issue.minimum);
      if (issue.origin === "string") {
        return min <= 1 ? "This field is required" : `Enter at least ${min} characters`;
      }
      if (issue.origin === "array") {
        return min <= 1 ? "Select at least one option" : `Select at least ${min} options`;
      }
      if (issue.origin === "number" || issue.origin === "int") {
        return `Must be ${issue.inclusive ? "at least" : "greater than"} ${min}`;
      }
    }
    if (issue.code === "too_big") {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `Enter no more than ${max} characters`;
      if (issue.origin === "array") return `Select no more than ${max} options`;
      if (issue.origin === "number" || issue.origin === "int") {
        return `Must be ${issue.inclusive ? "at most" : "less than"} ${max}`;
      }
    }
    if (issue.code === "invalid_type" && issue.input === undefined) {
      return "This field is required";
    }
    return undefined; // everything else keeps zod's own wording
  },
});
