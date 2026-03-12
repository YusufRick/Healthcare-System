import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"

const roleMap: Record<string, string> = {
  doctor: "/dashboard/doctor",
  clinic_staff: "/dashboard/clinic",
  pharmacy_staff: "/dashboard/pharmacy",
  patient: "/dashboard/patient",
}

export default async function Page() {
  const session = await getSession()
  
  // If logged in, redirect to appropriate dashboard
  if (session) {
    redirect(roleMap[session.role] || "/auth/login")
  }
  
  // Otherwise, redirect to login
  redirect("/auth/login")
}
