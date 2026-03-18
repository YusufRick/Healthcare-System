"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  User,
  QrCode,
  Package,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  XCircle,
  RefreshCw,
  Send,
  Loader2,
  CalendarClock,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getPatientDashboard,
  scanQRCode,
  closeLocker,
  requestPrescriptionRefill,
  getPatientRefillRequests,
  patientBookPrescription,
} from "@/lib/actions"
import type {
  Prescription,
  Booking,
  QRCode as QRCodeType,
  Locker,
  RefillRequest,
} from "@/lib/types"
import useSWR from "swr"

const PHARMACIES = [
  "Central Pharmacy - Main Building",
  "West Wing Pharmacy",
  "North Campus Pharmacy",
]

const TIME_SLOTS = [
  "09:00 - 10:00",
  "10:00 - 11:00",
  "11:00 - 12:00",
  "13:00 - 14:00",
  "14:00 - 15:00",
  "15:00 - 16:00",
  "16:00 - 17:00",
]

interface PatientItem {
  prescription: Prescription
  booking: Booking | null
  qr: QRCodeType | null
  locker: Locker | null
}

type PatientDashboardData = {
  items: PatientItem[]
  patientName: string
}

function usePatientData() {
  return useSWR<PatientDashboardData>("patient-dashboard", async () => {
    const res = await getPatientDashboard()
    if (res.error) throw new Error(res.error)
    return {
      items: (res.items || []) as PatientItem[],
      patientName: res.patientName || "",
    }
  })
}

function useRefillRequests() {
  return useSWR<RefillRequest[]>("patient-refill-requests", async () => {
    const res = await getPatientRefillRequests()
    if (res.error) throw new Error(res.error)
    return (res.requests || []) as RefillRequest[]
  })
}

export function PatientDashboard() {
  const { data, mutate } = usePatientData()
  const { data: refillRequests = [], mutate: mutateRefills } = useRefillRequests()

  const items = data?.items || []

  const [scanToken, setScanToken] = useState("")
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    success?: boolean
    lockerLabel?: string
    error?: string
  } | null>(null)

  const [showScanDialog, setShowScanDialog] = useState(false)
  const [showRefillDialog, setShowRefillDialog] = useState(false)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)
  const [refillReason, setRefillReason] = useState("")
  const [submittingRefill, setSubmittingRefill] = useState(false)

  const [showBookingDialog, setShowBookingDialog] = useState(false)
  const [bookingPrescription, setBookingPrescription] = useState<Prescription | null>(null)
  const [pickupDate, setPickupDate] = useState("")
  const [pickupTime, setPickupTime] = useState("")
  const [pharmacyName, setPharmacyName] = useState("")
  const [submittingBooking, setSubmittingBooking] = useState(false)

  async function handleScan() {
    if (!scanToken.trim()) {
      toast.error("Please enter a QR code token")
      return
    }

    setScanning(true)
    try {
      const res = await scanQRCode(scanToken.trim())
      if (res.error) {
        setScanResult({ error: res.error })
        toast.error(res.error)
      } else {
        setScanResult({ success: true, lockerLabel: res.lockerLabel })
        toast.success(`Locker ${res.lockerLabel} unlocked!`)
        mutate()
      }
    } finally {
      setScanning(false)
    }
  }

  async function handleCloseLocker(bookingId: string) {
    try {
      const res = await closeLocker(bookingId)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Locker closed. Medication collected successfully!")
        setScanResult(null)
        setScanToken("")
        mutate()
      }
    } catch {
      toast.error("Failed to close locker")
    }
  }

  function openRefillDialog(prescription: Prescription) {
    setSelectedPrescription(prescription)
    setRefillReason("")
    setShowRefillDialog(true)
  }

  function openBookingDialog(prescription: Prescription) {
    setBookingPrescription(prescription)
    setPickupDate("")
    setPickupTime("")
    setPharmacyName("")
    setShowBookingDialog(true)
  }

  async function handleSubmitBooking() {
    if (!bookingPrescription || !pickupDate || !pickupTime || !pharmacyName) {
      toast.error("Please fill in all fields")
      return
    }

    setSubmittingBooking(true)
    try {
      const formattedPickup = `${pickupDate} ${pickupTime}`
      const res = await patientBookPrescription(
        bookingPrescription.id,
        formattedPickup,
        pharmacyName
      )

      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Pickup booked successfully!")
        setShowBookingDialog(false)
        setBookingPrescription(null)
        mutate()
      }
    } catch {
      toast.error("Failed to book pickup")
    } finally {
      setSubmittingBooking(false)
    }
  }

  async function handleSubmitRefill() {
    if (!selectedPrescription || !refillReason.trim()) {
      toast.error("Please provide a reason for the refill request")
      return
    }

    setSubmittingRefill(true)
    try {
      const res = await requestPrescriptionRefill(
        selectedPrescription.id,
        refillReason.trim()
      )

      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Refill request submitted successfully!")
        setShowRefillDialog(false)
        setSelectedPrescription(null)
        setRefillReason("")
        mutateRefills()
      }
    } catch {
      toast.error("Failed to submit refill request")
    } finally {
      setSubmittingRefill(false)
    }
  }

  function hasPendingRefill(prescriptionId: string): boolean {
    return (
      refillRequests.some(
        (r) => r.prescriptionId === prescriptionId && r.status === "pending"
      ) || false
    )
  }

  function getRefillRequestStatus(prescriptionId: string): RefillRequest | undefined {
    return refillRequests.find((r) => r.prescriptionId === prescriptionId)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <User className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Patient Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              View your prescriptions and collect medication
            </p>
          </div>
        </div>
        <Button onClick={() => setShowScanDialog(true)}>
          <QrCode className="mr-1.5 h-4 w-4" />
          Scan QR Code
        </Button>
      </div>

      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
            <DialogDescription>
              Enter the QR code token from your email to unlock the locker
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qr-token">QR Code Token</Label>
              <Input
                id="qr-token"
                placeholder="Paste your QR token here..."
                value={scanToken}
                onChange={(e) => setScanToken(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleScan} disabled={scanning} className="w-full">
              {scanning ? "Validating..." : "Validate & Unlock Locker"}
            </Button>

            {scanResult && (
              <div
                className={`rounded-lg p-4 ${
                  scanResult.success
                    ? "border border-[hsl(152,60%,40%)] bg-[hsl(152,40%,95%)]"
                    : "border border-destructive bg-[hsl(0,70%,97%)]"
                }`}
              >
                {scanResult.success ? (
                  <div className="space-y-3 text-center">
                    <Unlock className="mx-auto h-10 w-10 text-[hsl(152,60%,40%)]" />
                    <div>
                      <p className="font-medium text-[hsl(152,60%,25%)]">Locker Unlocked!</p>
                      <p className="text-sm text-[hsl(152,60%,30%)]">
                        {scanResult.lockerLabel} is now open. Please collect your medication.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-center">
                    <XCircle className="mx-auto h-10 w-10 text-destructive" />
                    <p className="font-medium text-destructive">{scanResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRefillDialog} onOpenChange={setShowRefillDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Prescription Refill</DialogTitle>
            <DialogDescription>
              Submit a refill request for your medication. Your doctor will review and approve or decline the request.
            </DialogDescription>
          </DialogHeader>
          {selectedPrescription && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-foreground">Medications to refill:</p>
                <ul className="mt-2 space-y-1">
                  {selectedPrescription.medications.map((med, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {med.name} - {med.dosage}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refill-reason">Reason for Refill</Label>
                <Textarea
                  id="refill-reason"
                  placeholder="Please explain why you need a refill (e.g., medication running low, continuing treatment...)"
                  value={refillReason}
                  onChange={(e) => setRefillReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefillDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitRefill} disabled={submittingRefill || !refillReason.trim()}>
              {submittingRefill ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-1.5 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book Prescription Pickup</DialogTitle>
            <DialogDescription>
              Select a pharmacy and time slot for your medication pickup.
            </DialogDescription>
          </DialogHeader>
          {bookingPrescription && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-foreground">Medications:</p>
                <ul className="mt-2 space-y-1">
                  {bookingPrescription.medications.map((med, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground">
                      {med.name} - {med.dosage}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pharmacy">Pharmacy</Label>
                <Select value={pharmacyName} onValueChange={setPharmacyName}>
                  <SelectTrigger id="pharmacy">
                    <SelectValue placeholder="Select pharmacy" />
                  </SelectTrigger>
                  <SelectContent>
                    {PHARMACIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {p}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup-date">Pickup Date</Label>
                <Input
                  id="pickup-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pickup-time">Time Slot</Label>
                <Select value={pickupTime} onValueChange={setPickupTime}>
                  <SelectTrigger id="pickup-time">
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {t}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitBooking}
              disabled={submittingBooking || !pickupDate || !pickupTime || !pharmacyName}
            >
              {submittingBooking ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Booking...
                </>
              ) : (
                <>
                  <CalendarClock className="mr-1.5 h-4 w-4" />
                  Confirm Booking
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="prescriptions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prescriptions">My Prescriptions</TabsTrigger>
          <TabsTrigger value="refill-requests">
            Refill Requests
            {refillRequests.filter((r) => r.status === "pending").length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {refillRequests.filter((r) => r.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prescriptions" className="space-y-4">
          {items.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Prescriptions Yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When your doctor creates a prescription, it will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <PatientPrescriptionCard
                  key={item.prescription.id}
                  item={item}
                  onCloseLocker={handleCloseLocker}
                  onRequestRefill={openRefillDialog}
                  onBookPrescription={openBookingDialog}
                  hasPendingRefill={hasPendingRefill(item.prescription.id)}
                  refillRequest={getRefillRequestStatus(item.prescription.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="refill-requests" className="space-y-4">
          {refillRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <RefreshCw className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Refill Requests</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can request refills for collected prescriptions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {refillRequests.map((request) => (
                <RefillRequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PatientPrescriptionCard({
  item,
  onCloseLocker,
  onRequestRefill,
  onBookPrescription,
  hasPendingRefill,
  refillRequest,
}: {
  item: PatientItem
  onCloseLocker: (bookingId: string) => void
  onRequestRefill: (prescription: Prescription) => void
  onBookPrescription: (prescription: Prescription) => void
  hasPendingRefill: boolean
  refillRequest?: RefillRequest
}) {
  const { prescription: rx, booking, locker } = item
  const canRequestRefill = rx.status === "collected" && !hasPendingRefill

  const statusSteps = [
    { key: "confirmed", label: "Prescribed", icon: CheckCircle2, done: true },
    { key: "booked", label: "Booked", icon: Clock, done: ["booked", "ready", "collected"].includes(rx.status) },
    { key: "ready", label: "Ready", icon: Package, done: ["ready", "collected"].includes(rx.status) },
    { key: "collected", label: "Collected", icon: CheckCircle2, done: rx.status === "collected" },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">
              {rx.medications.map((m) => m.name).join(", ")}
            </CardTitle>
            <CardDescription>
              {rx.medications.map((m) => `${m.name}: ${m.dosage}`).join(" | ")}
            </CardDescription>
          </div>
          <PrescriptionStatusBadge status={rx.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          {statusSteps.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.key} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 ${step.done ? "text-primary" : "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{step.label}</span>
                </div>
                {i < statusSteps.length - 1 && (
                  <div className={`ml-2 h-px w-8 ${step.done ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            )
          })}
        </div>

        {booking && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Pharmacy</p>
                <p className="font-medium text-foreground">{booking.pharmacyName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pickup Time</p>
                <p className="font-medium text-foreground">{booking.pickupTime}</p>
              </div>
            </div>
          </div>
        )}

        {locker && locker.status === "unlocked" && booking && (
          <div className="rounded-lg border border-[hsl(152,60%,40%)] bg-[hsl(152,40%,95%)] p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Unlock className="h-6 w-6 text-[hsl(152,60%,40%)]" />
                <div>
                  <p className="font-medium text-[hsl(152,60%,25%)]">Locker {locker.label} is Open</p>
                  <p className="text-sm text-[hsl(152,60%,30%)]">Please collect your medication</p>
                </div>
              </div>
              <Button size="sm" onClick={() => onCloseLocker(booking.id)}>
                <Lock className="mr-1.5 h-4 w-4" />
                Close Locker
              </Button>
            </div>
          </div>
        )}

        {rx.status === "confirmed" && !booking && (
          <Button variant="outline" className="w-full" onClick={() => onBookPrescription(rx)}>
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Book Pickup
          </Button>
        )}

        {canRequestRefill && (
          <Button variant="outline" className="w-full" onClick={() => onRequestRefill(rx)}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Request Refill
          </Button>
        )}

        {refillRequest && refillRequest.status === "pending" && (
          <div className="rounded-lg border border-[hsl(37,80%,60%)] bg-[hsl(37,80%,95%)] p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[hsl(37,90%,30%)]" />
              <p className="text-sm font-medium text-[hsl(37,90%,25%)]">
                Refill request pending doctor approval
              </p>
            </div>
          </div>
        )}

        {refillRequest && refillRequest.status === "rejected" && (
          <div className="rounded-lg border border-destructive bg-[hsl(0,70%,97%)] p-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Refill request declined</p>
                {refillRequest.rejectionReason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reason: {refillRequest.rejectionReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PrescriptionStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    confirmed: "bg-[hsl(200,80%,92%)] text-[hsl(200,80%,30%)]",
    booked: "bg-[hsl(173,40%,92%)] text-[hsl(173,58%,22%)]",
    ready: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    collected: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    expired: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  const labels: Record<string, string> = {
    confirmed: "Awaiting Booking",
    booked: "Booked",
    ready: "Ready for Pickup",
    collected: "Collected",
    expired: "Expired",
  }

  return <Badge className={variants[status] || ""}>{labels[status] || status}</Badge>
}

function RefillRequestCard({ request }: { request: RefillRequest }) {
  const statusVariants: Record<string, string> = {
    pending: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    approved: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    rejected: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  const statusLabels: Record<string, string> = {
    pending: "Pending Review",
    approved: "Approved",
    rejected: "Declined",
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {request.medications.map((m) => m.name).join(", ")}
            </p>
            <p className="text-sm text-muted-foreground">
              Requested: {new Date(request.createdAt).toLocaleDateString()}
            </p>
            <p className="text-sm text-muted-foreground">Reason: {request.reason}</p>
          </div>
          <Badge className={statusVariants[request.status]}>
            {statusLabels[request.status]}
          </Badge>
        </div>

        {request.status === "rejected" && request.rejectionReason && (
          <div className="mt-3 rounded-lg border border-destructive bg-[hsl(0,70%,97%)] p-2">
            <p className="text-sm text-destructive">
              <span className="font-medium">Reason:</span> {request.rejectionReason}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}