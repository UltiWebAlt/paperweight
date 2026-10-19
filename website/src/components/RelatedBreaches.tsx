import Link from "next/link";
import { type BreachIndexItem, formatCount } from "@/utils/breach";

interface RelatedBreachesProps {
  readonly breaches: BreachIndexItem[];
}

export function RelatedBreaches({ breaches }: RelatedBreachesProps) {
  if (breaches.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Related Breaches</h2>
      <div className="card bg-base-200/50">
        <div className="card-body p-2 gap-1">
          {breaches.map((breach) => (
            <Link
              key={breach.slug}
              href={`/breaches/${breach.slug}`}
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-base-200"
            >
              {breach.logoPath ? (
                <img
                  src={breach.logoPath}
                  alt={`${breach.title} logo`}
                  className="h-9 w-9 shrink-0 rounded-md bg-base-100 object-contain p-1"
                  loading="lazy"
                />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-md bg-base-100" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{breach.title}</span>
                  {breach.categoryLabel ? (
                    <span className="badge badge-xs badge-ghost">
                      {breach.categoryLabel}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs opacity-60">
                  {breach.breachDate.slice(0, 7)}
                  {breach.pwnCount > 0
                    ? ` · ${formatCount(breach.pwnCount)} records`
                    : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
