"use client"

import React, { useState, useCallback } from "react"
import { toast } from "sonner"
import { collection, query, where, getDocs, addDoc } from "firebase/firestore"
import { db } from "@/src/config/firebase"
import {
  Stethoscope,
  Plus,
  ClipboardList,
  Search,
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { RiskDisplay } from "@/components/risk/risk-display"
import {
  runRiskAssessment,
  approveRefillRequest,
  rejectRefillRequest,
} from "@/lib/actions"
import type {
  Prescription,
  MedicationItem,
  RefillRequest,
  PrescribedMedication,
  RiskAssessmentResult,
} from "@/lib/types"
import useSWR, { useSWRConfig } from "swr"

type DoctorContext = {
  id: string
  name: string
}

const AVAILABLE_MEDICATIONS = [
  "Amoxicillin",
  "Penicillin",
  "Ibuprofen",
  "Aspirin",
  "Metformin",
  "Lisinopril",
  "Warfarin",
  "Methotrexate",
  "Atorvastatin",
  "Omeprazole",
  "Ciprofloxacin",
  "Prednisone",
]

type PatientSummary = {
  id: string
  name: string
  email: string
  allergies: string[]
}

function usePatientsData() {
  return useSWR<PatientSummary[]>("doctor-patients", async () => {
    const q = query(collection(db, "users"), where("role", "==", "patient"))
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => {
      const data = doc.data() as {
        name?: string
        email?: string
        allergies?: unknown
      }

      return {
        id: doc.id,
        name: data.name ?? "",
        email: data.email ?? "",
        allergies: Array.isArray(data.allergies)
          ? data.allergies.filter((a): a is string => typeof a === "string")
          : [],
      }
    })
  })
}

function usePrescriptionsData(doctorId: string) {
  return useSWR<Prescription[]>(
    doctorId ? ["doctor-prescriptions", doctorId] : null,
    async () => {
      try {
        console.log("doctorId used for query:", doctorId)

        const q = query(
          collection(db, "prescriptions"),
          where("doctorId", "==", doctorId)
        )

        const snapshot = await getDocs(q)

        console.log("prescriptions found:", snapshot.size)
        console.log(
          "prescription docs:",
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        )

        return snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Prescription, "id">),
        }))
      } catch (error) {
        console.error("Failed to load prescriptions:", error)
        throw error
      }
    }
  )
}

function useRefillRequestsData(doctorId: string) {
  return useSWR<RefillRequest[]>(
    doctorId ? ["doctor-refill-requests", doctorId] : null,
    async () => {
      const q = query(
        collection(db, "refillRequests"),
        where("doctorId", "==", doctorId),
        where("status", "==", "pending")
      )

      const snapshot = await getDocs(q)

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<RefillRequest, "id">),
      }))
    }
  )
}

export function DoctorDashboard({ doctor }: { doctor: DoctorContext }) {
  const { data: patients = [] } = usePatientsData()
const {
  data: prescriptions = [],
  mutate: mutatePrescriptions,
  error: prescriptionsError,
} = usePrescriptionsData(doctor.id)
  const { data: refillRequests = [], mutate: mutateRefillRequests } = useRefillRequestsData(doctor.id)
  const { mutate: globalMutate } = useSWRConfig()

  const [selectedPatientId, setSelectedPatientId] = useState("")
  const [medications, setMedications] = useState<MedicationItem[]>([{ name: "", dosage: "" }])
  const [notes, setNotes] = useState("")
  const [riskResult, setRiskResult] = useState<RiskAssessmentResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [assessing, setAssessing] = useState(false)

  const [selectedRefillRequest, setSelectedRefillRequest] = useState<RefillRequest | null>(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [processingRefill, setProcessingRefill] = useState<string | null>(null)

  const selectedPatient = patients.find((p) => p.id === selectedPatientId)
  const filledMedications = medications.filter((m) => m.name)

  function updateMedication(index: number, field: "name" | "dosage", value: string) {
    setMedications((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    setRiskResult(null)
  }

  function addMedication() {
    setMedications((prev) => [...prev, { name: "", dosage: "" }])
  }

  function removeMedication(index: number) {
    if (medications.length <= 1) return
    setMedications((prev) => prev.filter((_, i) => i !== index))
    setRiskResult(null)
  }

  const handleAssessRisk = useCallback(async () => {
    const medNames = medications.filter((m) => m.name).map((m) => m.name)

    if (medNames.length === 0 || !selectedPatientId) {
      toast.error("Select a patient and add at least one medication first")
      return
    }

    setAssessing(true)
    try {
      const res = await runRiskAssessment(medNames, selectedPatient?.allergies ?? [])
      if (res.error) {
        toast.error(res.error)
      } else if (res.assessment) {
        setRiskResult(res.assessment)

        if (res.assessment.status === "unsafe") {
          toast.warning("High risk detected. Review alerts before confirming.")
        } else if (res.assessment.status === "review") {
          toast.warning("Potential medication risks found. Please review the alerts.")
        } else {
          toast.success("Risk assessment completed.")
        }
      }
    } finally {
      setAssessing(false)
    }
  }, [medications, selectedPatientId, selectedPatient])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const validMeds = medications.filter((m) => m.name && m.dosage)

    if (!selectedPatientId || validMeds.length === 0) {
      toast.error("Please select a patient and add at least one medication with dosage")
      return
    }

    if (!selectedPatient) {
      toast.error("Patient not found")
      return
    }

    const formattedMeds: PrescribedMedication[] = validMeds.map((m, index) => ({
      medId: `manual-${index}`,
      name: m.name,
      dosage: m.dosage,
      frequency: "",
      duration: "",
      quantity: 0,
      instructions: "",
    }))

    setLoading(true)
    try {
      await addDoc(collection(db, "prescriptions"), {
        doctorId: doctor.id,
        patientId: selectedPatientId,
        patientName: selectedPatient.name,
        medications: formattedMeds,
        notes,
        riskAssessment: riskResult,
        status: "confirmed",
        createdAt: new Date().toISOString(),
      })

      await addDoc(collection(db, "auditLogs"), {
        userId: doctor.id,
        userName: doctor.name,
        action: "Prescription Confirmed",
        details: `Prescription for ${selectedPatient.name}: ${formattedMeds
          .map((m) => `${m.name} ${m.dosage}`)
          .join(", ")}`,
        timestamp: new Date().toISOString(),
      })

      if (riskResult) {
        await addDoc(collection(db, "auditLogs"), {
          userId: doctor.id,
          userName: doctor.name,
          action: "Risk Assessment",
          details: `Risk: ${riskResult.status} for ${formattedMeds
            .map((m) => `${m.name} ${m.dosage}`)
            .join(", ")} - ${selectedPatient.name}`,
          timestamp: new Date().toISOString(),
        })
      }

      toast.success("Prescription confirmed successfully")
      setSelectedPatientId("")
      setMedications([{ name: "", dosage: "" }])
      setNotes("")
      setRiskResult(null)
      mutatePrescriptions()
      globalMutate("audit-logs")
      globalMutate("email-logs")
    } catch (error) {
      console.error("Submit prescription failed:", error)
      toast.error("Failed to confirm prescription")
    } finally {
      setLoading(false)
    }
  }

  async function handleApproveRefill(requestId: string) {
    setProcessingRefill(requestId)
    try {
      const res = await approveRefillRequest(doctor.id, doctor.name, requestId)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Refill request approved! New prescription created.")
        mutateRefillRequests()
        mutatePrescriptions()
        globalMutate("audit-logs")
        globalMutate("email-logs")
      }
    } finally {
      setProcessingRefill(null)
    }
  }

  function openRejectDialog(request: RefillRequest) {
    setSelectedRefillRequest(request)
    setRejectionReason("")
    setShowRejectDialog(true)
  }

  async function handleRejectRefill() {
    if (!selectedRefillRequest || !rejectionReason.trim()) {
      toast.error("Please provide a reason for rejection")
      return
    }

    setProcessingRefill(selectedRefillRequest.id)
    try {
      const res = await rejectRefillRequest(
        doctor.id,
        doctor.name,
        selectedRefillRequest.id,
        rejectionReason.trim()
      )
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success("Refill request declined")
        setShowRejectDialog(false)
        setSelectedRefillRequest(null)
        setRejectionReason("")
        mutateRefillRequests()
        globalMutate("audit-logs")
        globalMutate("email-logs")
      }
    } finally {
      setProcessingRefill(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Stethoscope className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Doctor Dashboard</h2>
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">
            <Plus className="mr-1.5 h-4 w-4" />
            New Prescription
          </TabsTrigger>
          <TabsTrigger value="refill-requests">
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refill Requests
            {refillRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {refillRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            My Prescriptions ({prescriptions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create Prescription</CardTitle>
                <CardDescription>Select a patient and add one or more medications</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient</Label>
                    <Select
                      value={selectedPatientId}
                      onValueChange={(v) => {
                        setSelectedPatientId(v)
                        setRiskResult(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {!!selectedPatient && selectedPatient.allergies.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-xs text-muted-foreground">Allergies:</span>
                        {selectedPatient.allergies.map((a) => (
                          <Badge key={a} variant="destructive" className="text-xs">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Medications ({filledMedications.length} added)</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addMedication}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Medication
                      </Button>
                    </div>

                    {medications.map((med, index) => (
                      <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3">
                        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                          <div className="flex-1">
                            <Label className="mb-1 text-xs text-muted-foreground">Drug</Label>
                            <Select value={med.name} onValueChange={(v) => updateMedication(index, "name", v)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select medication" />
                              </SelectTrigger>
                              <SelectContent>
                                {AVAILABLE_MEDICATIONS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {m}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Label className="mb-1 text-xs text-muted-foreground">Dosage</Label>
                            <Input
                              placeholder="e.g., 500mg twice daily"
                              value={med.dosage}
                              onChange={(e) => updateMedication(index, "dosage", e.target.value)}
                            />
                          </div>
                        </div>

                        {medications.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-5 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeMedication(index)}
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remove medication</span>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Clinical Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Additional notes for pharmacy..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={handleAssessRisk}
                      disabled={assessing || filledMedications.length === 0 || !selectedPatientId}
                    >
                      {assessing
                        ? "Assessing..."
                        : `Run Risk Assessment (${filledMedications.length} drug${
                            filledMedications.length !== 1 ? "s" : ""
                          })`}
                    </Button>

                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? "Confirming..." : "Confirm Prescription"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {riskResult ? (
                <RiskDisplay assessment={riskResult} />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="font-medium text-card-foreground">No Risk Assessment Yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Select a patient, add medications, then click &ldquo;Run Risk Assessment&rdquo; to check for
                      allergy conflicts and drug-drug interactions.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="refill-requests" className="mt-4">
          {refillRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <RefreshCw className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium text-card-foreground">No Pending Refill Requests</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Patient refill requests will appear here for your approval.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {refillRequests.map((request: RefillRequest) => (
                <Card key={request.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{request.patientName}</CardTitle>
                        <CardDescription>
                          Requested on {new Date(request.createdAt).toLocaleDateString()} at{" "}
                          {new Date(request.createdAt).toLocaleTimeString()}
                        </CardDescription>
                      </div>
                      <Badge className="bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]">
                        <Clock className="mr-1 h-3 w-3" />
                        Pending Review
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="rounded-lg bg-muted p-3">
                      <p className="mb-2 text-sm font-medium text-foreground">Medications Requested:</p>
                      <div className="space-y-1">
                        {request.medications.map((med, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{med.name}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{med.dosage}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-1 text-xs text-muted-foreground">Patient&apos;s reason for refill:</p>
                      <p className="text-sm text-foreground">{request.reason}</p>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1"
                        onClick={() => handleApproveRefill(request.id)}
                        disabled={processingRefill === request.id}
                      >
                        {processingRefill === request.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        )}
                        Approve Refill
                      </Button>

                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => openRejectDialog(request)}
                        disabled={processingRefill === request.id}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" />
                        Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <PrescriptionHistory prescriptions={prescriptions} />
        </TabsContent>
      </Tabs>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline Refill Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for declining this refill request. The patient will be notified.
            </DialogDescription>
          </DialogHeader>

          {selectedRefillRequest && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium text-foreground">{selectedRefillRequest.patientName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedRefillRequest.medications.map((m) => m.name).join(", ")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Reason for Declining</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="e.g., Medication review required, please schedule an appointment..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectRefill}
              disabled={processingRefill !== null || !rejectionReason.trim()}
            >
              {processingRefill ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <XCircle className="mr-1.5 h-4 w-4" />
                  Decline Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PrescriptionHistory({ prescriptions }: { prescriptions: Prescription[] }) {
  if (prescriptions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ClipboardList className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium text-card-foreground">No Prescriptions Yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first prescription to see it here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((rx) => (
        <Card key={rx.id}>
          <CardContent className="flex items-start justify-between p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-card-foreground">{rx.patientName}</p>
                <StatusBadge status={rx.status} />
              </div>
              <div className="space-y-0.5">
                {rx.medications.map((med, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {med.name} &mdash; {med.dosage}
                  </p>
                ))}
              </div>
              {rx.notes && <p className="text-xs text-muted-foreground">{rx.notes}</p>}
              <p className="text-xs text-muted-foreground">
                {new Date(rx.createdAt).toLocaleString()}
              </p>
            </div>
            {rx.riskAssessment && <RiskDisplay assessment={rx.riskAssessment} compact />}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    confirmed: "bg-[hsl(200,80%,92%)] text-[hsl(200,80%,30%)]",
    booked: "bg-[hsl(173,40%,92%)] text-[hsl(173,58%,22%)]",
    ready: "bg-[hsl(37,80%,92%)] text-[hsl(37,90%,30%)]",
    collected: "bg-[hsl(152,50%,92%)] text-[hsl(152,60%,25%)]",
    expired: "bg-[hsl(0,70%,95%)] text-destructive",
  }

  return (
    <Badge className={`text-xs capitalize ${variants[status] || ""}`}>
      {status.replace("_", " ")}
    </Badge>
  )
}