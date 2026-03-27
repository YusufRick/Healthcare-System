"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardHeader } from "@/components/layout/dashboard-header"
import { DoctorDashboard } from "@/components/dashboards/doctor/doctor-dashboard"
import { AuditEmailLogs } from "@/components/audit/audit-email-logs"
import { onAuthStateChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/src/config/firebase"

type DoctorSession = {
  id: string
  name: string
  role: string
}

export default function DoctorPage() {
  const router = useRouter()
  const [session, setSession] = useState<DoctorSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/")
        return
      }

      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid))

        if (!snap.exists()) {
          router.replace("/")
          return
        }

        const user = snap.data()

        if (user.role !== "doctor") {
          router.replace("/")
          return
        }

        setSession({
          id: firebaseUser.uid,
          name: user.name,
          role: user.role,
        })
      } catch {
        router.replace("/")
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [router])

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-background">
        <main className="p-6">Loading...</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader userName={session.name} userRole={session.role} />
      <main>
        <DoctorDashboard 
          doctor={{
            id: session.id,
            name: session.name,
          }}
        />
        <AuditEmailLogs />
      </main>
    </div>
  )
}