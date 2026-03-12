import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { DoctorDashboard } from "@/components/dashboards/doctor/doctor-dashboard"
import { AuditEmailLogs } from "@/components/audit/audit-email-logs"

export default async function DoctorPage() {
  const session = await getSession()
  if (!session) redirect("/")
  if (session.role !== "doctor") redirect("/")

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={session.name} userRole={session.role} />
      <main>
        <DoctorDashboard />
        <AuditEmailLogs />
      </main>
    </div>
  )
}
