import { getDashboardStats } from "@/lib/dashboard-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const tiles = [
    { title: "Clients", value: stats.total_clients },
    { title: "Workers", value: stats.total_workers },
    { title: "Active jobs today", value: stats.active_jobs_today },
    {
      title: "Total revenue (paid)",
      value: currency.format(stats.total_revenue),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of your workforce and bookings.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {tile.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-3xl font-semibold tabular-nums">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
