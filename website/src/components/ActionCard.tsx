import type { ReactNode } from "react";
import Link from "next/link";

interface ActionCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: ReactNode;
  readonly href?: string;
  readonly tone?: "primary" | "accent";
  readonly className?: string;
  readonly children?: ReactNode;
}

const TONE_CLASSES = {
  primary: "border-primary/30 hover:border-primary/55",
  accent: "border-accent/30 hover:border-accent/55",
} as const;

const ICON_TONE_CLASSES = {
  primary: "bg-primary/20 text-primary",
  accent: "bg-accent/20 text-accent",
} as const;

export function ActionCard(props: ActionCardProps) {
  const tone = props.tone ?? "primary";
  const cardClass = [
    "card border bg-base-300 shadow-lg transition-colors block",
    TONE_CLASSES[tone],
    props.className ?? "",
  ].join(" ");

  const body = (
    <div className="card-body gap-4 p-5">
      <p className="font-semibold text-lg leading-tight flex items-center gap-3">
        <span className={`shrink-0 rounded-lg p-2 ${ICON_TONE_CLASSES[tone]}`}>
          {props.icon}
        </span>
        {props.title}
      </p>
      <div className="text-sm sm:text-base opacity-90 leading-relaxed">{props.description}</div>
      {props.children}
    </div>
  );

  if (props.href) {
    const external = props.href.startsWith("http");
    if (external) {
      return (
        <a href={props.href} className={cardClass} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      );
    }
    return (
      <Link href={props.href} className={cardClass}>
        {body}
      </Link>
    );
  }

  return <div className={cardClass}>{body}</div>;
}
