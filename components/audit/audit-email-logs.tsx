"use client"

import { useState } from "react"
import { FileText, Mail, Clock, User, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchAuditLogs, fetchEmailLogs } from "@/lib/actions"
import type { AuditLog, EmailLog } from "@/lib/types"
import useSWR from "swr"

function useAuditLogs() {
  return useSWR("audit-logs", async () => {
    const res = await fetchAuditLogs()
    if (res.error) throw new Error(res.error)
    return res.logs || []
  }, { refreshInterval: 3000 })
}

function useEmailLogs() {
  return useSWR("email-logs", async () => {
    const res = await fetchEmailLogs()
    if (res.error) throw new Error(res.error)
    return res.logs || []
  }, { refreshInterval: 3000 })
}

export function AuditEmailLogs() {
  const { data: auditLogs = [], mutate: mutateAudit, isValidating: isAuditRefreshing } = useAuditLogs()
  const { data: emailLogs = [], mutate: mutateEmail, isValidating: isEmailRefreshing } = useEmailLogs()
  const isRefreshing = isAuditRefreshing || isEmailRefreshing

  function handleRefresh() {
    mutateAudit()
    mutateEmail()
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">System Logs</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">
            <FileText className="mr-1.5 h-4 w-4" />
            Audit Logs ({auditLogs.length})
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Mail className="mr-1.5 h-4 w-4" />
            Email Logs ({emailLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit Trail</CardTitle>
              <CardDescription>
                All system actions logged for compliance and traceability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No audit logs yet. Actions will be recorded as you use the system.
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {auditLogs.map((log: AuditLog) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 rounded-lg border border-border p-3"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-card-foreground">
                              {log.userName}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {log.action}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{log.details}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email Notifications</CardTitle>
              <CardDescription>
                All emails sent by the system (development mode)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {emailLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No emails sent yet. Emails will appear here when prescriptions are marked ready.
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {emailLogs.map((log: EmailLog) => (
                      <EmailLogCard key={log.id} log={log} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmailLogCard({ log }: { log: EmailLog }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-card-foreground">{log.subject}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>To: {log.to}</span>
            <span>{new Date(log.sentAt).toLocaleString()}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border p-4">
          <div
            className="prose prose-sm max-w-none text-card-foreground"
            dangerouslySetInnerHTML={{ __html: log.body }}
          />
        </div>
      )}
    </div>
  )
}
