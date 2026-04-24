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
import { signInWithEmailAndPassword } from "firebase/auth"
import { doc, getDoc, query, collection, where, getDocs } from "firebase/firestore"
import { auth, db } from "@/src/config/firebase"

const roleMap: Record<string, string> = {
  doctor: "/dashboard/doctor",
  clinic_staff: "/dashboard/clinic",
  pharmacy_staff: "/dashboard/pharmacy",
  patient: "/dashboard/patient",
}

type AppUser = {
  uid?: string
  name: string
  email: string
  role: "doctor" | "clinic_staff" | "pharmacy_staff" | "patient"
  status?: "active" | "disabled"
  allergies?: string[]
}

const firebaseSignIn = async ({ email, password }: { email: string; password: string }) => {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result
}

export function LoginForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function getUserProfile(uid: string, email: string): Promise<AppUser | null> {
    const userRef = doc(db, "users", uid)
    const userSnap = await getDoc(userRef)

    if (userSnap.exists()) {
      return userSnap.data() as AppUser
    }

    const q = query(collection(db, "users"), where("email", "==", email))
    const snap = await getDocs(q)

    if (!snap.empty) {
      return snap.docs[0].data() as AppUser
    }

    return null
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await firebaseSignIn({ email, password })
      const firebaseUser = result.user

      const userProfile = await getUserProfile(firebaseUser.uid, firebaseUser.email || email)

      if (!userProfile) {
        toast.error("User profile not found")
        return
      }

      if (userProfile.status === "disabled") {
        toast.error("This account has been disabled")
        return
      }

      toast.success(`Welcome back, ${userProfile.name}`)
      console.log("ROLE:", userProfile.role)
      console.log("REDIRECT TO:", roleMap[userProfile.role] || "/")
      router.replace(roleMap[userProfile.role] || "/")
      
    } catch (error: any) {
      switch (error.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          toast.error("Invalid email or password")
          break
        case "auth/invalid-email":
          toast.error("Invalid email address")
          break
        case "auth/too-many-requests":
          toast.error("Too many failed attempts. Please try again later.")
          break
        default:
          toast.error("Login failed. Please try again.")
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
              Connecting doctors, clinics, pharmacies, and patients for better healthcare management
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