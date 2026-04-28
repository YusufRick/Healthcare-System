"use server"

import { randomUUID } from "crypto"
import { db } from "../src/config/firebase"
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import { getSession } from "./auth"
import {
  sendEmail,
  generatePickupReadyEmail,
  generateExpiredEmail as generateExpiredEmailTemplate,
  generateRefillApprovedEmail as generateRefillApprovedEmailTemplate,
  generateRefillRejectedEmail as generateRefillRejectedEmailTemplate,
  generateBookingConfirmationEmail,
} from "@/src/services/emailService"
import type {
  AuditLog,
  Booking,
  EmailLog,
  Locker,
  PrescribedMedication,
  Prescription,
  QRCode,
  RefillRequest,
  RiskAssessmentResult,
  User,
} from "./types"

type SessionUser = {
  id: string
  name: string
  email: string
  role: "doctor" | "clinic_staff" | "pharmacy_staff" | "patient"
}

function toSessionUser(session: unknown): SessionUser | null {
  if (!session || typeof session !== "object") return null
  const s = session as Record<string, unknown>

  const id =
    typeof s.id === "string"
      ? s.id
      : typeof s.uid === "string"
        ? s.uid
        : null

  const name =
    typeof s.name === "string"
      ? s.name
      : typeof s.displayName === "string"
        ? s.displayName
        : null

  const role =
    typeof s.role === "string"
      ? s.role
      : null

  if (!id || !name || !role) {
    return null
  }

  return {
    id,
    name,
    email: typeof s.email === "string" ? s.email : "",
    role: role as SessionUser["role"],
  }
}

function mapDoc<T>(snap: { id: string; data: () => unknown }): T {
  return {
    id: snap.id,
    ...(snap.data() as object),
  } as T
}

async function addAuditLog(
  userId: string,
  userName: string,
  action: string,
  details: string
) {
  await addDoc(collection(db, "auditLogs"), {
    userId,
    userName,
    action,
    details,
    timestamp: new Date().toISOString(),
  })
}

async function addEmailLog(to: string, subject: string, body: string) {
  await addDoc(collection(db, "emailLogs"), {
    to,
    subject,
    body,
    sentAt: new Date().toISOString(),
  })
}

async function getUserById(id: string): Promise<User | null> {
  const ref = doc(db, "users", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<User>(snap)
}

async function getPrescriptionById(id: string): Promise<Prescription | null> {
  const ref = doc(db, "prescriptions", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<Prescription>(snap)
}

async function getBookingById(id: string): Promise<Booking | null> {
  const ref = doc(db, "bookings", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<Booking>(snap)
}

async function getBookingByPrescription(
  prescriptionId: string
): Promise<Booking | null> {
  const q = query(
    collection(db, "bookings"),
    where("prescriptionId", "==", prescriptionId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<Booking>(snap.docs[0])
}

async function getLockerByBooking(bookingId: string): Promise<Locker | null> {
  const q = query(
    collection(db, "lockers"),
    where("bookingId", "==", bookingId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<Locker>(snap.docs[0])
}

async function getQRByBooking(bookingId: string): Promise<QRCode | null> {
  const q = query(
    collection(db, "qrCodes"),
    where("bookingId", "==", bookingId)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<QRCode>(snap.docs[0])
}

async function getQRByToken(token: string): Promise<QRCode | null> {
  const q = query(collection(db, "qrCodes"), where("token", "==", token))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapDoc<QRCode>(snap.docs[0])
}

async function updatePrescriptionStatus(
  prescriptionId: string,
  status: Prescription["status"]
) {
  await updateDoc(doc(db, "prescriptions", prescriptionId), { status })
}

async function updateBookingStatus(
  bookingId: string,
  status: Booking["status"]
) {
  await updateDoc(doc(db, "bookings", bookingId), { status })
}

async function markQRUsed(qrId: string) {
  await updateDoc(doc(db, "qrCodes", qrId), { used: true })
}

async function unlockLocker(lockerId: string) {
  await updateDoc(doc(db, "lockers", lockerId), {
    status: "unlocked",
  })
}

async function releaseLocker(lockerId: string) {
  await updateDoc(doc(db, "lockers", lockerId), {
    status: "available",
    bookingId: null,
  })
}

async function assignLocker(lockerId: string, bookingId: string): Promise<Locker | null> {
  const lockerRef = doc(db, "lockers", lockerId)
  const lockerSnap = await getDoc(lockerRef)

  if (!lockerSnap.exists()) return null

  const locker = mapDoc<Locker>(lockerSnap)
  if (locker.status !== "available") return null

  await updateDoc(lockerRef, {
    status: "occupied",
    bookingId,
  })

  const updatedSnap = await getDoc(lockerRef)
  if (!updatedSnap.exists()) return null

  return mapDoc<Locker>(updatedSnap)
}

async function createQRCodeRecord(
  bookingId: string,
  expiryMinutes: number
): Promise<{ id: string; token: string }> {
  const expires = new Date()
  expires.setMinutes(expires.getMinutes() + expiryMinutes)

  const token = randomUUID()

  const qrRef = await addDoc(collection(db, "qrCodes"), {
    bookingId,
    token,
    expiresAt: expires.toISOString(),
    used: false,
    createdAt: new Date().toISOString(),
  })

  return {
    id: qrRef.id,
    token,
  }
}

async function getRefillRequestById(id: string): Promise<RefillRequest | null> {
  const ref = doc(db, "refillRequests", id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return mapDoc<RefillRequest>(snap)
}

async function updateRefillRequestStatus(
  requestId: string,
  status: RefillRequest["status"],
  rejectionReason?: string
) {
  await updateDoc(doc(db, "refillRequests", requestId), {
    status,
    rejectionReason: rejectionReason ?? null,
    respondedAt: new Date().toISOString(),
  })
}

// --- Doctor Actions ---

export async function getPatientList() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "doctor") {
    return { error: "Unauthorized" }
  }

  const q = query(collection(db, "users"), where("role", "==", "patient"))
  const snapshot = await getDocs(q)

  const patients = snapshot.docs.map((d) => {
    const user = mapDoc<User>(d)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      allergies: user.allergies ?? [],
    }
  })

  return { patients }
}

type RiskCheckMedication = {
  name: string
  dosage?: string
}

function parseSingleDoseMg(dosage?: string): number | null {
  if (!dosage) return null

  const text = dosage.trim().toLowerCase()

  const mgMatch =
    text.match(/(\d+(?:\.\d+)?)\s*mg\b/i) ??
    text.match(/^(\d+(?:\.\d+)?)$/)

  if (!mgMatch) return null

  return Number(mgMatch[1])
}

function parseDailyDoseMg(dosage?: string): number | null {
  if (!dosage) return null

  const text = dosage.trim().toLowerCase()

  const mgMatch =
    text.match(/(\d+(?:\.\d+)?)\s*mg\b/i) ??
    text.match(/^(\d+(?:\.\d+)?)$/)

  if (!mgMatch) return null

  const amountMg = Number(mgMatch[1])

  let multiplier = 1

  if (/once daily|once a day|daily|\bod\b/i.test(text)) {
    multiplier = 1
  } else if (/twice daily|twice a day|\bbid\b|2x/i.test(text)) {
    multiplier = 2
  } else if (/three times daily|three times a day|\btid\b|3x/i.test(text)) {
    multiplier = 3
  } else if (/four times daily|four times a day|\bqid\b|4x/i.test(text)) {
    multiplier = 4
  } else {
    const everyHoursMatch = text.match(/every\s+(\d+)\s*hours?/i)
    if (everyHoursMatch) {
      const hours = Number(everyHoursMatch[1])
      if (hours > 0) {
        multiplier = Math.max(1, Math.floor(24 / hours))
      }
    }
  }

  return amountMg * multiplier
}

function extractMaxDailyMg(label: any): number | null {
  const text = [
    ...(Array.isArray(label.dosage_and_administration) ? label.dosage_and_administration : []),
    ...(Array.isArray(label.dosage_and_administration_table) ? label.dosage_and_administration_table : []),
    ...(Array.isArray(label.dosage_forms_and_strengths) ? label.dosage_forms_and_strengths : []),
    ...(Array.isArray(label.dosage_forms_and_strengths_table) ? label.dosage_forms_and_strengths_table : []),
    ...(Array.isArray(label.overdosage) ? label.overdosage : []),
    ...(Array.isArray(label.use_in_specific_populations) ? label.use_in_specific_populations : []),
    ...(Array.isArray(label.pediatric_use) ? label.pediatric_use : []),
    ...(Array.isArray(label.geriatric_use) ? label.geriatric_use : []),
  ]
    .join(" ")
    .replace(/\s+/g, " ")

  const patterns = [
    /maximum recommended dose(?: is|:)?\s*(\d+(?:\.\d+)?)\s*mg(?:\/day| per day| daily)?/i,
    /maximum daily dose(?: is|:)?\s*(\d+(?:\.\d+)?)\s*mg/i,
    /max(?:imum)? daily dose(?: is|:)?\s*(\d+(?:\.\d+)?)\s*mg/i,
    /do not exceed\s*(\d+(?:\.\d+)?)\s*mg(?:\/day| per day| daily)?/i,
    /should not exceed\s*(\d+(?:\.\d+)?)\s*mg(?:\/day| per day| daily)?/i,
    /not to exceed\s*(\d+(?:\.\d+)?)\s*mg(?:\/day| per day| daily)?/i,
    /total daily dose(?: of)?\s*(\d+(?:\.\d+)?)\s*mg/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return Number(match[1])
    }
  }

  return null
}

function extractProductStrengthMg(drugInfo: any): number | null {
  const products = Array.isArray(drugInfo?.products) ? drugInfo.products : []

  for (const product of products) {
    const ingredients = Array.isArray(product?.active_ingredients)
      ? product.active_ingredients
      : []

    for (const ingredient of ingredients) {
      const strength =
        typeof ingredient?.strength === "string" ? ingredient.strength : ""

      const match = strength.match(/(\d+(?:\.\d+)?)\s*mg\b/i)
      if (match) {
        return Number(match[1])
      }
    }
  }

  return null
}

// prescribed medications against:
//   1. Patient allergies 
//   2. FDA-labelled maximum daily dosage
//   3. Known drug-drug interactions from FDA label text
// Design rationale: OpenFDA is a free, authoritative US government
// API for drug label data. Using it live
// means the system always reflects the latest FDA labelling.
//WHY OPENFDA?
//I avoid the complexity and maintenance of building and updating our own drug database,
//  which would require constant manual curation to stay current.
//  OpenFDA provides comprehensive,
//  regularly updated drug label data that includes the necessary information for our risk checks (contraindications, dosage limits, interactions). By leveraging this existing resource, we can implement robust risk assessment features with less development overhead and ensure our system reflects the most up-to-date safety information.
export async function runRiskAssessment(
  medications: RiskCheckMedication[],
  patientAllergies: string[] = []
): Promise<{ assessment?: RiskAssessmentResult; error?: string }> {
  try {
    const issues: RiskAssessmentResult["issues"] = []
    const apiKey = process.env.OPENFDA_API_KEY

    // Build URL-safe search query for OpenFDA
    // We search both brand name AND generic name for maximum match coverage
    const makeSearch = (drugName: string) =>
      encodeURIComponent(
        `openfda.brand_name:"${drugName}" OR openfda.generic_name:"${drugName}"`
      )

    // HELPER: fetchDrugLabel
    // Fetches the full FDA drug label for a given medication name.
    // The label contains: contraindications, warnings, dosage limits,
    // drug interactions, active ingredients.
    const fetchDrugLabel = async (drugName: string) => {
      const search = makeSearch(drugName)
      const baseUrl = "https://api.fda.gov/drug/label.json"
      const url = apiKey
        ? `${baseUrl}?api_key=${apiKey}&search=${search}&limit=1`
        : `${baseUrl}?search=${search}&limit=1`

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      })

      if (!res.ok) return null

      const data = await res.json()
      return data?.results?.[0] ?? null
    }

    // Fetches product-level data (active ingredient strengths per unit).
    // Used to detect if a prescribed single dose is unrealistically
    // high relative to the product's available strength (e.g. 1000mg
    // when the tablet is 10mg — likely a human error).
    const fetchDrugProductInfo = async (drugName: string) => {
      const search = makeSearch(drugName)
      const baseUrl = "https://api.fda.gov/drug/drugsfda.json"
      const url = apiKey
        ? `${baseUrl}?api_key=${apiKey}&search=${search}&limit=1`
        : `${baseUrl}?search=${search}&limit=1`

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
      })

      if (!res.ok) return null

      const data = await res.json()
      return data?.results?.[0] ?? null
    }

    //fetches all labels in parallel for efficiency, 
    // since each label fetch can be slow due to the large amount of text data

    const labels = await Promise.all(
      medications.map(async (med) => ({
        ...med,
        label: await fetchDrugLabel(med.name),
        productInfo: await fetchDrugProductInfo(med.name),
      }))
    )

    // CHECK 1: ALLERGY CONFLICTS
    // For each medication, scan the FDA label's contraindications
    // and warnings text. If any patient allergy appears in that text,
    // flag it as a HIGH severity issue.
    for (const { name, dosage, label, productInfo } of labels) {
      if (!label) continue // If we can't fetch label data, we skip checks for that medication

      const allergyText = [
        ...(Array.isArray(label.contraindications) ? label.contraindications : []),
        ...(Array.isArray(label.warnings) ? label.warnings : []),
        ...(Array.isArray(label.warnings_and_cautions) ? label.warnings_and_cautions : []),
        ...(Array.isArray(label.active_ingredient) ? label.active_ingredient : []),
      ]
        .join(" ")
        .toLowerCase()

      // Check each patient allergy against the combined label text
      for (const allergy of patientAllergies) {
        if (allergyText.includes(allergy.toLowerCase())) {
          issues.push({
            code: "ALLERGY_CONFLICT",
            severity: "high",
            message: `${name} may conflict with patient allergy: ${allergy}`,
            medicationName: name,
          })
        }
      }

      // CHECK 2: DOSAGE LIMIT EXCEEDED
      // parseDailyDoseMg() extracts and calculates total daily mg
      // (e.g. "500mg twice daily",1000mg/day).
      // extractMaxDailyMg() finds the FDA-labelled daily maximum.
      // If prescribed  is more than maximum, flag as HIGH severity.

      const singleDoseMg = parseSingleDoseMg(dosage)
      const prescribedDailyMg = parseDailyDoseMg(dosage)
      const maxDailyMg = extractMaxDailyMg(label)
      const productStrengthMg = extractProductStrengthMg(productInfo)

      if (
        prescribedDailyMg !== null &&
        maxDailyMg !== null &&
        prescribedDailyMg > maxDailyMg
      ) {
        issues.push({
          code: "DOSAGE_LIMIT",
          severity: "high",
          message: `${name} prescribed dose may exceed labeled maximum daily dose (${prescribedDailyMg} mg/day vs ${maxDailyMg} mg/day).`,
          medicationName: name,
        })
      }

      // CHECK 2b: DOSAGE STRENGTH MISMATCH (data entry guard)
      // If a single prescribed dose is 10x or more the product's
      // unit strength, it's likely a data entry error (e.g. mg vs mcg).
      // Flagged as MEDIUM severity — still requires review.

      if (
        singleDoseMg !== null &&
        productStrengthMg !== null &&
        productStrengthMg > 0
      ) {
        const strengthMultiple = singleDoseMg / productStrengthMg

        if (strengthMultiple >= 10) {
          issues.push({
            code: "DOSAGE_STRENGTH_MISMATCH",
            severity: "medium",
            message: `${name} entered dose (${singleDoseMg} mg) is far above the product strength (${productStrengthMg} mg per unit). Please verify the dose and units.`,
            medicationName: name,
          })
        }
      }
    }

     // CHECK 3: DRUG-DRUG INTERACTIONS
    // Compare every pair of medications.
    // For each pair, check if medication B's name appears in
    // medication A's FDA label drug_interactions section.
    // O(n²) loop — acceptable since prescriptions rarely have >10 items.

    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const medA = labels[i]
        const medB = labels[j]

        if (!medA.label) continue

        const interactionText = [
          ...(Array.isArray(medA.label.drug_interactions) ? medA.label.drug_interactions : []),
        ]
          .join(" ")
          .toLowerCase()

        if (interactionText.includes(medB.name.toLowerCase())) {
          issues.push({
            code: "DRUG_INTERACTION",
            severity: "medium",
            message: `Potential interaction between ${medA.name} and ${medB.name}`,
            medicationName: medA.name,
          })
        }
      }
    }

    // FINAL STATUS CALCULATION
    // If any HIGH severity issue exists, mark it as  "unsafe" (block prescription)
    // If any MEDIUM severity issue exists, mark it as "review" (proceed with caution, doctor warned)
    // Otherwise,"safe"
    const hasHigh = issues.some((issue) => issue.severity === "high")
    const hasMedium = issues.some((issue) => issue.severity === "medium")

    return {
      assessment: {
        issues,
        status: hasHigh ? "unsafe" : hasMedium ? "review" : "safe",
      },
    }
  } catch (error) {
    console.error("runRiskAssessment error:", error)
    return { error: "Failed to run risk assessment" }
  }
}


export async function submitPrescription(
  doctorId: string,
  doctorName: string,
  patientId: string,
  medications: PrescribedMedication[],
  notes: string,
  riskAssessment: RiskAssessmentResult | null
) {
  if (!doctorId || !doctorName) {
    return { error: "Missing doctor details" }
  }

  const patient = await getUserById(patientId)
  if (!patient) {
    return { error: "Patient not found" }
  }

  const prescriptionRef = await addDoc(collection(db, "prescriptions"), {
    doctorId,
    patientId,
    patientName: patient.name,
    medications,
    notes,
    riskAssessment,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  })

  const medSummary = medications.map((m) => `${m.name} ${m.dosage}`).join(", ")

  await addAuditLog(
    doctorId,
    doctorName,
    "Prescription Confirmed",
    `Prescription ${prescriptionRef.id} for ${patient.name}: ${medSummary}`
  )

  if (riskAssessment) {
    await addAuditLog(
      doctorId,
      doctorName,
      "Risk Assessment",
      `Risk: ${riskAssessment.status} for ${medSummary} - ${patient.name}`
    )
  }

  return {
    prescriptionId: prescriptionRef.id,
  }
}

export async function getDoctorPrescriptions(doctorId: string) {
  if (!doctorId) {
    return { error: "Missing doctor id" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("doctorId", "==", doctorId)
  )

  const snapshot = await getDocs(q)
  const prescriptions = snapshot.docs.map((d) => mapDoc<Prescription>(d))

  return { prescriptions }
}

export async function getDoctorRefillRequests(doctorId: string) {
  if (!doctorId) {
    return { error: "Missing doctor id" }
  }

  const q = query(
    collection(db, "refillRequests"),
    where("doctorId", "==", doctorId),
    where("status", "==", "pending")
  )

  const snap = await getDocs(q)
  const requests = snap.docs.map((d) => mapDoc<RefillRequest>(d))

  return { requests }
}

export async function approveRefillRequest(
  doctorId: string,
  doctorName: string,
  requestId: string
) {
  if (!doctorId || !doctorName) {
    return { error: "Missing doctor details" }
  }

  const request = await getRefillRequestById(requestId)
  if (!request) return { error: "Refill request not found" }
  if (request.doctorId !== doctorId) return { error: "Unauthorized" }

  const rxRef = await addDoc(collection(db, "prescriptions"), {
    doctorId,
    patientId: request.patientId,
    patientName: request.patientName,
    clinicId: "",
    medications: request.medications,
    notes: `Refill of previous prescription. Reason: ${request.reason}`,
    riskAssessment: null,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  })

  await updateRefillRequestStatus(requestId, "approved")

  const medSummary = request.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    doctorId,
    doctorName,
    "Refill Approved",
    `Approved refill request ${requestId} for ${request.patientName}: ${medSummary}`
  )

  const emailBody = generateRefillApprovedEmailTemplate(
    request.patientName,
    medSummary
  )

  const emailResult = await sendEmail({
    to: request.patientEmail,
    subject: "Your Prescription Refill Has Been Approved",
    html: emailBody,
  })

  await addEmailLog(
    request.patientEmail,
    "Your Prescription Refill Has Been Approved",
    emailBody
  )

  if (!emailResult.success) {
    console.error("[Actions] Failed to send refill approved email:", emailResult.error)
  }

  return { prescriptionId: rxRef.id }
}

export async function rejectRefillRequest(
  doctorId: string,
  doctorName: string,
  requestId: string,
  rejectionReason: string
) {
  if (!doctorId || !doctorName) {
    return { error: "Missing doctor details" }
  }

  const request = await getRefillRequestById(requestId)
  if (!request) return { error: "Refill request not found" }
  if (request.doctorId !== doctorId) return { error: "Unauthorized" }

  await updateRefillRequestStatus(requestId, "rejected", rejectionReason)

  const medSummary = request.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    doctorId,
    doctorName,
    "Refill Rejected",
    `Rejected refill request ${requestId} for ${request.patientName}: ${medSummary}. Reason: ${rejectionReason}`
  )

  const emailBody = generateRefillRejectedEmailTemplate(
    request.patientName,
    medSummary,
    rejectionReason
  )

  const emailResult = await sendEmail({
    to: request.patientEmail,
    subject: "Your Prescription Refill Request Was Declined",
    html: emailBody,
  })

  await addEmailLog(
    request.patientEmail,
    "Your Prescription Refill Request Was Declined",
    emailBody
  )

  if (!emailResult.success) {
    console.error("[Actions] Failed to send refill rejected email:", emailResult.error)
  }

  return { success: true }
}

// --- Clinic Staff Actions ---

export async function getClinicPrescriptions(clinincId: string) {
  if (!clinincId) {
    return { error: "Missing clinic id" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("status", "==", "confirmed")
  )

  const snap = await getDocs(q)
  const prescriptions = snap.docs.map((d) => mapDoc<Prescription>(d))

  return { prescriptions }
}



export async function getClinicPrescriptionHistory() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "clinic_staff") {
    return { error: "Unauthorized" }
  }

  const snap = await getDocs(collection(db, "prescriptions"))
  const prescriptions = snap.docs.map((d) => mapDoc<Prescription>(d))

  const history = await Promise.all(
    prescriptions.map(async (rx) => {
      const booking = await getBookingByPrescription(rx.id)
      return { prescription: rx, booking }
    })
  )

  return { history }
}

export async function submitBooking(
  prescriptionId: string,
  patientEmail: string,
  pickupTime: string,
  pharmacyName: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "clinic_staff") {
    return { error: "Unauthorized" }
  }

  const rx = await getPrescriptionById(prescriptionId)
  if (!rx) return { error: "Prescription not found" }

  const bookingRef = await addDoc(collection(db, "bookings"), {
    prescriptionId,
    patientEmail,
    pickupTime,
    pharmacyName,
    createdById: session.id,
    createdByRole: "clinic_staff",
    status: "pending",
    createdAt: new Date().toISOString(),
  })

  await updatePrescriptionStatus(prescriptionId, "booked")

  const emailSubject = "Prescription Pickup Booking Confirmation"
  const emailBody = `Hello ${rx.patientName},

Your booking has been created successfully.

Pickup time: ${pickupTime}
Pharmacy: ${pharmacyName}

This is a prototype email record stored in Firestore.
`

  await addDoc(collection(db, "emailLogs"), {
    to: patientEmail,
    patientName: rx.patientName,
    bookingId: bookingRef.id,
    prescriptionId,
    type: "booking_confirmation",
    subject: emailSubject,
    body: emailBody,
    status: "queued",
    deliveryMode: "prototype_firestore",
    createdAt: new Date().toISOString(),
    createdById: session.id,
    createdByRole: "clinic_staff",
  })

  await addAuditLog(
    session.id,
    session.name,
    "Booking Created",
    `Booking ${bookingRef.id} for prescription ${prescriptionId} at ${pharmacyName}`
  )

  return {
    bookingId: bookingRef.id,
  }
}

// --- Pharmacy Staff Actions ---

export async function getPharmacyBookings() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("status", "==", "booked")
  )

  const bookedSnap = await getDocs(q)
  const prescriptions = bookedSnap.docs.map((d) => mapDoc<Prescription>(d))

  const items = await Promise.all(
    prescriptions.map(async (rx) => {
      const booking = await getBookingByPrescription(rx.id)
      const locker = booking ? await getLockerByBooking(booking.id) : null
      const qr = booking ? await getQRByBooking(booking.id) : null
      return { prescription: rx, booking, locker, qr }
    })
  )

  return { items }
}

export async function getAvailableLockerList() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "lockers"),
    where("status", "==", "available")
  )

  const snap = await getDocs(q)
  const lockers = snap.docs.map((d) => mapDoc<Locker>(d))

  return { lockers }
}

export async function assignLockerToBooking(bookingId: string, lockerId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const booking = await getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  const locker = await assignLocker(lockerId, bookingId)
  if (!locker) return { error: "Locker not found or not available" }

  await updateBookingStatus(bookingId, "locker_assigned")

  await addAuditLog(
    session.id,
    session.name,
    "Locker Assigned",
    `Locker ${locker.label} assigned to booking ${bookingId}`
  )

  return { locker }
}

export async function markBookingReady(bookingId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const booking = await getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  await updateBookingStatus(bookingId, "ready")

  const rx = await getPrescriptionById(booking.prescriptionId)
  if (rx) {
    await updatePrescriptionStatus(rx.id, "ready")
  }

  const qr = await createQRCodeRecord(bookingId, 60)

  if (rx) {
    const emailBody = generatePickupReadyEmail(
      rx.patientName,
      rx.medications,
      booking.pickupTime,
      booking.pharmacyName,
      qr.token
    )

    const emailResult = await sendEmail({
      to: booking.patientEmail,
      subject: "Your Prescription is Ready for Pickup",
      html: emailBody,
    })

    await addEmailLog(
      booking.patientEmail,
      "Your Prescription is Ready for Pickup",
      emailBody
    )

    if (!emailResult.success) {
      console.error("[Actions] Failed to send pickup email:", emailResult.error)
    }
  }

  await addAuditLog(
    session.id,
    session.name,
    "Booking Ready",
    `Booking ${bookingId} marked as ready. QR code generated.`
  )

  return { qr }
}

export async function generateStaffQR(bookingId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "pharmacy_staff") {
    return { error: "Unauthorized" }
  }

  const qr = await createQRCodeRecord(bookingId, 30)

  await addAuditLog(
    session.id,
    session.name,
    "Staff QR Generated",
    `Staff QR code for booking ${bookingId}`
  )

  return { qr }
}

// --- Patient Actions ---

export async function getPatientDashboard() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "prescriptions"),
    where("patientId", "==", session.id)
  )

  const snap = await getDocs(q)
  const prescriptions = snap.docs.map((d) => mapDoc<Prescription>(d))

  const items = await Promise.all(
    prescriptions.map(async (rx) => {
      const booking = await getBookingByPrescription(rx.id)
      const qr = booking ? await getQRByBooking(booking.id) : null
      const locker = booking ? await getLockerByBooking(booking.id) : null
      return { prescription: rx, booking, qr, locker }
    })
  )

  return { items, patientName: session.name }
}

export async function scanQRCode(token: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const qr = await getQRByToken(token)
  if (!qr) return { error: "Invalid QR code" }
  if (qr.used) return { error: "This QR code has already been used" }

  if (new Date(qr.expiresAt) < new Date()) {
    const booking = await getBookingById(qr.bookingId)

    if (booking) {
      await updateBookingStatus(booking.id, "expired")

      const rx = await getPrescriptionById(booking.prescriptionId)
      if (rx) {
        await updatePrescriptionStatus(rx.id, "expired")
      }

      const medNames = rx?.medications.map((m) => m.name).join(", ") || ""
      const emailBody = generateExpiredEmailTemplate(
        rx?.patientName || "Patient",
        medNames
      )

      await sendEmail({
        to: booking.patientEmail,
        subject: "QR Code Expired - Rebooking Required",
        html: emailBody,
      })

      await addEmailLog(
        booking.patientEmail,
        "QR Code Expired - Rebooking Required",
        emailBody
      )
    }

    return { error: "QR code has expired. A rebooking email has been sent." }
  }

  await markQRUsed(qr.id)

  const booking = await getBookingById(qr.bookingId)
  if (!booking) return { error: "Booking not found" }

  const locker = await getLockerByBooking(booking.id)
  if (locker) {
    await unlockLocker(locker.id)

    await addAuditLog(
      session.id,
      session.name,
      "Locker Accessed",
      `Locker ${locker.label} unlocked for booking ${booking.id}`
    )
  }

  return { success: true, lockerLabel: locker?.label || "Unknown" }
}

export async function closeLocker(bookingId: string) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const booking = await getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  await updateBookingStatus(bookingId, "collected")

  const rx = await getPrescriptionById(booking.prescriptionId)
  if (rx) {
    await updatePrescriptionStatus(rx.id, "collected")
  }

  const locker = await getLockerByBooking(bookingId)
  if (locker) {
    await releaseLocker(locker.id)

    await addAuditLog(
      session.id,
      session.name,
      "Locker Closed",
      `Locker ${locker.label} released after collection for booking ${bookingId}`
    )
  }

  return { success: true }
}

// --- Audit & Email Logs ---

export async function fetchAuditLogs() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session) return { error: "Unauthorized" }

  const snap = await getDocs(collection(db, "auditLogs"))
  const logs = snap.docs.map((d) => mapDoc<AuditLog>(d))

  return { logs }
}

export async function fetchEmailLogs() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session) return { error: "Unauthorized" }

  const snap = await getDocs(collection(db, "emailLogs"))
  const logs = snap.docs.map((d) => mapDoc<EmailLog>(d))

  return { logs }
}

// --- Patient Refill Request Action ---

export async function requestPrescriptionRefill(
  prescriptionId: string,
  reason: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const prescription = await getPrescriptionById(prescriptionId)
  if (!prescription) return { error: "Prescription not found" }
  if (prescription.patientId !== session.id) return { error: "Unauthorized" }

  const q = query(
    collection(db, "refillRequests"),
    where("patientId", "==", session.id),
    where("prescriptionId", "==", prescriptionId),
    where("status", "==", "pending")
  )

  const existing = await getDocs(q)
  if (!existing.empty) {
    return { error: "A refill request is already pending for this prescription" }
  }

  const requestRef = await addDoc(collection(db, "refillRequests"), {
    prescriptionId,
    patientId: session.id,
    patientName: prescription.patientName,
    patientEmail: session.email,
    doctorId: prescription.doctorId,
    medications: prescription.medications,
    reason,
    status: "pending",
    createdAt: new Date().toISOString(),
  })

  const medSummary = prescription.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Refill Requested",
    `Refill request ${requestRef.id} for ${medSummary}`
  )

  return {
    request: {
      id: requestRef.id,
      prescriptionId,
      patientId: session.id,
      patientName: prescription.patientName,
      patientEmail: session.email,
      doctorId: prescription.doctorId,
      medications: prescription.medications,
      reason,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  }
}

export async function getPatientRefillRequests() {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const q = query(
    collection(db, "refillRequests"),
    where("patientId", "==", session.id)
  )

  const snap = await getDocs(q)
  const requests = snap.docs.map((d) => mapDoc<RefillRequest>(d))

  return { requests }
}

export async function patientBookPrescription(
  prescriptionId: string,
  pickupTime: string,
  pharmacyName: string
) {
  const rawSession = await getSession()
  const session = toSessionUser(rawSession)

  if (!session || session.role !== "patient") {
    return { error: "Unauthorized" }
  }

  const rx = await getPrescriptionById(prescriptionId)
  if (!rx) return { error: "Prescription not found" }
  if (rx.patientId !== session.id) return { error: "Unauthorized" }
  if (rx.status !== "confirmed") {
    return { error: "Prescription is not available for booking" }
  }

  const bookingRef = await addDoc(collection(db, "bookings"), {
    prescriptionId,
    patientEmail: session.email,
    pickupTime,
    pharmacyName,
    createdById: session.id,
    createdByRole: "patient",
    status: "pending",
    createdAt: new Date().toISOString(),
  })

  await updatePrescriptionStatus(prescriptionId, "booked")

  const medSummary = rx.medications.map((m) => m.name).join(", ")

  await addAuditLog(
    session.id,
    session.name,
    "Patient Booking",
    `Booked prescription ${prescriptionId} for ${medSummary} at ${pharmacyName}`
  )

  const emailBody = generateBookingConfirmationEmail(
    session.name,
    medSummary,
    pickupTime,
    pharmacyName
  )

  const emailResult = await sendEmail({
    to: session.email,
    subject: "Prescription Pickup Booking Confirmed",
    html: emailBody,
  })

  await addEmailLog(
    session.email,
    "Prescription Pickup Booking Confirmed",
    emailBody
  )

  if (!emailResult.success) {
    console.error("[Actions] Failed to send booking confirmation email:", emailResult.error)
  }

  return {
    booking: {
      id: bookingRef.id,
      prescriptionId,
      patientEmail: session.email,
      pickupTime,
      pharmacyName,
      createdById: session.id,
      createdByRole: "patient",
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  }
}