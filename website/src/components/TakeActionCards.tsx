import { Download, Shield } from "lucide-react";
import { ActionCard } from "@/components/ActionCard";

interface TakeActionCardsProps {
  readonly title?: string;
  readonly company?: string;
}

function buildGdprGeneratorHref(company?: string) {
  if (!company) {
    return "/resources/gdpr-generator";
  }
  const params = new URLSearchParams({ company });
  return `/resources/gdpr-generator?${params.toString()}`;
}

export function TakeActionCards({ title = "Take Action", company }: TakeActionCardsProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ActionCard
          href={buildGdprGeneratorHref(company)}
          icon={<Shield className="h-5 w-5" />}
          title="Generate a GDPR request"
          description="Build a ready-to-send access or deletion request."
        />
        <ActionCard
          href="/#download"
          icon={<Download className="h-5 w-5" />}
          title="Download Paperweight"
          description="Scan your inbox to find other accounts linked to exposed data."
        />
      </div>
    </section>
  );
}
