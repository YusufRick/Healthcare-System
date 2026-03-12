"use server"

import { cookies } from "next/headers"
import { getUserByEmail, getUserById, createUser } from "./db"
import type { UserRole } from "./types"

const SESSION_COOKIE = "hds_session"

export async function login(email: string, password: string) {
  const user = getUserByEmail(email)
  if (!user || user.password !== password) {
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
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
}

export async function register(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  allergies: string[] = []
) {
  const existing = getUserByEmail(email)
  if (existing) {
    return { error: "An account with this email already exists" }
  }

  const user = createUser({ name, email, password, role, allergies })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role } }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function getSession() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value
  if (!sessionId) return null
  const user = getUserById(sessionId)
  if (!user) return null
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}
