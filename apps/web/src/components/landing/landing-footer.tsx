import { Mail, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import {
  CONTACT_EMAILS,
  CONTACT_PHONES,
  INFO_EMAIL,
  SALES_EMAIL,
  SUPPORT_EMAIL,
  telHref,
  WHATSAPP_LABEL,
  WHATSAPP_NUMBER,
  whatsappHref,
} from "@/lib/contact";
import { LANE_LINKS } from "@/lib/lane-links";

const FOOTER_GROUPS = [
  {
    heading: "Platform",
    links: [
      { href: "#mall-directory", label: "Mall Directory" },
      { href: "#platform", label: "Enterprise Platform" },
      { href: "#how", label: "How it Works" },
      { href: "#faq", label: "FAQ" },
      { href: "/verify", label: "Trace Verification" },
    ],
  },
  {
    heading: "Trading Lanes",
    links: [
      { href: LANE_LINKS.source, label: "Upstream (APIs & Inputs)" },
      { href: LANE_LINKS.list, label: "Midstream (Manufacturing Hub)" },
      { href: LANE_LINKS.procure, label: "Downstream (Wholesale Distribution)" },
    ],
  },
  {
    heading: "Contact & Legal",
    links: [
      { href: `mailto:${SALES_EMAIL}`, label: SALES_EMAIL },
      { href: `mailto:${INFO_EMAIL}`, label: INFO_EMAIL },
      { href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL },
      ...CONTACT_PHONES.slice(0, 1).map((phone) => ({ href: telHref(phone), label: phone })),
      ...(WHATSAPP_NUMBER
        ? [{ href: whatsappHref(WHATSAPP_NUMBER), label: `WhatsApp ${WHATSAPP_NUMBER}` }]
        : []),
      { href: "/disclaimer", label: "Regulatory Disclaimer" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t bg-muted/60">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1.2fr] lg:px-8">
        <div id="contact">
          <Link href="/" aria-label="Global PharmaChain home">
            <Logo markClassName="size-8" wordClassName="text-lg" />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            The global verified network for pharmaceutical sourcing and logistics — RFQ to
            delivered, fully audit-trailed.
          </p>

          <div className="mt-5 space-y-2 text-xs text-muted-foreground">
            {CONTACT_EMAILS.map(({ label, email }) => (
              <div key={email} className="flex items-center gap-2">
                <Mail aria-hidden className="size-3.5 shrink-0 text-primary" />
                <span>
                  <span className="font-medium text-foreground/80">{label}:</span>{" "}
                  <a href={`mailto:${email}`} className="underline hover:text-foreground">
                    {email}
                  </a>
                </span>
              </div>
            ))}
            {CONTACT_PHONES.length > 0 && (
              <div className="flex items-center gap-2">
                <Phone aria-hidden className="size-3.5 shrink-0 text-primary" />
                <span>
                  {CONTACT_PHONES.map((phone, i) => (
                    <span key={phone}>
                      {i > 0 && " / "}
                      <a href={telHref(phone)} className="hover:text-foreground">
                        {phone}
                      </a>
                    </span>
                  ))}
                </span>
              </div>
            )}
            {WHATSAPP_NUMBER && (
              <div className="flex items-center gap-2">
                <MessageCircle aria-hidden className="size-3.5 shrink-0 text-primary" />
                <span>
                  <span className="font-medium text-foreground/80">WhatsApp:</span>{" "}
                  <a
                    href={whatsappHref(WHATSAPP_NUMBER)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${WHATSAPP_LABEL} (${WHATSAPP_NUMBER})`}
                    className="underline hover:text-foreground"
                  >
                    {WHATSAPP_NUMBER}
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <p className="text-sm font-semibold text-foreground">{group.heading}</p>
            <ul className="mt-4 space-y-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm break-words text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LogoMark className="size-5" />© 2026 Global PharmaChain · The global pharmaceutical
            supply network
          </p>
          <p className="text-xs text-muted-foreground">
            Kampala · Nairobi · Mumbai · Shanghai · Rotterdam · São Paulo
          </p>
        </div>
      </div>
    </footer>
  );
}
