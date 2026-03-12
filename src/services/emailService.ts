// Email Service using Resend
// Layered Architecture: Service Layer

import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

// Default sender email - update this to your verified domain
const FROM_EMAIL = process.env.FROM_EMAIL || "SMART Dispensary <onboarding@resend.dev>"

export interface EmailOptions {
  to: string
  subject: string
  html: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
    })

    if (error) {
      console.error("[EmailService] Failed to send email:", error)
      return { success: false, error: error.message }
    }

    console.log("[EmailService] Email sent successfully:", data?.id)
    return { success: true, messageId: data?.id }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error("[EmailService] Exception sending email:", errorMessage)
    return { success: false, error: errorMessage }
  }
}

// Email Templates
export function generatePickupReadyEmail(
  patientName: string,
  medications: { name: string; dosage: string }[],
  pickupTime: string,
  pharmacyName: string,
  qrToken: string
): string {
  const medList = medications
    .map((m) => `<p><strong>${m.name}</strong> &mdash; ${m.dosage}</p>`)
    .join("")
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0f766e;">Your Prescription is Ready</h2>
  <p>Dear ${patientName},</p>
  <p>Your prescription is ready for pickup at <strong>${pharmacyName}</strong>.</p>
  <div style="background: #f0fdfa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p style="margin-bottom: 4px;"><strong>Medications:</strong></p>
    ${medList}
    <p><strong>Pickup Time:</strong> ${pickupTime}</p>
    <p><strong>Location:</strong> ${pharmacyName}</p>
  </div>
  <div style="background: #e2e8f0; padding: 16px; border-radius: 8px; margin: 16px 0; text-align: center;">
    <p style="margin-bottom: 8px;"><strong>Your QR Code Token:</strong></p>
    <code style="background: #fff; padding: 8px 16px; border-radius: 4px; font-size: 18px; letter-spacing: 2px;">${qrToken}</code>
  </div>
  <p>Please present this QR code at the pharmacy locker to collect your medication.</p>
  <p style="color: #64748b; font-size: 12px;">This QR code expires in 60 minutes from the time of generation.</p>
</div>`
}

export function generateExpiredEmail(patientName: string, medications: string): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">QR Code Expired - Rebooking Required</h2>
  <p>Dear ${patientName},</p>
  <p>Your QR code for collecting <strong>${medications}</strong> has expired.</p>
  <p>Your locker access has been disabled for security purposes. Please contact the clinic to arrange a new pickup time.</p>
  <p style="color: #64748b; font-size: 12px;">If you have any questions, please contact your healthcare provider.</p>
</div>`
}

export function generateRefillApprovedEmail(patientName: string, medications: string): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0f766e;">Prescription Refill Approved</h2>
  <p>Dear ${patientName},</p>
  <p>Your prescription refill request for <strong>${medications}</strong> has been approved by your doctor.</p>
  <p>A new prescription has been created and is now ready for scheduling. Please log in to your patient portal to book your pickup time slot.</p>
  <div style="background: #f0fdfa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p><strong>Next Steps:</strong></p>
    <ol>
      <li>Log in to your patient portal</li>
      <li>Select a pharmacy and pickup time</li>
      <li>Wait for your QR code when the prescription is ready</li>
    </ol>
  </div>
  <p style="color: #64748b; font-size: 12px;">If you have any questions, please contact your healthcare provider.</p>
</div>`
}

export function generateRefillRejectedEmail(patientName: string, medications: string, reason: string): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">Prescription Refill Request Declined</h2>
  <p>Dear ${patientName},</p>
  <p>Your prescription refill request for <strong>${medications}</strong> has been declined by your doctor.</p>
  <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #dc2626;">
    <p><strong>Reason:</strong></p>
    <p>${reason}</p>
  </div>
  <p>Please schedule an appointment with your doctor to discuss your medication needs.</p>
  <p style="color: #64748b; font-size: 12px;">If you have any questions, please contact your healthcare provider.</p>
</div>`
}

export function generateBookingConfirmationEmail(
  patientName: string,
  medications: string,
  pickupTime: string,
  pharmacyName: string
): string {
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0f766e;">Pickup Booking Confirmed</h2>
  <p>Dear ${patientName},</p>
  <p>Your prescription pickup has been scheduled successfully.</p>
  <div style="background: #f0fdfa; padding: 16px; border-radius: 8px; margin: 16px 0;">
    <p><strong>Medications:</strong> ${medications}</p>
    <p><strong>Pharmacy:</strong> ${pharmacyName}</p>
    <p><strong>Pickup Time:</strong> ${pickupTime}</p>
  </div>
  <p>You will receive another email with your QR code once the pharmacy has prepared your medication.</p>
  <p style="color: #64748b; font-size: 12px;">If you have any questions, please contact your healthcare provider.</p>
</div>`
}
