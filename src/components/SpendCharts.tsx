import { BUCKETS, type MonthSpend, type SpendBucket } from "../lib/plan";
import { formatMoney } from "../lib/money";

export function SpendCharts({
  months,
  totals,
}: {
  months: MonthSpend[];
  totals: Record<SpendBucket, number>;
}) {
  const pieTotal = BUCKETS.reduce((sum, bucket) => sum + totals[bucket.id], 0);
  const maxMonth = Math.max(...months.map((month) => month.total), 1);

  return (
    <div className="chart-grid">
      <section className="panel" aria-label="Spending over time">
        <h2>Spending</h2>
        {months.length === 0 ? (
          <p className="help">Bars show up after a receipt has a date.</p>
        ) : (
          <>
            <div className="spend-chart" role="img" aria-label={months.map((month) => `${month.label} ${formatMoney(month.total)}`).join(", ")}>
              {months.map((month) => (
                <div className="spend-col" key={month.key}>
                  <div className="spend-stack" style={{ height: `${Math.max(8, (month.total / maxMonth) * 100)}%` }}>
                    {BUCKETS.map((bucket) =>
                      month[bucket.id] > 0 ? (
                        <span key={bucket.id} style={{ flexGrow: month[bucket.id], background: bucket.color }} />
                      ) : null,
                    )}
                  </div>
                  <small>{month.label}</small>
                </div>
              ))}
            </div>
            <Legend />
          </>
        )}
      </section>
      <section className="panel" aria-label="Spending by category">
        <h2>Where it went</h2>
        {pieTotal <= 0 ? (
          <p className="help">The pie fills in once receipts have prices.</p>
        ) : (
          <div className="pie-layout">
            <Pie totals={totals} total={pieTotal} />
            <ul className="pie-legend">
              {BUCKETS.filter((bucket) => totals[bucket.id] > 0).map((bucket) => (
                <li key={bucket.id}>
                  <i style={{ background: bucket.color }} />
                  <span>{bucket.label}</span>
                  <strong>{formatMoney(totals[bucket.id])}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Legend() {
  return (
    <ul className="legend-row">
      {BUCKETS.map((bucket) => (
        <li key={bucket.id}>
          <i style={{ background: bucket.color }} />
          {bucket.label}
        </li>
      ))}
    </ul>
  );
}

function Pie({ totals, total }: { totals: Record<SpendBucket, number>; total: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const slices = BUCKETS.filter((bucket) => totals[bucket.id] > 0);
  return (
    <svg className="pie" viewBox="0 0 120 120" role="img" aria-label={slices.map((bucket) => `${bucket.label} ${formatMoney(totals[bucket.id])}`).join(", ")}>
      <g transform="rotate(-90 60 60)">
        {slices.map((bucket) => {
          const length = (totals[bucket.id] / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const circle = (
            <circle
              key={bucket.id}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={bucket.color}
              strokeWidth="22"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </g>
    </svg>
  );
}
