import { BRON_LABELS, statusInfo } from "@/lib/bezichtigingen";

export function StatusBadge({ status }: { status: string }) {
  const s = statusInfo(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ${s.kleur}`}>
      {s.label}
    </span>
  );
}

const LABEL_KLEUR: Record<string, string> = {
  A: "#059669",
  B: "#4CAF50",
  C: "#A3C93A",
  D: "#F2C511",
  E: "#F39C12",
  F: "#E8601C",
  G: "#D32F2F",
};

export function EnergieLabel({ label }: { label: string }) {
  const kleur = LABEL_KLEUR[label.trim().charAt(0).toUpperCase()] ?? "#6B7280";
  return (
    <span
      className="inline-flex items-center justify-center min-w-7 h-6 px-1.5 rounded text-[12px] font-extrabold text-white shadow-sm"
      style={{ background: kleur }}
      title={`Energielabel ${label}`}
    >
      {label}
    </span>
  );
}

export function BronTag({ bron }: { bron?: string }) {
  if (!bron) return null;
  return (
    <span className="shrink-0 inline-block rounded bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground align-middle">
      {BRON_LABELS[bron] ?? bron}
    </span>
  );
}
