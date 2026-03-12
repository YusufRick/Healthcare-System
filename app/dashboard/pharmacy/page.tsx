import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { PharmacyDashboard } from "@/components/dashboards/pharmacy/pharmacy-dashboard"
import { AuditEmailLogs } from "@/components/audit/audit-email-logs"

export default async function PharmacyPage() {
  const session = await getSession()
  if (!session) redirect("/")
  if (session.role !== "pharmacy_staff") redirect("/")

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={session.name} userRole={session.role} />
      <main>
        <PharmacyDashboard />
        <AuditEmailLogs />
      </main>
    </div>
  )
}
