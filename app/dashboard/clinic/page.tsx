import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { ClinicDashboard } from "@/components/dashboards/clinic/clinic-dashboard"
import { AuditEmailLogs } from "@/components/audit/audit-email-logs"

export default async function ClinicPage() {
  const session = await getSession()
  if (!session) redirect("/")
  if (session.role !== "clinic_staff") redirect("/")

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={session.name} userRole={session.role} />
      <main>
        <ClinicDashboard />
        <AuditEmailLogs />
      </main>
    </div>
  )
}
