import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  const valueColor =
    tone === "bad" ? "text-destructive" : tone === "good" ? "text-foreground" : "text-foreground";
  return (
    <Card className="rounded-md">
      <CardHeader className="p-4 pb-1">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={`text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
        {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
