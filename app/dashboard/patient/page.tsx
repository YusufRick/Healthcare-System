import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { PatientDashboard } from "@/components/dashboards/patient/patient-dashboard"
import { AuditEmailLogs } from "@/components/audit/audit-email-logs"

export default async function PatientPage() {
  const session = await getSession()
  if (!session) redirect("/")
  if (session.role !== "patient") redirect("/")

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={session.name} userRole={session.role} />
      <main>
        <PatientDashboard />
        <AuditEmailLogs />
      </main>
    </div>
  )
}
