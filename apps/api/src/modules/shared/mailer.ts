import { createEmailProvider, type EmailContent } from "@pharmachain/email";
import { logger } from "../../lib/logger";

const provider = createEmailProvider({
  provider: process.env.EMAIL_PROVIDER === "resend" ? "resend" : "console",
  from: process.env.EMAIL_FROM ?? "PharmaChain <no-reply@pharmachain.local>",
  resendApiKey: process.env.RESEND_API_KEY,
});

/** Best-effort transactional send — auth flows never fail on mail errors. */
export async function sendEmailTo(to: string, content: EmailContent): Promise<void> {
  try {
    await provider.send({ to, ...content });
  } catch (err) {
    logger.error("email send failed", { error: String(err) });
  }
}
