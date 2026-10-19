import type { ReactNode } from "react";
import Link from "next/link";

interface PromoBannerProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly href?: string;
  readonly actionLabel?: string;
  readonly actionClassName?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function PromoBanner(props: PromoBannerProps) {
  const actionClass = props.actionClassName ?? "btn btn-primary md:shrink-0";
  const action = props.href && props.actionLabel ? (
    props.href.startsWith("http") ? (
      <a
        href={props.href}
        className={actionClass}
        target="_blank"
        rel="noopener noreferrer"
      >
        {props.actionLabel}
      </a>
    ) : (
      <Link href={props.href} className={actionClass}>
        {props.actionLabel}
      </Link>
    )
  ) : null;

  return (
    <div className={`card border border-primary/30 bg-base-300 shadow-lg ${props.className ?? ""}`}>
      <div className="card-body gap-5 sm:gap-6">
        <div className="flex flex-col gap-5 sm:gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 shrink-0 rounded-lg bg-primary/20 p-2 text-primary">
              {props.icon}
            </span>
            <div className="space-y-1.5 min-w-0">
              <h2 className="text-xl font-semibold leading-tight">{props.title}</h2>
              <p className="max-w-2xl text-sm opacity-90 sm:text-base">{props.description}</p>
              {props.children}
            </div>
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}
