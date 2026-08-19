import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { ExchangeRateRow, SystemParameterRow } from "@/lib/api/types";
import { ExchangeRatesPanel, ParametersPanel } from "./parameters-panel";

export const metadata = { title: "Parameters & FX" };

export default async function AdminParametersPage() {
  const api = await apiServer();
  const [parameters, rates] = await Promise.all([
    api.get<SystemParameterRow[]>("/admin/parameters"),
    api.get<ExchangeRateRow[]>("/admin/exchange-rates"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Parameters & exchange rates"
        description="Values are validated by type and take effect within a minute; old and new values are audited."
      />
      <ParametersPanel parameters={parameters} />
      <ExchangeRatesPanel rates={rates} />
    </div>
  );
}
