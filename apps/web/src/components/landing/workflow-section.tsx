import {
  DOCUMENT_KIND_LABELS,
  nextOrderStatus,
  ORDER_PIPELINE_STAGES,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderStatus,
  orderStatusIndex,
  PAYMENT_METHOD_LABELS,
  stageSetBy,
} from "@pharmachain/core";
import { BadgeCheck, CircleCheck, FileText } from "lucide-react";
import { SectionHeading } from "./section-heading";

// Illustrative order: the stage names, their order and who sets the next one
// come from the same core model the order page uses.
const CURRENT: OrderStatus = "IN_TRANSIT";
const CURRENT_INDEX = orderStatusIndex(CURRENT);
const NEXT = nextOrderStatus(CURRENT);
const DOCUMENTS = (
  ["CERTIFICATE_OF_ANALYSIS", "GMP_CERTIFICATE", "COMMERCIAL_INVOICE"] as const
).map((kind) => DOCUMENT_KIND_LABELS[kind]);

const EXPLAINERS = [
  {
    title: "Choose a verified supplier",
    body: "Storefronts show each company's verification status before you trade with it.",
    state: "Verified · GMP certificate on file · Upstream lane",
  },
  {
    title: "Award with the quotation on record",
    body: "Awarding a quotation creates the order, and the order keeps the quotation it came from.",
    state: "Quotation awarded · Order created · Audit trail started",
  },
  {
    title: "Track to delivery confirmation",
    body: "Each stage is set by the party responsible for it; the order completes when the buyer confirms receipt.",
    state: `${ORDER_STATUS_LABELS[CURRENT]} · Stage ${CURRENT_INDEX + 1} of ${ORDER_STATUSES.length} · Buyer confirms the last`,
  },
];

function OrderExample() {
  return (
    <figure className="bg-navy-panel dark relative overflow-hidden rounded-3xl p-3 text-foreground shadow-[0_40px_80px_-40px_oklch(0.2_0.08_260/0.7)] sm:p-4">
      <figcaption className="sr-only">Example order, for illustration only</figcaption>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-muted-foreground">Example order</p>
            <p className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Paracetamol API · 2 t
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Mumbai → Kampala</p>
          </div>
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-200">
            {PAYMENT_METHOD_LABELS.ESCROW}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Supplier</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[oklch(0.25_0.05_260)]">
                <BadgeCheck aria-hidden className="size-3" />
                Verified supplier
              </span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {[
                "GMP certificate on file",
                "Quoted in a private thread",
                "Awarded quotation kept",
              ].map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <CircleCheck aria-hidden className="size-3.5 shrink-0 text-emerald-300" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-white/[0.06] p-4">
            <p className="text-sm font-semibold">Shipment</p>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Stage</dt>
                <dd className="font-medium">
                  {CURRENT_INDEX + 1} of {ORDER_STATUSES.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium">{ORDER_STATUS_LABELS[CURRENT]}</dd>
              </div>
            </dl>
            {NEXT && (
              <p className="mt-3 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-muted-foreground">
                Next: {ORDER_STATUS_LABELS[NEXT]}, set by {stageSetBy(NEXT)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-white/[0.06] p-4">
          <div aria-hidden className="grid grid-cols-13 gap-1">
            {ORDER_STATUSES.map((status, i) => (
              <span
                key={status}
                className={`h-1.5 rounded-full ${
                  i < CURRENT_INDEX
                    ? "bg-sky-300/80"
                    : i === CURRENT_INDEX
                      ? "bg-amber-300"
                      : "bg-white/15"
                }`}
              />
            ))}
          </div>
          <ol className="mt-3 flex flex-wrap gap-1.5">
            {ORDER_PIPELINE_STAGES.map((stage) => {
              const current = stage.statuses.includes(CURRENT);
              const done = orderStatusIndex(stage.statuses.at(-1) ?? CURRENT) < CURRENT_INDEX;
              return (
                <li
                  key={stage.key}
                  aria-current={current ? "step" : undefined}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    current
                      ? "bg-amber-300 text-[oklch(0.25_0.05_60)]"
                      : done
                        ? "bg-white/90 text-[oklch(0.25_0.05_260)]"
                        : "bg-white/[0.08] text-muted-foreground"
                  }`}
                >
                  {stage.label}
                </li>
              );
            })}
          </ol>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {DOCUMENTS.map((doc) => (
            <li
              key={doc}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1 text-xs text-muted-foreground"
            >
              <FileText aria-hidden className="size-3.5" />
              {doc}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export function WorkflowSection() {
  return (
    <section aria-labelledby="workflow-title" className="py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="workflow-title"
          pill="Product workflow"
          title="See the states your team works with"
          lead="Every order carries its awarded quotation, its documents and its shipment stage. This is what that looks like."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <OrderExample />
          <ol className="grid gap-4">
            {EXPLAINERS.map((item, i) => (
              <li key={item.title} className="landing-card p-6">
                <h3 className="text-lg font-semibold text-foreground">
                  {i + 1}. {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                <p className="mt-4 rounded-xl bg-muted/70 px-4 py-2.5 text-sm text-foreground/80">
                  {item.state}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
