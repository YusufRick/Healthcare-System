"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Shield, LogIn, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { login } from "@/lib/auth"

const roleMap: Record<string, string> = {
  doctor: "/dashboard/doctor",
  clinic_staff: "/dashboard/clinic",
  pharmacy_staff: "/dashboard/pharmacy",
  patient: "/dashboard/patient",
}

const DEMO_ACCOUNTS = [
  { email: "doctor@demo.com", password: "password123", role: "Doctor" },
  { email: "clinic@demo.com", password: "password123", role: "Clinic Staff" },
  { email: "pharmacy@demo.com", password: "password123", role: "Pharmacy Staff" },
  { email: "patient@demo.com", password: "password123", role: "Patient" },
]

export function LoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.error) {
        toast.error(result.error)
      } else if (result.user) {
        toast.success(`Welcome back, ${result.user.name}`)
        router.push(roleMap[result.user.role] || "/")
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDemoLogin(demoEmail: string, demoPassword: string) {
    setLoading(true)
    try {
      const result = await login(demoEmail, demoPassword)
      if (result.error) {
        toast.error(result.error)
      } else if (result.user) {
        toast.success(`Welcome, ${result.user.name}`)
        router.push(roleMap[result.user.role] || "/")
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Healthcare Dispensary System</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Secure prescription management with AI-assisted risk assessment
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Sign In
            </CardTitle>
            <CardDescription>Enter your credentials to access the system</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6">
              <p className="mb-3 text-xs font-medium text-muted-foreground">Quick Demo Access</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <Button
                    key={acc.email}
                    variant="outline"
                    size="sm"
                    className="text-xs bg-transparent"
                    disabled={loading}
                    onClick={() => handleDemoLogin(acc.email, acc.password)}
                  >
                    {acc.role}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              {"Don't have an account? "}
              <Link href="/auth/signup" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
