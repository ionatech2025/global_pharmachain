import { createEmailProvider, type EmailContent, emailConfigFromEnv } from "@pharmachain/email";
import { logger } from "../../lib/logger";

const provider = createEmailProvider(emailConfigFromEnv());

/**
 * Best-effort transactional send — auth flows never fail on mail errors.
 *
 * Returns whether the provider accepted the message, because "best effort"
 * used to mean the caller had no idea either way: a Company Admin saw
 * "Invitation sent" whether the relay took it or refused it, and the invited
 * colleague was simply never heard from again. That silence is what the
 * US-201/US-203 QA round reported as "user doesn't receive email". Callers
 * that can offer the user a way through — the invite link to pass on by hand,
 * a warning to retry the reset — should act on this.
 */
export async function sendEmailTo(to: string, content: EmailContent): Promise<boolean> {
  try {
    await provider.send({ to, ...content });
    return true;
  } catch (err) {
    logger.error("email send failed", { error: String(err) });
    return false;
  }
}
