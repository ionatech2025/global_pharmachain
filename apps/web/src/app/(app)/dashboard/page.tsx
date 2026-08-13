import {
  COMPANY_TYPE_LABELS,
  isLogisticsCompanyType,
  LOGISTICS_ROLE_LABELS,
  VERIFICATION_STATUS_LABELS,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import {
  Bell,
  Building2,
  FileClock,
  FileText,
  Inbox,
  Layers,
  ListChecks,
  Package,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { type AttentionItem, AttentionList } from "@/components/dashboard/attention";
import { Meter, StageDonut, TrendChart } from "@/components/dashboard/charts";
import { DashboardHeader, QuickActions } from "@/components/dashboard/header";
import {
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  Provenance,
} from "@/components/dashboard/panel";
import { StatGrid, StatTile } from "@/components/dashboard/stat-tile";
import { DashboardRefresh } from "@/components/dashboard-refresh";
import { EmptyState } from "@/components/empty-state";
import { CustomizeDashboardButton, type Kpi, KpiGrid } from "@/components/kpi-widgets";
import { OrderStatusBadge } from "@/components/status-badge";
import { apiServer, getViewer } from "@/lib/api/server";
import type {
  AppointedShipmentRow,
  DashboardActivity,
  DashboardSummary,
  OrderRow,
  Paginated,
} from "@/lib/api/types";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

export const metadata = { title: "Dashboard" };

/** Pull one series out of the weekly trend for a tile's sparkline. */
const sparkFor = (activity: DashboardActivity, key: string) =>
  activity.trend.map((p) => p.values[key] ?? 0);

/** The window caption every delta on the page is measured against. */
const vsPrevious = (days: number) => `vs previous ${days} days`;

/** Section label with an optional action, for tile rows that aren't panels. */
function SectionHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 pt-1">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Compact recent-orders table — the same columns on every dashboard variant. */
function RecentOrders({ orders, companyId }: { orders: OrderRow[]; companyId?: string }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No orders yet"
        hint="An order is created the moment a buyer accepts one of your quotations."
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead className="hidden sm:table-cell">Counterparty</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="hidden md:table-cell">ETA</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const selling = companyId ? o.sellerCompany.id === companyId : false;
          const counterparty = selling ? o.buyerCompany : o.sellerCompany;
          return (
            <TableRow key={o.id}>
              {/* Both text columns truncate, so they carry the width budget:
                  at 13rem + 9rem the five columns fit a two-thirds panel on a
                  1440 desktop instead of forcing a sideways scroll. */}
              <TableCell className="max-w-[13rem]">
                <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                  {o.orderNo}
                </Link>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {o.title}
                </span>
              </TableCell>
              <TableCell className="hidden max-w-[9rem] truncate sm:table-cell">
                <span className="block truncate text-sm">{counterparty.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {companyId
                    ? selling
                      ? "buying from you"
                      : "supplying you"
                    : counterparty.country}
                </span>
              </TableCell>
              <TableCell className="text-right font-medium">
                {fmtMoney(o.totalAmount, o.currency)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {fmtDate(o.eta)}
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={o.status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Appointed shipments, from the logistics side: lane, role, stage. */
function RecentShipments({ rows }: { rows: AppointedShipmentRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="No appointments yet"
        hint="When a buyer appoints your company on a shipment it appears here, and your team is notified."
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead className="hidden sm:table-cell">Lane</TableHead>
          <TableHead className="hidden md:table-cell">Your role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden lg:table-cell">ETA</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="max-w-[16rem]">
              <Link href={`/orders/${row.order.id}`} className="font-medium hover:underline">
                {row.order.orderNo}
              </Link>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {row.order.title}
              </span>
            </TableCell>
            <TableCell className="hidden max-w-[14rem] truncate text-sm sm:table-cell">
              {row.order.sellerCompany.name}
              <span className="text-muted-foreground"> → </span>
              {row.order.buyerCompany.name}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant="outline">{LOGISTICS_ROLE_LABELS[row.role]}</Badge>
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={row.order.status} />
            </TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {fmtDate(row.order.eta)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function DashboardPage() {
  const api = await apiServer();
  const [summary, me, kpis, dashboardPrefs, activity] = await Promise.all([
    api.get<DashboardSummary>("/dashboard/summary"),
    getViewer(),
    api.get<Kpi[]>("/analytics/kpis").catch(() => [] as Kpi[]),
    api
      .get<{ widgets: string[]; available: Array<{ key: string; label: string }> }>("/me/dashboard")
      .catch(() => ({ widgets: [], available: [] })),
    api.get<DashboardActivity>("/dashboard/activity"),
  ]);
  const window = activity.windowDays;

  // ── Logistics companies (Phase 2): they work appointed shipments, not the
  //    market, so their dashboard leads with the shipments they are on.
  if (me.membership && isLogisticsCompanyType(me.membership.companyType)) {
    const shipments = await api.get<Paginated<AppointedShipmentRow>>(
      "/shipments?page=1&pageSize=6",
    );
    const c = summary.company;
    const attention: AttentionItem[] = [];
    if ((c?.expiringDocuments ?? 0) > 0)
      attention.push({
        key: "docs",
        icon: FileClock,
        tone: "warning",
        title: `${c?.expiringDocuments} document(s) expiring`,
        detail: "Renew before they lapse to stay appointable",
        href: "/company/verification",
      });
    if ((c?.unreadNotifications ?? 0) > 0)
      attention.push({
        key: "notifications",
        icon: Bell,
        tone: "info",
        title: `${c?.unreadNotifications} unread notification(s)`,
        detail: "Shipment updates and appointments",
        href: "/notifications",
      });

    return (
      <div className="space-y-5">
        <DashboardHeader
          name={me.name}
          timeZone={me.timeZone}
          scopeNote={`Live · last ${window} days`}
          subtitle={
            <>
              <span className="font-medium text-foreground">{me.membership.companyName}</span>
              <span aria-hidden="true">·</span>
              <span>{COMPANY_TYPE_LABELS[me.membership.companyType]}</span>
            </>
          }
        >
          <DashboardRefresh />
          <Button asChild size="sm">
            <Link href="/shipments">
              <Truck className="size-3.5" /> Open shipments
            </Link>
          </Button>
        </DashboardHeader>

        <StatGrid>
          <StatTile
            label="Active appointments"
            value={fmtNumber(shipments.total)}
            icon={Truck}
            href="/shipments"
            delta={activity.deltas.appointments}
            caption={vsPrevious(window)}
            spark={sparkFor(activity, "appointments")}
          />
          <StatTile
            label="Deliveries completed"
            value={fmtNumber(activity.deltas.deliveries?.current ?? 0)}
            icon={Package}
            delta={activity.deltas.deliveries}
            caption={`last ${window} days`}
            spark={sparkFor(activity, "deliveries")}
          />
          <StatTile
            label="Expiring documents"
            value={fmtNumber(c?.expiringDocuments ?? 0)}
            icon={FileClock}
            href="/company/verification"
            caption="active documents expiring within 30 days"
            tone={(c?.expiringDocuments ?? 0) > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Unread notifications"
            value={fmtNumber(c?.unreadNotifications ?? 0)}
            icon={Bell}
            href="/notifications"
            caption="across shipments and appointments"
          />
        </StatGrid>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Appointment activity"
              description={`Appointments taken and deliveries completed, by week — the last ${activity.trend.length} weeks of real events.`}
            />
            <PanelBody>
              <TrendChart
                points={activity.trend}
                series={activity.series}
                emptyNote="No appointments in the last 12 weeks."
              />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Shipment stages"
              description="Where the shipments you are appointed to stand right now."
            />
            <PanelBody>
              <StageDonut
                slices={activity.pipeline}
                centerLabel="in progress"
                emptyNote="No shipments in progress."
              />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader title="Recent shipments" description="Newest appointments first." />
            <PanelBody className="px-0">
              <RecentShipments rows={shipments.items} />
            </PanelBody>
            {shipments.items.length > 0 && (
              <PanelFooter href="/shipments">Open the shipments workspace</PanelFooter>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Needs attention" description="Only live exceptions appear here." />
            <PanelBody>
              <AttentionList items={attention} />
            </PanelBody>
          </Panel>
        </div>

        <SectionHeading
          title="Performance"
          description="Computed from your shipment history — no sampling, no estimates."
        >
          <CustomizeDashboardButton
            widgets={dashboardPrefs.widgets}
            available={dashboardPrefs.available}
          />
        </SectionHeading>
        <KpiGrid kpis={kpis} widgets={dashboardPrefs.widgets} />
      </div>
    );
  }

  // ── Platform administrator: network health rather than one company's trade.
  if (summary.scope === "platform" && summary.platform) {
    const p = summary.platform;
    const queues: AttentionItem[] = [];
    if (p.pendingVerifications > 0)
      queues.push({
        key: "verification",
        icon: ShieldCheck,
        tone: "warning",
        title: `${p.pendingVerifications} verification(s) pending`,
        detail: "Companies waiting to trade",
        href: "/admin/verification",
      });
    if (p.pendingCredits > 0)
      queues.push({
        key: "credits",
        icon: Wallet,
        tone: "info",
        title: `${p.pendingCredits} credit request(s)`,
        detail: "Awaiting payment confirmation",
        href: "/admin/credits",
      });
    if (p.pendingDeletions > 0)
      queues.push({
        key: "deletions",
        icon: ShieldAlert,
        tone: "danger",
        title: `${p.pendingDeletions} deletion request(s)`,
        detail: "Data requests are time-bound — action them promptly",
        href: "/admin/data-requests",
      });

    const verifiedPct = p.totalCompanies
      ? Math.round((p.verifiedCompanies / p.totalCompanies) * 100)
      : 0;

    return (
      <div className="space-y-5">
        <DashboardHeader
          name={me.name}
          timeZone={me.timeZone}
          scopeNote={`Live · last ${window} days`}
          subtitle={
            <>
              <span className="font-medium text-foreground">PharmaChain platform</span>
              <span aria-hidden="true">·</span>
              <span>network-wide counts across every company</span>
            </>
          }
        >
          <DashboardRefresh />
          <Button asChild size="sm">
            <Link href="/admin/verification">
              <ShieldCheck className="size-3.5" /> Verification queue
            </Link>
          </Button>
        </DashboardHeader>

        <StatGrid>
          <StatTile
            label="Companies"
            value={fmtNumber(p.totalCompanies)}
            icon={Building2}
            href="/admin/companies"
            delta={activity.deltas.companies}
            caption={vsPrevious(window)}
            spark={sparkFor(activity, "companies")}
          />
          <StatTile
            label="Verified companies"
            value={fmtNumber(p.verifiedCompanies)}
            icon={ShieldCheck}
            href="/admin/companies"
            caption={`${verifiedPct}% of the network cleared to trade`}
          />
          <StatTile
            label="Orders"
            value={fmtNumber(p.ordersLast30d)}
            icon={ShoppingCart}
            delta={activity.deltas.orders}
            caption={vsPrevious(window)}
            spark={sparkFor(activity, "orders")}
          />
          <StatTile
            label="Open RFQs"
            value={fmtNumber(p.openRfqs)}
            icon={ListChecks}
            delta={activity.deltas.rfqs}
            caption={`${fmtNumber(p.totalUsers)} users across the network`}
            spark={sparkFor(activity, "rfqs")}
          />
        </StatGrid>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Network growth"
              description={`Companies joined, RFQs raised and orders placed, by week — the last ${activity.trend.length} weeks.`}
            />
            <PanelBody>
              <TrendChart points={activity.trend} series={activity.series} />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Order pipeline"
              description="Every open order on the platform, by stage."
            />
            <PanelBody>
              <StageDonut slices={activity.pipeline} centerLabel="open orders" />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Verification coverage"
              description="Companies cannot trade until verification clears, so this is the gate on network liquidity."
            />
            <PanelBody className="space-y-4">
              <Meter
                label="Verified"
                used={p.verifiedCompanies}
                limit={p.totalCompanies}
                caption={`${p.pendingVerifications} awaiting review · ${
                  p.totalCompanies - p.verifiedCompanies - p.pendingVerifications
                } rejected or expired`}
              />
              <Provenance>
                Counts are live at page load. Verification decisions are audited — see{" "}
                <Link href="/admin/audit" className="text-primary hover:underline">
                  audit logs
                </Link>
                .
              </Provenance>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Queues" description="Work waiting on a platform admin." />
            <PanelBody>
              <AttentionList items={queues} emptyNote="Every admin queue is clear." />
            </PanelBody>
          </Panel>
        </div>

        <SectionHeading title="Network performance" />
        <KpiGrid kpis={kpis} widgets={kpis.map((k) => k.key)} />

        <QuickActions
          actions={[
            {
              href: "/admin/companies",
              label: "Companies",
              hint: "Directory and profiles",
              icon: Building2,
            },
            {
              href: "/admin/finance",
              label: "Platform finance",
              hint: "Revenue and reconciliation",
              icon: Wallet,
            },
            {
              href: "/admin/disputes",
              label: "Disputes",
              hint: "Open and escalated",
              icon: ShieldAlert,
            },
            {
              href: "/admin/logins",
              label: "Login activity",
              hint: "Access across the network",
              icon: Users,
            },
          ]}
        />
      </div>
    );
  }

  // ── Trading company: buying, selling, or both.
  const c = summary.company;
  if (!c) return null;
  // A member without the orders permission still gets a dashboard — the panel
  // simply falls back to its empty state rather than failing the whole page.
  const orders = await api
    .get<Paginated<OrderRow>>("/orders", { query: { page: 1 } })
    .catch(() => null);
  const recentOrders = (orders?.items ?? []).slice(0, 6);

  // Role-aware home: a pure buyer never sees "Orders as supplier: 0", and a
  // pure supplier never sees empty buying tiles. New companies see both plus
  // the calls to action that start each side.
  const sells = c.publishedListings + c.draftListings + c.ordersAsSeller + c.activeQuotations > 0;
  const buys = c.openRfqs + c.ordersAsBuyer > 0;
  const fresh = !sells && !buys;

  const attention: AttentionItem[] = [];
  if (c.verificationStatus !== "VERIFIED")
    attention.push({
      key: "verification",
      icon: ShieldCheck,
      tone: "warning",
      title: VERIFICATION_STATUS_LABELS[c.verificationStatus],
      detail: "Marketplace actions unlock once verification clears",
      href: "/company/verification",
    });
  if (c.expiringDocuments > 0)
    attention.push({
      key: "docs",
      icon: FileClock,
      tone: "warning",
      title: `${c.expiringDocuments} document(s) expiring`,
      detail: "Expiring within 30 days — renew to stay verified",
      href: "/company/verification",
    });
  if (c.draftListings > 0)
    attention.push({
      key: "drafts",
      icon: FileText,
      tone: "info",
      title: `${c.draftListings} draft listing(s)`,
      detail: "Buyers cannot find a listing until it is published",
      href: "/catalogue",
    });
  if (c.unreadNotifications > 0)
    attention.push({
      key: "notifications",
      icon: Bell,
      tone: "info",
      title: `${c.unreadNotifications} unread notification(s)`,
      detail: "Quotes, orders and shipment updates",
      href: "/notifications",
    });

  return (
    <div className="space-y-5">
      <DashboardHeader
        name={me.name}
        timeZone={me.timeZone}
        scopeNote={`Live · last ${window} days`}
        subtitle={
          <>
            <span className="font-medium text-foreground">
              {me.membership?.companyName ?? "Your company"}
            </span>
            {me.membership && (
              <>
                <span aria-hidden="true">·</span>
                <span>{COMPANY_TYPE_LABELS[me.membership.companyType]}</span>
              </>
            )}
          </>
        }
      >
        <DashboardRefresh />
        <Button asChild size="sm">
          <Link href="/rfqs/new">
            <Send className="size-3.5" /> Raise an RFQ
          </Link>
        </Button>
      </DashboardHeader>

      <StatGrid>
        {(buys || fresh) && (
          <StatTile
            label="Open RFQs"
            value={fmtNumber(c.openRfqs)}
            icon={ListChecks}
            href="/rfqs"
            delta={activity.deltas.rfqs}
            caption={`${fmtNumber(activity.deltas.rfqs?.current ?? 0)} raised in ${window} days`}
            spark={sparkFor(activity, "rfqs")}
          />
        )}
        {(sells || fresh) && (
          <StatTile
            label="Active quotations"
            value={fmtNumber(c.activeQuotations)}
            icon={Inbox}
            href="/quotes"
            delta={activity.deltas.quotations}
            caption={`${fmtNumber(activity.deltas.quotations?.current ?? 0)} sent in ${window} days`}
            spark={sparkFor(activity, "quotations")}
          />
        )}
        <StatTile
          label="Live orders"
          value={fmtNumber(c.ordersAsBuyer + c.ordersAsSeller)}
          icon={ShoppingCart}
          href="/orders"
          delta={activity.deltas.orders}
          caption={`${fmtNumber(c.ordersAsBuyer)} buying · ${fmtNumber(c.ordersAsSeller)} supplying`}
          spark={sparkFor(activity, "orders")}
        />
        {(sells || fresh) && (
          <StatTile
            label="Published listings"
            value={fmtNumber(c.publishedListings)}
            icon={Package}
            href="/catalogue"
            caption={
              c.draftListings > 0
                ? `${fmtNumber(c.draftListings)} still in draft`
                : "all listings published"
            }
          />
        )}
        <StatTile
          label="Compliance"
          value={c.expiringDocuments === 0 ? "OK" : fmtNumber(c.expiringDocuments)}
          icon={ShieldCheck}
          href="/company/verification"
          caption={
            c.expiringDocuments === 0
              ? "no documents expiring in 30 days"
              : "document(s) expiring within 30 days"
          }
          tone={c.expiringDocuments > 0 ? "warning" : "default"}
        />
      </StatGrid>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Trading activity"
            description={`RFQs raised, quotations sent and orders placed, by week — the last ${activity.trend.length} weeks of real events.`}
          />
          <PanelBody>
            <TrendChart
              points={activity.trend}
              series={activity.series}
              emptyNote="No trading activity in the last 12 weeks."
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Order pipeline"
            description="Your open orders by the stage they have reached."
          />
          <PanelBody>
            <StageDonut
              slices={activity.pipeline}
              centerLabel="open orders"
              emptyNote="No open orders — every order you have is delivered and confirmed."
            />
          </PanelBody>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Recent orders"
            description="Newest first, across both sides of your trading."
          />
          <PanelBody className="px-0">
            <RecentOrders orders={recentOrders} companyId={me.membership?.companyId} />
          </PanelBody>
          {recentOrders.length > 0 && <PanelFooter href="/orders">See all orders</PanelFooter>}
        </Panel>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel className="flex-1">
            <PanelHeader title="Needs attention" description="Only live exceptions appear here." />
            <PanelBody>
              <AttentionList items={attention} />
            </PanelBody>
          </Panel>

          {c.usage.rfq.limited && (
            <Panel>
              <PanelHeader
                title="Monthly allowance"
                description="Your freemium tier resets at the start of each month."
              />
              <PanelBody className="space-y-3.5">
                <Meter label="RFQs" used={c.usage.rfq.used} limit={c.usage.rfq.limit} />
                <Meter
                  label="Quotations"
                  used={c.usage.quotation.used}
                  limit={c.usage.quotation.limit}
                />
                <Link
                  href="/company/usage"
                  className="touch-target min-h-8 text-xs font-medium text-primary hover:underline"
                >
                  Request credits or upgrade →
                </Link>
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>

      <SectionHeading
        title="Performance"
        description="Computed from your own order, quotation and shipment history."
      >
        <CustomizeDashboardButton
          widgets={dashboardPrefs.widgets}
          available={dashboardPrefs.available}
        />
      </SectionHeading>
      <KpiGrid kpis={kpis} widgets={dashboardPrefs.widgets} />

      <QuickActions
        actions={[
          {
            href: "/marketplace",
            label: "Browse the marketplace",
            hint: "Find verified suppliers",
            icon: Search,
          },
          {
            href: "/catalogue",
            label: "My catalogue",
            hint: "Listings and specifications",
            icon: Layers,
          },
          {
            href: "/documents",
            label: "Documents",
            hint: "Certificates and shipment papers",
            icon: FileText,
          },
          { href: "/finance", label: "Finance", hint: "Invoices, payments, ledger", icon: Wallet },
        ]}
      />
    </div>
  );
}
