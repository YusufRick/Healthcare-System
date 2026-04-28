import { db, auth } from "../src/config/firebase"
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth"
import type { UserRole, User } from "./types"

async function getUserById(id: string): Promise<User | null> {
  const ref = doc(db, "users", id)
  const snap = await getDoc(ref)

  if (!snap.exists()) return null

  return {
    id: snap.id,
    ...(snap.data() as Omit<User, "id">),
  }
}

async function createUser(data: {
  id: string
  name: string
  email: string
  role: UserRole
  allergies?: string[]
}) {
  const payload = {
    name: data.name,
    email: data.email,
    role: data.role,
    allergies: data.role === "patient" ? (data.allergies ?? []) : [],
    status: "active" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await setDoc(doc(db, "users", data.id), payload)

  return {
    id: data.id,
    ...payload,
  }
}

export async function login(email: string, password: string) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const firebaseUser = credential.user

    const user = await getUserById(firebaseUser.uid)

    if (!user) {
      return { error: "User profile not found" }
    }

    if ((user as any).status === "disabled") {
      return { error: "This account has been disabled" }
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }
  } catch (error: any) {
    console.error("LOGIN ERROR:", error?.code, error?.message)

    switch (error?.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return { error: "Invalid email or password" }
      case "auth/invalid-email":
        return { error: "Invalid email address" }
      case "auth/too-many-requests":
        return { error: "Too many failed attempts. Please try again later." }
      default:
        return { error: "Login failed. Please try again." }
    }
  }
}

export async function register(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  allergies: string[] = []
) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    const firebaseUser = credential.user

    try {
      const user = await createUser({
        id: firebaseUser.uid,
        name,
        email,
        role,
        allergies,
      })

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      }
    } catch (profileError: any) {
      console.error("PROFILE CREATE ERROR:", profileError?.code, profileError?.message)

      // cleanup if profile write fails
      await firebaseUser.delete()

      if (profileError?.code === "permission-denied") {
        return { error: "Profile creation blocked by Firestore rules." }
      }

      return { error: "Registration failed while creating user profile." }
    }
  } catch (error: any) {
    console.error("REGISTER ERROR:", error?.code, error?.message)

    switch (error?.code) {
      case "auth/email-already-in-use":
        return { error: "An account with this email already exists" }
      case "auth/invalid-email":
        return { error: "Invalid email address" }
      case "auth/weak-password":
        return { error: "Password should be at least 6 characters" }
      case "auth/operation-not-allowed":
        return { error: "Email/password sign-in is not enabled in Firebase." }
      default:
        return { error: "Registration failed. Please try again." }
    }
  }
}

export async function logout() {
  await signOut(auth)
}

export async function getSession() {
  const firebaseUser = auth.currentUser

  if (!firebaseUser) return null

  const user = await getUserById(firebaseUser.uid)

  if (!user) return null
  if ((user as any).status === "disabled") return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  }
}