"use server"

import { cookies } from "next/headers"
import { db } from "../src/config/firebase"
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
} from "firebase/firestore"
import type { UserRole, User } from "./types"

const SESSION_COOKIE = "hds_session"

async function getUserByEmail(email: string): Promise<User | null> {
  const q = query(collection(db, "users"), where("email", "==", email))
  const snap = await getDocs(q)

  if (snap.empty) return null

  const d = snap.docs[0]

  return {
    id: d.id,
    ...(d.data() as Omit<User, "id">),
  }
}

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
  name: string
  email: string

  role: UserRole
  allergies?: string[]
}) {
  const ref = await addDoc(collection(db, "users"), {
    ...data,
    createdAt: new Date().toISOString(),
  })

  return {
    id: ref.id,
    ...data,
  }
}

export async function login(email: string) {
  const user = await getUserByEmail(email)

  if (!user) {
    return { error: "Invalid email or password" }
  }

  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  }
}

export async function register(
  name: string,
  email: string,
  role: UserRole,
  allergies: string[] = []
) {
  const existing = await getUserByEmail(email)

  if (existing) {
    return { error: "An account with this email already exists" }
  }

  const user = await createUser({
    name,
    email,
    role,
    allergies,
  })

  const cookieStore = await cookies()

  cookieStore.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function getSession() {
  const cookieStore = await cookies()

  const sessionId = cookieStore.get(SESSION_COOKIE)?.value

  if (!sessionId) return null

  const user = await getUserById(sessionId)

  if (!user) return null

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  }
}