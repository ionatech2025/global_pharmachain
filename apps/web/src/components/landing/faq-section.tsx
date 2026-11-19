import { ChevronDown, CircleHelp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SUPPORT_EMAIL, WHATSAPP_NUMBER } from "@/lib/contact";
import { SectionHeading } from "./section-heading";

const linkClass = "font-medium text-primary underline underline-offset-2";

const FAQS: { question: string; answer: ReactNode }[] = [
  {
    question: "Who can join?",
    answer:
      "Pharmaceutical companies across the three lanes: raw material and API manufacturers, finished-product manufacturers and CDMOs, wholesale distributors, pharmacies and institutional buyers, plus logistics partners. Every company registers and is verified before it trades.",
  },
  {
    question: "How is a company verified?",
    answer:
      "It submits its regulatory documents, such as GMP certificates, manufacturing licences and tax IDs, and the platform team reviews them. Expiry dates are tracked, and lapsed documents are flagged.",
  },
  {
    question: "Does Global PharmaChain sell or ship medicines?",
    answer: (
      <>
        No. It is an independent B2B matching directory and information infrastructure; transactions
        take place between the verified companies themselves. See the{" "}
        <a href="#compliance" className={linkClass}>
          regulatory notice
        </a>{" "}
        and the{" "}
        <Link href="/disclaimer" className={linkClass}>
          full legal statement
        </Link>
        .
      </>
    ),
  },
  {
    question: "How are payments settled?",
    answer:
      "Directly between buyer and supplier. An order records payment by bank transfer, card, mobile money or third-party escrow, and corporate terms such as letters of credit are agreed between the two companies.",
  },
  {
    question: "Who can see my quotations and messages?",
    answer:
      "Your quotation goes to the buyer and is never shown to competing suppliers. Messages stay between the buyer and the supplier. Once there is an order, the logistics companies the buyer appoints to it can see that order, including its price, and join its thread.",
  },
  {
    question: "What does it cost to start?",
    answer:
      "Every company starts on the Freemium tier, which includes a monthly allowance of RFQs and quotations.",
  },
  {
    question: "How do I get help?",
    answer: (
      <>
        Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
          {SUPPORT_EMAIL}
        </a>
        {WHATSAPP_NUMBER ? ` or message us on WhatsApp at ${WHATSAPP_NUMBER}` : ""}. Every contact
        channel is{" "}
        <a href="#contact" className={linkClass}>
          listed at the foot of this page
        </a>
        .
      </>
    ),
  },
];

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHeading
          id="faq-title"
          pill="FAQ"
          icon={<CircleHelp aria-hidden className="size-3.5" />}
          title="Answers before you register"
          lead="What companies usually ask about joining, verification, payment and confidentiality."
        />
        <div className="mt-12 space-y-3">
          {FAQS.map(({ question, answer }, i) => (
            <details key={question} open={i === 0} className="landing-card group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left font-medium text-foreground [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Still have questions?{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
            Write to support
          </a>
          .
        </p>
      </div>
    </section>
  );
}
