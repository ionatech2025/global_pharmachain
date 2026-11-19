import { Factory, ShoppingCart } from "lucide-react";
import { RoleTabs } from "./role-tabs";
import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    title: "Verify",
    body: "Register your company and submit GMP certificates, licences and tax IDs.",
  },
  {
    title: "Publish",
    body: "List stock and capacity, or send a targeted RFQ with your specification.",
  },
  {
    title: "Award",
    body: "Compare quotations and award one; the order is created with the quotation on record.",
  },
  {
    title: "Track",
    body: "Follow 13 shipment stages until the buyer confirms delivery.",
  },
];

interface RoleStep {
  title: string;
  body: string;
  trust: string;
}

const BUYER_STEPS: RoleStep[] = [
  {
    title: "Publish an RFQ",
    body: "Target it at the company types that can supply what you need.",
    trust: "Only the companies you target see the RFQ.",
  },
  {
    title: "Compare quotations",
    body: "Each supplier quotes privately, in its own thread with you.",
    trust: "Suppliers never see each other's quotations.",
  },
  {
    title: "Award and pay",
    body: "Awarding turns the quotation into an order. Settle by bank transfer, card, mobile money or escrow.",
    trust: "The order keeps the awarded quotation, and every change lands on its audit trail.",
  },
  {
    title: "Confirm delivery",
    body: "Follow the shipment stages and confirm receipt. Stage 13 is yours.",
    trust:
      "The order completes only when you confirm. If something is wrong, raise a dispute instead.",
  },
];

const SUPPLIER_STEPS: RoleStep[] = [
  {
    title: "Get verified",
    body: "Upload GMP certificates, licences and CoAs; the platform team reviews them.",
    trust: "Expiring documents are flagged before they lapse.",
  },
  {
    title: "List your storefront",
    body: "Show your stock, capacity and services in your lane.",
    trust: "Buyers see your verification status.",
  },
  {
    title: "Quote on RFQs",
    body: "Quote on the RFQs aimed at your company type.",
    trust: "Your price is visible only to that buyer.",
  },
  {
    title: "Ship and update",
    body: "Move the shipment through its stages; each stage is set by the party responsible for it.",
    trust: "Stages only move forward, and platform-team corrections are audited with a reason.",
  },
];

function RoleSteps({ steps }: { steps: RoleStep[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
        <li key={step.title} className="landing-card flex flex-col p-6">
          <span className="step-badge">{i + 1}</span>
          <h3 className="mt-5 text-lg font-semibold text-foreground">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          <div className="mt-auto pt-5">
            <div className="rounded-xl bg-primary/5 p-4">
              <p className="text-sm font-medium text-foreground">Where trust happens</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.trust}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="how-title"
          pill="Simple process"
          title="From verification to delivery confirmation"
          lead="Four steps take a company from registration to a confirmed delivery, and each one leaves a record the other side can see."
        />

        <ol className="landing-card mt-12 grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl bg-muted/70 p-5">
              <div className="flex items-center gap-3">
                <span className="step-badge">{i + 1}</span>
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12">
          <RoleTabs
            label="Steps by role"
            tabs={[
              {
                label: "For buyers",
                icon: <ShoppingCart aria-hidden />,
                panel: <RoleSteps steps={BUYER_STEPS} />,
              },
              {
                label: "For suppliers",
                icon: <Factory aria-hidden />,
                panel: <RoleSteps steps={SUPPLIER_STEPS} />,
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
