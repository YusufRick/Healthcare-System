// Mock Auth Service - Uses local data for development
// TODO: Replace with Firebase integration later

import type { UserRole } from "@/lib/types"

export interface UserProfile {
  uid: string
  name: string
  email: string
  role: UserRole
  allergies: string[]
  createdAt: string
}

// Mock user database for demo purposes
const MOCK_USERS: Record<string, UserProfile & { password: string }> = {
  "doctor@demo.com": {
    uid: "doc-1",
    name: "Dr. Sarah Wilson",
    email: "doctor@demo.com",
    password: "password123",
    role: "doctor",
    allergies: [],
    createdAt: new Date().toISOString(),
  },
  "clinic@demo.com": {
    uid: "clinic-1",
    name: "John Smith",
    email: "clinic@demo.com",
    password: "password123",
    role: "clinic_staff",
    allergies: [],
    createdAt: new Date().toISOString(),
  },
  "pharmacy@demo.com": {
    uid: "pharm-1",
    name: "Mary Johnson",
    email: "pharmacy@demo.com",
    password: "password123",
    role: "pharmacy_staff",
    allergies: [],
    createdAt: new Date().toISOString(),
  },
  "patient@demo.com": {
    uid: "pat-1",
    name: "Emily Thompson",
    email: "patient@demo.com",
    password: "password123",
    role: "patient",
    allergies: ["Penicillin", "Sulfa"],
    createdAt: new Date().toISOString(),
  },
}

// In-memory storage for current user (simulates session)
let currentUser: UserProfile | null = null
let authStateListeners: Array<(user: UserProfile | null) => void> = []

function notifyListeners() {
  authStateListeners.forEach((callback) => callback(currentUser))
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  allergies: string[] = []
): Promise<{ user?: UserProfile; error?: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (MOCK_USERS[email]) {
    return { error: "An account with this email already exists" }
  }

  if (password.length < 6) {
    return { error: "Password should be at least 6 characters" }
  }

  const newUser: UserProfile & { password: string } = {
    uid: `user-${Date.now()}`,
    name,
    email,
    password,
    role,
    allergies,
    createdAt: new Date().toISOString(),
  }

  MOCK_USERS[email] = newUser
  
  const { password: _, ...userProfile } = newUser
  currentUser = userProfile
  notifyListeners()

  return { user: userProfile }
}

export async function signIn(
  email: string,
  password: string
): Promise<{ user?: UserProfile; error?: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500))

  const user = MOCK_USERS[email]
  
  if (!user || user.password !== password) {
    return { error: "Invalid email or password" }
  }

  const { password: _, ...userProfile } = user
  currentUser = userProfile
  notifyListeners()

  return { user: userProfile }
}

export async function logOut(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200))
  currentUser = null
  notifyListeners()
}

export function onAuthChange(callback: (user: UserProfile | null) => void): () => void {
  authStateListeners.push(callback)
  // Immediately call with current state
  callback(currentUser)
  
  return () => {
    authStateListeners = authStateListeners.filter((cb) => cb !== callback)
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const user = Object.values(MOCK_USERS).find((u) => u.uid === uid)
  if (user) {
    const { password: _, ...profile } = user
    return profile
  }
  return null
}

export function getCurrentUser(): UserProfile | null {
  return currentUser
}
