import { createEmailProvider, type EmailContent, emailConfigFromEnv } from "@pharmachain/email";
import { logger } from "../../lib/logger";

const provider = createEmailProvider(emailConfigFromEnv());

/** Best-effort transactional send — auth flows never fail on mail errors. */
export async function sendEmailTo(to: string, content: EmailContent): Promise<void> {
  try {
    await provider.send({ to, ...content });
  } catch (err) {
    logger.error("email send failed", { error: String(err) });
  }
}
