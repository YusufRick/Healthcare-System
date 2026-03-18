"use client"

import React, { useState } from "react"
import { toast } from "sonner"
import {
  Building2,
  CalendarClock,
  Send,
  ClipboardList,
  CheckCircle2,
  Clock,
  Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { RiskDisplay } from "@/components/risk/risk-display"
import {
  getClinicPrescriptions,
  submitBooking,
  getClinicPrescriptionHistory,
} from "@/lib/actions"
import type { Prescription, Booking } from "@/lib/types"
import useSWR, { useSWRConfig } from "swr"

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

interface HistoryItem {
  prescription: Prescription
  booking: Booking | null
}

function useClinicPrescriptions() {
  return useSWR<Prescription[]>("clinic-prescriptions", async () => {
    const res = await getClinicPrescriptions()
    if (res.error) throw new Error(res.error)
    return (res.prescriptions || []) as Prescription[]
  })
}

function usePrescriptionHistory() {
  return useSWR<HistoryItem[]>("clinic-prescription-history", async () => {
    const res = await getClinicPrescriptionHistory()
    if (res.error) throw new Error(res.error)
    return (res.history || []) as HistoryItem[]
  })
}

export function ClinicDashboard() {
  const { data: prescriptions = [], mutate } = useClinicPrescriptions()
  const { data: history = [] } = usePrescriptionHistory()

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">Clinic Staff Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Manage confirmed prescriptions and create pickup bookings
          </p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending">
            <CalendarClock className="mr-1.5 h-4 w-4" />
            Pending Bookings
            {prescriptions.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {prescriptions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Prescription History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {prescriptions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Confirmed Prescriptions</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Waiting for doctors to confirm prescriptions. They will appear here for booking.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {prescriptions.length} confirmed prescription(s) awaiting booking
              </p>
              {prescriptions.map((rx) => (
                <PrescriptionBookingCard
                  key={rx.id}
                  prescription={rx}
                  onBooked={() => mutate()}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Prescription History</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Prescription history will appear here once prescriptions are created.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Showing all {history.length} prescription(s)
              </p>
              {history.map((item) => (
                <PrescriptionHistoryCard key={item.prescription.id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PrescriptionBookingCard({
  prescription,
  onBooked,
}: {
  prescription: Prescription
  onBooked: () => void
}) {
  const { mutate: globalMutate } = useSWRConfig()
  const [open, setOpen] = useState(false)
  const [patientEmail, setPatientEmail] = useState("")
  const [pickupDate, setPickupDate] = useState("")
  const [pickupTime, setPickupTime] = useState("")
  const [pharmacyName, setPharmacyName] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!patientEmail || !pickupDate || !pickupTime || !pharmacyName) {
      toast.error("Please fill in all fields")
      return
    }

    setLoading(true)
    try {
      const formattedPickup = `${pickupDate} ${pickupTime}`
      const res = await submitBooking(
        prescription.id,
        patientEmail,
        formattedPickup,
        pharmacyName
      )

      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Booking created successfully")
        setOpen(false)
        setPatientEmail("")
        setPickupDate("")
        setPickupTime("")
        setPharmacyName("")
        onBooked()
        globalMutate("clinic-prescription-history")
        globalMutate("audit-logs")
        globalMutate("email-logs")
      }
    } finally {
      setLoading(false)
    }
  }

  const medSummary = prescription.medications.map((m) => m.name).join(", ")

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="font-medium text-card-foreground">{prescription.patientName}</p>
              <Badge className="bg-[hsl(200,80%,92%)] text-[hsl(200,80%,30%)] text-xs">
                Confirmed
              </Badge>
            </div>

            <div className="space-y-0.5">
              {prescription.medications.map((med, i) => (
                <p key={i} className="text-sm text-foreground">
                  <span className="font-medium">{med.name}</span> &mdash; {med.dosage}
                </p>
              ))}
            </div>

            {prescription.notes && (
              <p className="text-sm text-muted-foreground">Notes: {prescription.notes}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Prescribed: {new Date(prescription.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {prescription.riskAssessment && (
              <RiskDisplay assessment={prescription.riskAssessment} compact />
            )}

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Send className="mr-1.5 h-4 w-4" />
                  Create Booking
                </Button>
              </DialogTrigger>

              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Pickup Booking</DialogTitle>
                  <DialogDescription>
                    Schedule pickup for {prescription.patientName} &mdash; {medSummary}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="patient-email">Patient Email</Label>
                    <Input
                      id="patient-email"
                      type="email"
                      placeholder="patient@email.com"
                      value={patientEmail}
                      onChange={(e) => setPatientEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="pickup-date">Pickup Date</Label>
                      <Input
                        id="pickup-date"
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        min={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Time Slot</Label>
                      <Select value={pickupTime} onValueChange={setPickupTime}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map((slot) => (
                            <SelectItem key={slot} value={slot}>
                              {slot}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Pharmacy</Label>
                    <Select value={pharmacyName} onValueChange={setPharmacyName}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select pharmacy" />
                      </SelectTrigger>
                      <SelectContent>
                        {PHARMACIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {prescription.riskAssessment && (
                    <div className="pt-2">
                      <Label className="mb-2 block text-xs text-muted-foreground">
                        Risk Assessment (read-only)
                      </Label>
                      <RiskDisplay assessment={prescription.riskAssessment} compact />
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating booking..." : "Submit Booking"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PrescriptionHistoryCard({ item }: { item: HistoryItem }) {
  const { prescription: rx, booking } = item

  const statusVariants: Record<string, string> = {
    confirmed: "bg-[hsl(200,80%,92%)] text-[hsl(200,80%,30%)]",
    booked: "bg-[hsl(173,40%,92%)] text-[hsl(173,58%,22%)]",
    ready: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    collected: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    expired: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  const statusLabels: Record<string, string> = {
    confirmed: "Awaiting Booking",
    booked: "Booked",
    ready: "Ready for Pickup",
    collected: "Collected",
    expired: "Expired",
  }

  const statusIcons: Record<string, React.ReactNode> = {
    confirmed: <Clock className="h-3 w-3" />,
    booked: <CalendarClock className="h-3 w-3" />,
    ready: <Package className="h-3 w-3" />,
    collected: <CheckCircle2 className="h-3 w-3" />,
    expired: <Clock className="h-3 w-3" />,
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <p className="font-medium text-card-foreground">{rx.patientName}</p>
              <Badge className={`text-xs ${statusVariants[rx.status] || ""}`}>
                <span className="mr-1">{statusIcons[rx.status]}</span>
                {statusLabels[rx.status] || rx.status}
              </Badge>
            </div>

            <div className="space-y-0.5">
              {rx.medications.map((med, i) => (
                <p key={i} className="text-sm text-foreground">
                  <span className="font-medium">{med.name}</span> &mdash; {med.dosage}
                </p>
              ))}
            </div>

            {rx.notes && (
              <p className="text-sm text-muted-foreground">Notes: {rx.notes}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Prescribed: {new Date(rx.createdAt).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {rx.riskAssessment && (
              <RiskDisplay assessment={rx.riskAssessment} compact />
            )}
          </div>
        </div>

        {booking && (
          <div className="mt-3 grid grid-cols-3 gap-4 rounded-lg bg-muted p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Pickup Time</p>
              <p className="font-medium text-foreground">{booking.pickupTime}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pharmacy</p>
              <p className="font-medium text-foreground">{booking.pharmacyName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Patient Email</p>
              <p className="font-medium text-foreground">{booking.patientEmail}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}