"use client";

import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Input } from "@pharmachain/ui/components/input";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Factory,
  FileCheck2,
  FlaskConical,
  Search,
  ShieldAlert,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface TradingLane {
  id: "upstream" | "midstream" | "downstream";
  tier: string;
  subtitle: string;
  headline: string;
  description: string;
  badge: string;
  icon: typeof FlaskConical;
  colorTheme: {
    border: string;
    badgeBg: string;
    iconBg: string;
    iconText: string;
    button: string;
  };
  storefronts: {
    name: string;
    desc: string;
    tags: string[];
  }[];
  primaryCta: {
    label: string;
    href: string;
  };
  userTypes: string;
}

const TRADING_LANES: TradingLane[] = [
  {
    id: "upstream",
    tier: "Tier 1: Upstream",
    subtitle: "Industrial Inbound",
    headline: "Raw Materials, APIs & Consumables",
    badge: "Industrial Inbound",
    icon: FlaskConical,
    userTypes: "API Manufacturers, Chemical Plants & Equipment Suppliers",
    description:
      "Direct storefronts for certified input materials, precision lab gear, packaging and cleanroom supplies required for pharmaceutical synthesis.",
    colorTheme: {
      border: "border-sky-500/30 hover:border-sky-500/60",
      badgeBg: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
      iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      iconText: "text-sky-600 dark:text-sky-400",
      button: "bg-sky-600 hover:bg-sky-700 text-white",
    },
    primaryCta: {
      label: "Source Upstream Inputs",
      href: "/register?type=RAW_MATERIAL_MANUFACTURER&action=source_raw",
    },
    storefronts: [
      {
        name: "Active Pharmaceutical Ingredients (APIs)",
        desc: "USP/BP/EP certified pure drug substances with active Drug Master Files (DMF).",
        tags: ["GMP Certified", "CoA Available", "DMF/CEP"],
      },
      {
        name: "Bulk Fine Chemicals & Solvents",
        desc: "High-grade synthesis intermediates, reagents, buffers, and specialty process chemicals.",
        tags: ["Pharma Grade", "Batch Traceable"],
      },
      {
        name: "Pharmaceutical Equipments & Machinery",
        desc: "Bioreactors, tablet presses, fluid bed dryers, HPLC, and isolators.",
        tags: ["FAT/SAT Docs", "DQ/IQ/OQ/PQ"],
      },
      {
        name: "Excipients & Functional Binders",
        desc: "Fillers, disintegrants, lubricants, coating polymers, and sustained-release agents.",
        tags: ["USP-NF", "EP Monographs"],
      },
      {
        name: "Primary Packaging Materials",
        desc: "Sterile Type I glass vials, ampoules, rubber stoppers, and alu-alu blister foils.",
        tags: ["Sterile Pack", "ISO 15378"],
      },
      {
        name: "Cleanroom Consumables & Lab Supplies",
        desc: "Sterile apparel, HEPA filters, particle counters, and environmental testing kits.",
        tags: ["Grade A/B", "Gamma Irradiated"],
      },
    ],
  },
  {
    id: "midstream",
    tier: "Tier 2: Midstream",
    subtitle: "The Manufacturing Hub",
    headline: "Formulations & CDMO Capacity",
    badge: "The Manufacturing Hub",
    icon: Factory,
    userTypes: "Finished Product Manufacturers, CDMOs & Formulators",
    description:
      "Showcase portals for Finished Dosage Forms (FDFs), formulation licensing, tech transfer, and contract manufacturing capacity bookings.",
    colorTheme: {
      border: "border-indigo-500/30 hover:border-indigo-500/60",
      badgeBg: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
      iconBg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
      iconText: "text-indigo-600 dark:text-indigo-400",
      button: "bg-indigo-600 hover:bg-indigo-700 text-white",
    },
    primaryCta: {
      label: "List Manufacturing Capacity",
      href: "/register?type=FINISHED_PRODUCT_MANUFACTURER&action=list_capacity",
    },
    storefronts: [
      {
        name: "Finished Dosage Forms (FDFs)",
        desc: "Commercial-ready tablets, capsules, injectables, ophthalmics, and topical liquids.",
        tags: ["WHO-GMP", "EU-GMP", "Batch Release"],
      },
      {
        name: "Formulation Licensing & Tech Transfer",
        desc: "Out-licensing of bioequivalent generic dossiers, CTD Module 3 data, and proprietary formulas.",
        tags: ["eCTD Dossier", "BE Study Ready"],
      },
      {
        name: "CDMO / CMO Contract Manufacturing",
        desc: "Available plant capacity for oral solids, sterile injectables, lyophilization, and biologics.",
        tags: ["Capacity Booking", "Contract Fill-Finish"],
      },
      {
        name: "Engineering & Process Optimization",
        desc: "Scale-up validation, clean utility design, and automated filling line integration.",
        tags: ["GAMP 5", "Automation"],
      },
      {
        name: "Project Consultants & Regulatory Affairs",
        desc: "Dossier compilation, audit preparedness, GMP remediation, and market authorization filings.",
        tags: ["FDA / EMA Filing", "Audit Readiness"],
      },
      {
        name: "Packaging & Artwork Designers",
        desc: "Serialized 2D Datamatrix compliance, tamper-evident design, and multi-language patient leaflets.",
        tags: ["DSCSA Serialized", "FMD Ready"],
      },
    ],
  },
  {
    id: "downstream",
    tier: "Tier 3: Downstream",
    subtitle: "Commercial Outbound",
    headline: "Wholesale Distribution & Institutional",
    badge: "Commercial Outbound",
    icon: Building2,
    userTypes: "Wholesale Dealers, Pharmacy Chains & Health Ministries",
    description:
      "Direct wholesale channels for bulk medications, tenders, regional distribution agreements, and institutional healthcare supply chains.",
    colorTheme: {
      border: "border-teal-500/30 hover:border-teal-500/60",
      badgeBg: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
      iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
      iconText: "text-teal-600 dark:text-teal-400",
      button: "bg-teal-600 hover:bg-teal-700 text-white",
    },
    primaryCta: {
      label: "Procure Bulk Inventory",
      href: "/register?type=FINISHED_PRODUCT_DISTRIBUTOR&action=procure_bulk",
    },
    storefronts: [
      {
        name: "Bulk Finished Medication Listings",
        desc: "Immediate pallet and container quantities ready for dispatch under verified cold-chain protocol.",
        tags: ["Immediate Stock", "Verified Ledger"],
      },
      {
        name: "Regional Traders & Importers",
        desc: "Authorized country distributors with bonded customs warehousing and local import permits.",
        tags: ["Licensed Importer", "GDP Compliant"],
      },
      {
        name: "Pharmacy Chains & Retail Groups",
        desc: "Scheduled delivery contracts for essential medicine lists, generics, and OTC items.",
        tags: ["Direct Wholesale", "Volume Rebates"],
      },
      {
        name: "Institutional Procurement & Health Ministries",
        desc: "National tender tenders, multilateral healthcare agency supply, and emergency health reserves.",
        tags: ["Tender Execution", "LC Settlement"],
      },
      {
        name: "Medical Centers & Hospital Consortia",
        desc: "Hospital-grade therapeutics, specialty oncology, IV fluids, and surgical consumables.",
        tags: ["Hospital Supply", "Cold Chain"],
      },
      {
        name: "Logistics, Clearing & Multimodal Freight",
        desc: "End-to-end temperature-monitored forwarding, customs clearance, and GDP-certified haulage.",
        tags: ["GPS Tracked", "Temp Loggers"],
      },
    ],
  },
];

export function MallDirectoryGrid() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const query = searchQuery.trim().toLowerCase();

  return (
    <section
      id="mall-directory"
      aria-label="Interactive Trading Lanes Mall Directory"
      className="scroll-mt-20 py-16 sm:py-24 bg-muted/15 border-y border-border/60"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <Badge
            variant="outline"
            className="mb-3 px-3 py-1 font-medium bg-primary/5 text-primary border-primary/20"
          >
            Interactive Mall Directory
          </Badge>
          <h2 className="text-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Three Dedicated Trading Lanes
          </h2>
          <p className="mt-3 text-base sm:text-lg text-muted-foreground">
            A segregated, enterprise-grade directory mapping industrial inbound raw inputs,
            manufacturing capacity, and commercial outbound wholesale procurement.
          </p>

          {/* Quick-Search / Live Filter Bar */}
          <div className="mt-6 mx-auto max-w-md relative flex items-center">
            <Search
              className="size-4 absolute left-3.5 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter storefronts (e.g. APIs, CDMO, sterile vials, WHO-GMP)…"
              aria-label="Filter directory storefronts and trading lanes"
              className="pl-9 pr-9 h-11 rounded-full border-border/80 bg-background/90 text-sm shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search input"
                className="absolute right-3 text-muted-foreground hover:text-foreground p-1 rounded-full"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* 3-Column Interactive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {TRADING_LANES.map((lane) => {
            const Icon = lane.icon;

            return (
              <div
                key={lane.id}
                className={`relative flex flex-col justify-between rounded-3xl border bg-card/90 backdrop-blur-sm p-6 sm:p-7 transition-all duration-300 shadow-sm hover:shadow-xl hover:ring-2 hover:ring-primary/25 ${lane.colorTheme.border}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lane.tier}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${lane.colorTheme.badgeBg}`}
                    >
                      {lane.subtitle}
                    </span>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <div className={`p-3 rounded-2xl ${lane.colorTheme.iconBg}`}>
                      <Icon className="size-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{lane.headline}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{lane.userTypes}</p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                    {lane.description}
                  </p>

                  <div className="border-t border-border/60 pt-4 mb-6">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
                        Directory Portals & Storefronts
                      </p>
                      {(selectedTag || query) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTag(null);
                            setSearchQuery("");
                          }}
                          className="text-[10px] text-primary hover:underline font-medium"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {lane.storefronts.map((store) => {
                        const matchesTag = !selectedTag || store.tags.includes(selectedTag);
                        const matchesQuery =
                          !query ||
                          store.name.toLowerCase().includes(query) ||
                          store.desc.toLowerCase().includes(query) ||
                          store.tags.some((t) => t.toLowerCase().includes(query));
                        const isVisible = matchesTag && matchesQuery;
                        return (
                          <div
                            key={store.name}
                            className={`rounded-xl border p-3 transition-all ${
                              isVisible
                                ? "border-border/60 bg-background/80 hover:bg-background/95"
                                : "border-border/30 bg-background/40 opacity-40 hover:opacity-80"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {store.name}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 leading-normal">
                              {store.desc}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {store.tags.map((tag) => (
                                <button
                                  type="button"
                                  key={tag}
                                  aria-pressed={selectedTag === tag}
                                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                                  className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                                    selectedTag === tag
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-muted/50 text-muted-foreground border-border/40 hover:bg-muted"
                                  }`}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    asChild
                    size="lg"
                    className={`w-full font-semibold rounded-xl shadow-md ${lane.colorTheme.button}`}
                  >
                    <Link href={lane.primaryCta.href}>
                      {lane.primaryCta.label}
                      <ArrowRight className="size-4 ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Audit & Compliance Assurance Strip */}
        <div className="mt-12 rounded-2xl border border-border/80 bg-background/70 p-4 sm:p-6 backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-5 text-success shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Verified Counterparties</p>
                <p className="text-xs text-muted-foreground">
                  Every participant inspected & validated
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileCheck2 className="size-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Cryptographic Escrow</p>
                <p className="text-xs text-muted-foreground">Deterministic condition fulfillment</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ShieldAlert className="size-5 text-indigo-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Secure Audit Ledger</p>
                <p className="text-xs text-muted-foreground">
                  Immutable tamper-evident traceability
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Warehouse className="size-5 text-teal-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Enterprise Settlement</p>
                <p className="text-xs text-muted-foreground">Bank wire, corporate accounts & LC</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
