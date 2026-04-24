"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Shield, UserPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { register } from "@/lib/auth"
import type { UserRole } from "@/lib/types"

const ALLERGIES = ["Penicillin", "NSAID", "Sulfa", "Latex", "Codeine"]

const roleMap: Record<string, string> = {
  doctor: "/dashboard/doctor",
  clinic_staff: "/dashboard/clinic",
  pharmacy_staff: "/dashboard/pharmacy",
  patient: "/dashboard/patient",
}

export function SignupForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [role, setRole] = useState<UserRole>("patient")
  const [allergies, setAllergies] = useState<string[]>([])

  function toggleAllergy(allergy: string) {
    setAllergies((prev) =>
      prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy]
    )
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    try {
      const result = await register(name, email, password, role, allergies)

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">SMART Healthcare System</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your account to get started
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Create Account
            </CardTitle>
            <CardDescription>Register for a new account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@hospital.com"
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
                  placeholder="Choose a secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)} disabled={loading}>
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

              {role === "patient" && (
                <div className="space-y-2">
                  <Label>Known Allergies</Label>
                  <div className="flex flex-wrap gap-2">
                    {ALLERGIES.map((allergy) => (
                      <div key={allergy} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`allergy-${allergy}`}
                          checked={allergies.includes(allergy)}
                          onCheckedChange={() => toggleAllergy(allergy)}
                          disabled={loading}
                        />
                        <label htmlFor={`allergy-${allergy}`} className="text-sm">
                          {allergy}
                        </label>
                      </div>
                    ))}
                  </div>
                  {allergies.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {allergies.map((a) => (
                        <Badge key={a} variant="secondary" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}