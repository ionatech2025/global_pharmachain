import { Card, CardContent } from "@pharmachain/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { TaxRuleRow } from "@/lib/api/types";
import { ActiveBadge, NewTaxRuleButton, ToggleRuleButton } from "./tax-rule-panel";

export const metadata = { title: "Tax & duty rules" };

/** Admin-maintainable duty/VAT rule set (Phase 3 §2): HS prefix + lane. */
export default async function TaxRulesPage() {
  const api = await apiServer();
  const rules = await api.get<TaxRuleRow[]>("/admin/tax-rules");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform admin"
        title="Tax & duty rules"
        description="Duties and VAT applied to invoices automatically, by HS-code prefix, origin and destination. Longest matching prefix wins."
      >
        <NewTaxRuleButton />
      </PageHeader>
      {rules.length === 0 ? (
        <EmptyState
          title="No tax rules yet"
          hint="Invoices issue with zero duty/VAT until a rule matches their HS code and lane."
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HS prefix</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Duty %</TableHead>
                  <TableHead className="text-right">VAT %</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium tabular-nums">{rule.hsPrefix}</TableCell>
                    <TableCell className="text-sm">{rule.originCountry ?? "Any"}</TableCell>
                    <TableCell className="text-sm">{rule.destCountry}</TableCell>
                    <TableCell className="text-right tabular-nums">{rule.dutyRatePct}</TableCell>
                    <TableCell className="text-right tabular-nums">{rule.vatRatePct}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                      {rule.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ActiveBadge active={rule.active} />
                    </TableCell>
                    <TableCell>
                      <ToggleRuleButton rule={rule} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
