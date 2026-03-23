"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Shield, LogIn, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { login, register } from "@/lib/auth"
import type { UserRole } from "@/lib/types"

const ALLERGIES = ["Penicillin", "NSAID", "Sulfa", "Latex", "Codeine"]

const DEMO_ACCOUNTS = [
  { email: "doctor@demo.com", password: "password", role: "Doctor" },
  { email: "clinic@demo.com", password: "password", role: "Clinic Staff" },
  { email: "pharmacy@demo.com", password: "password", role: "Pharmacy Staff" },
  { email: "patient@demo.com", password: "password", role: "Patient" },
]

const roleMap: Record<string, string> = {
  doctor: "/dashboard/doctor",
  clinic_staff: "/dashboard/clinic",
  pharmacy_staff: "/dashboard/pharmacy",
  patient: "/dashboard/patient",
}

export function AuthForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Login state
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Register state
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regRole, setRegRole] = useState<UserRole>("patient")
  const [regAllergies, setRegAllergies] = useState<string[]>([])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await login(loginEmail, loginPassword)

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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await register(
        regName,
        regEmail,
        regPassword,
        regRole,
        regAllergies
      )

      if (result.error) {
        toast.error(result.error)
      } else if (result.user) {
        toast.success(`Account created. Welcome, ${result.user.name}!`)
        router.push(roleMap[result.user.role] || "/")
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDemoLogin(email: string, password: string) {
    setLoading(true)

    try {
      const result = await login(email, password)

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

  function toggleAllergy(allergy: string) {
    setRegAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy]
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Healthcare Dispensary System
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Secure prescription management with AI-assisted risk assessment
            </p>
          </div>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">
              <LogIn className="mr-1.5 h-4 w-4" />
              Sign In
            </TabsTrigger>
            <TabsTrigger value="register">
              <UserPlus className="mr-1.5 h-4 w-4" />
              Register
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Sign In</CardTitle>
                <CardDescription>Enter your credentials to access the system</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>

                <div className="mt-6">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Quick Demo Access</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <Button
                        key={acc.email}
                        type="button"
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
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Register for a new account</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Full Name</Label>
                    <Input
                      id="reg-name"
                      placeholder="Dr. Jane Smith"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="jane@hospital.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="Choose a secure password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={regRole}
                      onValueChange={(v) => setRegRole(v as UserRole)}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="patient">Patient</SelectItem>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="clinic_staff">Clinic Staff</SelectItem>
                        <SelectItem value="pharmacy_staff">Pharmacy Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {regRole === "patient" && (
                    <div className="space-y-2">
                      <Label>Known Allergies</Label>
                      <div className="flex flex-wrap gap-2">
                        {ALLERGIES.map((allergy) => (
                          <div key={allergy} className="flex items-center gap-1.5">
                            <Checkbox
                              id={`allergy-${allergy}`}
                              checked={regAllergies.includes(allergy)}
                              onCheckedChange={() => toggleAllergy(allergy)}
                              disabled={loading}
                            />
                            <label htmlFor={`allergy-${allergy}`} className="text-sm">
                              {allergy}
                            </label>
                          </div>
                        ))}
                      </div>
                      {regAllergies.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {regAllergies.map((a) => (
                            <Badge key={a} variant="secondary" className="text-xs">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}