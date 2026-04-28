"use client"

import { useRouter } from "next/navigation"
import { LogOut, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { logout } from "@/lib/auth"

const roleLabels: Record<string, string> = {
  doctor: "Doctor",
  clinic_staff: "Clinic Staff",
  pharmacy_staff: "Pharmacy Staff",
  patient: "Patient",
}

const roleColors: Record<string, string> = {
  doctor: "bg-[hsl(200,80%,50%)] text-[hsl(0,0%,100%)]",
  clinic_staff: "bg-[hsl(173,58%,30%)] text-[hsl(0,0%,100%)]",
  pharmacy_staff: "bg-[hsl(37,90%,51%)] text-[hsl(37,90%,12%)]",
  patient: "bg-[hsl(152,60%,40%)] text-[hsl(0,0%,100%)]",
}

interface DashboardHeaderProps {
  userName: string
  userRole: string
}

export function DashboardHeader({ userName, userRole }: DashboardHeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await logout()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-card-foreground">SHS</h1>
            <p className="text-xs text-muted-foreground">SMART Healthcare System</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-card-foreground">{userName}</span>
            <Badge className={`${roleColors[userRole] || ""} text-xs`}>{roleLabels[userRole] || userRole}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  )
}
