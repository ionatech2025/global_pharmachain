import { ChartTable, Sparkline } from "@/components/dashboard/charts";
import { Provenance } from "@/components/dashboard/panel";
import { TrendPill } from "@/components/dashboard/stat-tile";
import { fmtMoney, fmtNumber } from "@/lib/format";

interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryPriceTrend {
  category: CategoryRef;
  /** One entry per month; null where the category had no quotation in its unit and currency. */
  series: (number | null)[];
  currency: string | null;
  /** The unit the prices are per ("kg"), or null when RFQs gave none. */
  unit: string | null;
  sampleSize: number;
  /** Quotations in the category left out for another unit or currency. */
  otherQuotes: number;
  first: number | null;
  latest: number | null;
}

/** GET /intelligence/prices */
export interface PriceTrends {
  months: string[];
  /** Only categories priced in at least two months, most-quoted first. */
  categories: CategoryPriceTrend[];
  coverage: {
    quotations: number;
    categorised: number;
    byCategory: Array<{ category: CategoryRef; quotations: number }>;
  };
}

const price = (value: number, currency: string | null) =>
  currency ? fmtMoney(value, currency) : fmtNumber(value);

/**
 * Quoted prices per category, never across them: each row is one category in
 * its most-quoted unit and currency, so its average is a price of something.
 * A row is a sparkline (shape), the latest month's average and the change
 * since the first priced month — neutral in colour, because a rise is bad
 * news for a buyer and good news for a supplier. The months behind every row
 * are in the table view.
 */
export function CategoryPrices({ data, labels }: { data: PriceTrends; labels: string[] }) {
  const { categories, coverage } = data;
  const named = coverage.byCategory
    .map((c) => `${c.category.name} (${fmtNumber(c.quotations)})`)
    .join(", ");
  const coverageLine = `${fmtNumber(coverage.categorised)} of ${fmtNumber(coverage.quotations)} quotation(s) in the last 12 months are on RFQs that name a category${named ? ` — ${named}` : ""}. Quotations on RFQs raised for any category mix products and units, so they are not priced here.`;

  if (categories.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          No category has a price trend yet — a trend needs quotations in at least two months, in
          one unit and currency.
        </p>
        <Provenance>
          {coverageLine} Choosing a material category when raising an RFQ is what puts its quotes
          here.
        </Provenance>
      </div>
    );
  }

  const monthOf = (row: CategoryPriceTrend, which: "first" | "last") => {
    const i =
      which === "first"
        ? row.series.findIndex((v) => v !== null)
        : row.series.findLastIndex((v) => v !== null);
    return labels[i] ?? "";
  };

  return (
    <div>
      {/* A container query, not a viewport one: the panel is half the page on
          a desktop and all of it on a tablet. Below 28rem the sparkline goes
          and the figures stay — the change badge still carries direction. */}
      <ul className="@container divide-y divide-border/60">
        {categories.map((row) => (
          <li key={row.category.id} className="flex items-center gap-4 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{row.category.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {fmtNumber(row.sampleSize)} quote(s) · {monthOf(row, "first")} –{" "}
                {monthOf(row, "last")}
                {row.otherQuotes > 0 &&
                  ` · ${fmtNumber(row.otherQuotes)} in another unit or currency left out`}
              </p>
            </div>
            <Sparkline
              points={row.series}
              fit
              width={112}
              height={30}
              className="hidden @md:block"
            />
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <p className="text-sm font-semibold whitespace-nowrap">
                {row.latest === null ? "—" : price(row.latest, row.currency)}
                {row.unit && (
                  <span className="font-normal text-muted-foreground"> / {row.unit}</span>
                )}
              </p>
              {row.first !== null && row.latest !== null && (
                <TrendPill
                  delta={{ current: row.latest, previous: row.first }}
                  goodDirection="neutral"
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      <ChartTable caption="Average quoted unit price by category and month">
        <thead>
          <tr className="border-b border-border/60">
            <th scope="col" className="py-1.5 pr-4 text-left font-medium text-muted-foreground">
              Category
            </th>
            <th scope="col" className="py-1.5 pr-4 text-left font-medium text-muted-foreground">
              Month
            </th>
            <th scope="col" className="py-1.5 pl-4 text-right font-medium text-muted-foreground">
              Average unit price
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.flatMap((row) =>
            row.series.flatMap((value, i) =>
              value === null
                ? []
                : [
                    <tr
                      key={`${row.category.id}-${data.months[i]}`}
                      className="border-b border-border/60 last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-1.5 pr-4 text-left font-normal text-muted-foreground"
                      >
                        {row.category.name}
                      </th>
                      <td className="py-1.5 pr-4 text-muted-foreground">{labels[i]}</td>
                      <td className="num-col py-1.5 pl-4 text-right">
                        {price(value, row.currency)}
                        {row.unit ? ` / ${row.unit}` : ""}
                      </td>
                    </tr>,
                  ],
            ),
          )}
        </tbody>
      </ChartTable>

      <Provenance>
        Each category in its most-quoted unit and currency; other units and currencies are left out,
        never converted. Months without a quotation are gaps. {coverageLine}
      </Provenance>
    </div>
  );
}
