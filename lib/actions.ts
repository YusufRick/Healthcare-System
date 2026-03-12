"use server"

import { getSession } from "./auth"
import {
  sendEmail,
  generatePickupReadyEmail,
  generateExpiredEmail as generateExpiredEmailTemplate,
  generateRefillApprovedEmail as generateRefillApprovedEmailTemplate,
  generateRefillRejectedEmail as generateRefillRejectedEmailTemplate,
  generateBookingConfirmationEmail,
} from "@/src/services/emailService"
import {
  getPatients,
  getUserById,
  getPrescriptionsByDoctor,
  getPrescriptionsByPatient,
  getConfirmedPrescriptions,
  getBookedPrescriptions,
  getPrescriptionById,
  getPrescriptions,
  createPrescription,
  updatePrescriptionStatus,
  createBooking,
  getBookingByPrescription,
  getBookingById,
  updateBookingStatus,
  getAvailableLockers,
  getLockers,
  assignLocker,
  getLockerByBooking,
  unlockLocker,
  releaseLocker,
  createQRCode,
  getQRByBooking,
  getQRByToken,
  markQRUsed,
  addAuditLog,
  addEmailLog,
  getAuditLogs,
  getEmailLogs,
  getBookings,
  createRefillRequest,
  getRefillRequestById,
  getPendingRefillRequestsByDoctor,
  getRefillRequestsByPatient,
  updateRefillRequestStatus,
} from "./db"
import { runRiskAssessment as runStructuredRiskAssessment } from "./validation"
import type { RiskAssessment } from "./types"

// --- Doctor Actions ---

export async function getPatientList() {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }
  return { patients: getPatients().map((p) => ({ id: p.id, name: p.name, email: p.email, allergies: p.allergies })) }
}

export async function runRiskAssessment(medications: string[], patientId: string): Promise<{ assessment?: RiskAssessment; error?: string }> {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }
  const patient = getUserById(patientId)
  if (!patient) return { error: "Patient not found" }

  const assessment = runStructuredRiskAssessment({
    medications: medications.map((name) => ({ name, dosage: "" })),
    patientAllergies: patient.allergies || [],
  })

  return { assessment }
}

export async function submitPrescription(
  patientId: string,
  medications: { name: string; dosage: string }[],
  notes: string,
  riskAssessment: RiskAssessment | null
) {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }
  const patient = getUserById(patientId)
  if (!patient) return { error: "Patient not found" }

  const rx = createPrescription({
    doctorId: session.id,
    patientId,
    patientName: patient.name,
    medications,
    notes,
    riskAssessment,
    status: "confirmed",
  })

  const medSummary = medications.map((m) => `${m.name} ${m.dosage}`).join(", ")
  addAuditLog(session.id, session.name, "Prescription Confirmed", `Prescription ${rx.id} for ${patient.name}: ${medSummary}`)
  if (riskAssessment) {
    addAuditLog(session.id, session.name, "Risk Assessment", `Risk: ${riskAssessment.level} (${riskAssessment.score}/100) for ${medSummary} - ${patient.name}`)
  }

  return { prescription: rx }
}

export async function getDoctorPrescriptions() {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }
  return { prescriptions: getPrescriptionsByDoctor(session.id) }
}

export async function getDoctorRefillRequests() {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }
  return { requests: getPendingRefillRequestsByDoctor(session.id) }
}

export async function approveRefillRequest(requestId: string) {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }

  const request = getRefillRequestById(requestId)
  if (!request) return { error: "Refill request not found" }
  if (request.doctorId !== session.id) return { error: "Unauthorized" }

  // Create new prescription from refill request
  const rx = createPrescription({
    doctorId: session.id,
    patientId: request.patientId,
    patientName: request.patientName,
    medications: request.medications,
    notes: `Refill of previous prescription. Reason: ${request.reason}`,
    riskAssessment: null,
    status: "confirmed",
  })

  updateRefillRequestStatus(requestId, "approved")

  const medSummary = request.medications.map((m) => `${m.name}`).join(", ")
  addAuditLog(session.id, session.name, "Refill Approved", `Approved refill request ${requestId} for ${request.patientName}: ${medSummary}`)

  // Send real email to patient
  const emailBody = generateRefillApprovedEmailTemplate(request.patientName, medSummary)
  
  const emailResult = await sendEmail({
    to: request.patientEmail,
    subject: "Your Prescription Refill Has Been Approved",
    html: emailBody,
  })
  
  addEmailLog(request.patientEmail, "Your Prescription Refill Has Been Approved", emailBody)
  
  if (!emailResult.success) {
    console.error("[Actions] Failed to send refill approved email:", emailResult.error)
  }

  return { prescription: rx }
}

export async function rejectRefillRequest(requestId: string, rejectionReason: string) {
  const session = await getSession()
  if (!session || session.role !== "doctor") return { error: "Unauthorized" }

  const request = getRefillRequestById(requestId)
  if (!request) return { error: "Refill request not found" }
  if (request.doctorId !== session.id) return { error: "Unauthorized" }

  updateRefillRequestStatus(requestId, "rejected", rejectionReason)

  const medSummary = request.medications.map((m) => `${m.name}`).join(", ")
  addAuditLog(session.id, session.name, "Refill Rejected", `Rejected refill request ${requestId} for ${request.patientName}: ${medSummary}. Reason: ${rejectionReason}`)

  // Send real email to patient
  const emailBody = generateRefillRejectedEmailTemplate(request.patientName, medSummary, rejectionReason)
  
  const emailResult = await sendEmail({
    to: request.patientEmail,
    subject: "Your Prescription Refill Request Was Declined",
    html: emailBody,
  })
  
  addEmailLog(request.patientEmail, "Your Prescription Refill Request Was Declined", emailBody)
  
  if (!emailResult.success) {
    console.error("[Actions] Failed to send refill rejected email:", emailResult.error)
  }

  return { success: true }
}

// --- Clinic Staff Actions ---

export async function getClinicPrescriptions() {
  const session = await getSession()
  if (!session || session.role !== "clinic_staff") return { error: "Unauthorized" }
  return { prescriptions: getConfirmedPrescriptions() }
}

export async function getClinicPrescriptionHistory() {
  const session = await getSession()
  if (!session || session.role !== "clinic_staff") return { error: "Unauthorized" }
  const allPrescriptions = getPrescriptions()
  // Get booking info for each prescription
  const history = allPrescriptions.map((rx) => {
    const booking = getBookingByPrescription(rx.id)
    return { prescription: rx, booking }
  })
  return { history }
}

export async function submitBooking(
  prescriptionId: string,
  patientEmail: string,
  pickupTime: string,
  pharmacyName: string
) {
  const session = await getSession()
  if (!session || session.role !== "clinic_staff") return { error: "Unauthorized" }

  const rx = getPrescriptionById(prescriptionId)
  if (!rx) return { error: "Prescription not found" }

  const booking = createBooking({
    prescriptionId,
    patientEmail,
    pickupTime,
    pharmacyName,
    clinicStaffId: session.id,
    status: "pending",
  })

  updatePrescriptionStatus(prescriptionId, "booked")

  addAuditLog(session.id, session.name, "Booking Created", `Booking ${booking.id} for prescription ${prescriptionId} at ${pharmacyName}`)

  return { booking }
}

// --- Pharmacy Staff Actions ---

export async function getPharmacyBookings() {
  const session = await getSession()
  if (!session || session.role !== "pharmacy_staff") return { error: "Unauthorized" }
  const booked = getBookedPrescriptions()
  const result = booked.map((rx) => {
    const booking = getBookingByPrescription(rx.id)
    const locker = booking ? getLockerByBooking(booking.id) : null
    const qr = booking ? getQRByBooking(booking.id) : null
    return { prescription: rx, booking, locker, qr }
  })
  return { items: result }
}

export async function getAvailableLockerList() {
  const session = await getSession()
  if (!session || session.role !== "pharmacy_staff") return { error: "Unauthorized" }
  return { lockers: getAvailableLockers() }
}

export async function assignLockerToBooking(bookingId: string, lockerId: string) {
  const session = await getSession()
  if (!session || session.role !== "pharmacy_staff") return { error: "Unauthorized" }

  const booking = getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  const locker = assignLocker(lockerId, bookingId)
  if (!locker) return { error: "Locker not found" }

  updateBookingStatus(bookingId, "locker_assigned")

  addAuditLog(session.id, session.name, "Locker Assigned", `Locker ${locker.label} assigned to booking ${bookingId}`)

  return { locker }
}

export async function markBookingReady(bookingId: string) {
  const session = await getSession()
  if (!session || session.role !== "pharmacy_staff") return { error: "Unauthorized" }

  const booking = getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  updateBookingStatus(bookingId, "ready")
  const rx = getPrescriptionById(booking.prescriptionId)
  if (rx) updatePrescriptionStatus(rx.id, "ready")

  // Generate QR code
  const qr = createQRCode(bookingId, 60)

  // Send real email notification
  if (rx) {
    const emailBody = generatePickupReadyEmail(
      rx.patientName,
      rx.medications,
      booking.pickupTime,
      booking.pharmacyName,
      qr.token
    )
    
    // Send real email via Resend
    const emailResult = await sendEmail({
      to: booking.patientEmail,
      subject: "Your Prescription is Ready for Pickup",
      html: emailBody,
    })
    
    // Log the email (for audit purposes)
    addEmailLog(booking.patientEmail, "Your Prescription is Ready for Pickup", emailBody)
    
    if (!emailResult.success) {
      console.error("[Actions] Failed to send pickup email:", emailResult.error)
    }
  }

  addAuditLog(session.id, session.name, "Booking Ready", `Booking ${bookingId} marked as ready. QR code generated.`)

  return { qr }
}

export async function generateStaffQR(bookingId: string) {
  const session = await getSession()
  if (!session || session.role !== "pharmacy_staff") return { error: "Unauthorized" }

  const qr = createQRCode(bookingId, 30)
  addAuditLog(session.id, session.name, "Staff QR Generated", `Staff QR code for booking ${bookingId}`)
  return { qr }
}

// --- Patient Actions ---

export async function getPatientDashboard() {
  const session = await getSession()
  if (!session || session.role !== "patient") return { error: "Unauthorized" }

  const prescriptions = getPrescriptionsByPatient(session.id)
  const items = prescriptions.map((rx) => {
    const booking = getBookingByPrescription(rx.id)
    const qr = booking ? getQRByBooking(booking.id) : null
    const locker = booking ? getLockerByBooking(booking.id) : null
    return { prescription: rx, booking, qr, locker }
  })

  return { items, patientName: session.name }
}

export async function scanQRCode(token: string) {
  const session = await getSession()
  if (!session || session.role !== "patient") return { error: "Unauthorized" }

  const qr = getQRByToken(token)
  if (!qr) return { error: "Invalid QR code" }
  if (qr.used) return { error: "This QR code has already been used" }
  if (new Date(qr.expiresAt) < new Date()) {
    // Expire the booking
    const booking = getBookingById(qr.bookingId)
    if (booking) {
      updateBookingStatus(booking.id, "expired")
      const rx = getPrescriptionById(booking.prescriptionId)
      if (rx) updatePrescriptionStatus(rx.id, "expired")

      // Send rebooking email
      const medNames = rx?.medications.map((m) => m.name).join(", ") || ""
      const emailBody = generateExpiredEmailTemplate(rx?.patientName || "Patient", medNames)
      
      await sendEmail({
        to: booking.patientEmail,
        subject: "QR Code Expired - Rebooking Required",
        html: emailBody,
      })
      
      addEmailLog(booking.patientEmail, "QR Code Expired - Rebooking Required", emailBody)
    }
    return { error: "QR code has expired. A rebooking email has been sent." }
  }

  // Mark QR as used
  markQRUsed(qr.id)

  // Unlock locker
  const booking = getBookingById(qr.bookingId)
  if (!booking) return { error: "Booking not found" }

  const locker = getLockerByBooking(booking.id)
  if (locker) {
    unlockLocker(locker.id)
    addAuditLog(session.id, session.name, "Locker Accessed", `Locker ${locker.label} unlocked for booking ${booking.id}`)
  }

  return { success: true, lockerLabel: locker?.label || "Unknown" }
}

export async function closeLocker(bookingId: string) {
  const session = await getSession()
  if (!session || session.role !== "patient") return { error: "Unauthorized" }

  const booking = getBookingById(bookingId)
  if (!booking) return { error: "Booking not found" }

  updateBookingStatus(bookingId, "collected")
  const rx = getPrescriptionById(booking.prescriptionId)
  if (rx) updatePrescriptionStatus(rx.id, "collected")

  const locker = getLockerByBooking(bookingId)
  if (locker) {
    releaseLocker(locker.id)
    addAuditLog(session.id, session.name, "Locker Closed", `Locker ${locker.label} released after collection for booking ${bookingId}`)
  }

  return { success: true }
}

// --- Audit & Email Logs ---

export async function fetchAuditLogs() {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }
  return { logs: getAuditLogs() }
}

export async function fetchEmailLogs() {
  const session = await getSession()
  if (!session) return { error: "Unauthorized" }
  return { logs: getEmailLogs() }
}

// --- Email Templates ---

// --- Patient Refill Request Action ---

export async function requestPrescriptionRefill(prescriptionId: string, reason: string) {
  const session = await getSession()
  if (!session || session.role !== "patient") return { error: "Unauthorized" }

  const prescription = getPrescriptionById(prescriptionId)
  if (!prescription) return { error: "Prescription not found" }
  if (prescription.patientId !== session.id) return { error: "Unauthorized" }

  // Check if there's already a pending refill request for this prescription
  const existingRequests = getRefillRequestsByPatient(session.id)
  const pendingRequest = existingRequests.find(
    (r) => r.prescriptionId === prescriptionId && r.status === "pending"
  )
  if (pendingRequest) return { error: "A refill request is already pending for this prescription" }

  const request = createRefillRequest({
    prescriptionId,
    patientId: session.id,
    patientName: prescription.patientName,
    patientEmail: session.email,
    doctorId: prescription.doctorId,
    medications: prescription.medications,
    reason,
    status: "pending",
  })

  const medSummary = prescription.medications.map((m) => m.name).join(", ")
  addAuditLog(session.id, session.name, "Refill Requested", `Refill request ${request.id} for ${medSummary}`)

  return { request }
}

export async function getPatientRefillRequests() {
  const session = await getSession()
  if (!session || session.role !== "patient") return { error: "Unauthorized" }
  return { requests: getRefillRequestsByPatient(session.id) }
}

export async function patientBookPrescription(
  prescriptionId: string,
  pickupTime: string,
  pharmacyName: string
) {
  const session = await getSession()
  if (!session || session.role !== "patient") return { error: "Unauthorized" }

  const rx = getPrescriptionById(prescriptionId)
  if (!rx) return { error: "Prescription not found" }
  if (rx.patientId !== session.id) return { error: "Unauthorized" }
  if (rx.status !== "confirmed") return { error: "Prescription is not available for booking" }

  const booking = createBooking({
    prescriptionId,
    patientEmail: session.email,
    pickupTime,
    pharmacyName,
    clinicStaffId: session.id, // Patient booking themselves
    status: "pending",
  })

  updatePrescriptionStatus(prescriptionId, "booked")

  const medSummary = rx.medications.map((m) => m.name).join(", ")
  addAuditLog(session.id, session.name, "Patient Booking", `Booked prescription ${prescriptionId} for ${medSummary} at ${pharmacyName}`)

  // Send real confirmation email
  const emailBody = generateBookingConfirmationEmail(session.name, medSummary, pickupTime, pharmacyName)
  
  const emailResult = await sendEmail({
    to: session.email,
    subject: "Prescription Pickup Booking Confirmed",
    html: emailBody,
  })
  
  addEmailLog(session.email, "Prescription Pickup Booking Confirmed", emailBody)
  
  if (!emailResult.success) {
    console.error("[Actions] Failed to send booking confirmation email:", emailResult.error)
  }

  return { booking }
}
