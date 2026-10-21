import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useActivityLogs, ActivityLog } from "@/hooks/useActivityLogs";
import { buildActivityDiffRows } from "@/utils/activityLogFormat";
import { formatInTimeZone } from "@/lib/time";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { cn } from "@/lib/utils";

interface ActivityLogPanelProps {
  entityType: string;
  entityId: string | null;
  title?: string;
  limit?: number;
  cardClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  contentClassName?: string;
}

type ActivityLogView = ActivityLog & {
  displayUser: string;
  displayTime: string;
};

export const ActivityLogPanel = ({
  entityType,
  entityId,
  title = "Activity Log",
  limit = 50,
  cardClassName,
  headerClassName,
  titleClassName,
  contentClassName,
}: ActivityLogPanelProps) => {
  const [selectedLog, setSelectedLog] = useState<ActivityLogView | null>(null);
  const { data: logs = [], isLoading, error } = useActivityLogs({
    entityType,
    entityId: entityId || undefined,
    limit,
    enabled: !!entityId,
  });
  const { systemSettings } = useSystemSettings();

  const formattedLogs = useMemo<ActivityLogView[]>(() => {
    return logs.map((log) => ({
      ...log,
      displayUser: log.full_name || log.email || log.user_id || "Unknown",
      displayTime: formatInTimeZone(
        new Date(log.created_at),
        "MMM dd, yyyy HH:mm",
        systemSettings.timezone,
      ),
    }));
  }, [logs, systemSettings.timezone]);

  const summary = useMemo(() => {
    if (!formattedLogs.length) {
      return {
        created: "Not available",
        lastUpdated: "No updates yet",
        updateCount: 0,
      };
    }

    const inserts = formattedLogs.filter((log) => log.action === "insert");
    const createdLog = inserts.reduce((earliest, log) => {
      return new Date(log.created_at) < new Date(earliest.created_at) ? log : earliest;
    }, inserts[0] || formattedLogs[formattedLogs.length - 1]);

    const updateLogs = formattedLogs.filter((log) => log.action === "update");
    const lastUpdateLog = updateLogs.reduce((latest, log) => {
      return new Date(log.created_at) > new Date(latest.created_at) ? log : latest;
    }, updateLogs[0] || formattedLogs[0]);

    return {
      created: createdLog ? createdLog.displayTime : "Not available",
      lastUpdated: updateLogs.length ? lastUpdateLog.displayTime : "No updates yet",
      updateCount: updateLogs.length,
    };
  }, [formattedLogs]);

  if (!entityId) return null;

  return (
    <Card className={cn("border-dashed", cardClassName)}>
      {!titleClassName?.includes("hidden") && (
        <CardHeader className={headerClassName}>
          <CardTitle className={cn("text-base", titleClassName)}>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn("space-y-4", contentClassName)}>
        {/* Summary Cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-info/60 bg-info/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="h-3.5 w-3.5 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <div className="text-xs font-medium text-info">Created</div>
            </div>
            <div className="text-sm font-semibold text-info">{summary.created}</div>
          </div>
          <div className="rounded-lg border border-warning/60 bg-warning/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="h-3.5 w-3.5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <div className="text-xs font-medium text-warning">Last Updated</div>
            </div>
            <div className="text-sm font-semibold text-warning">{summary.lastUpdated}</div>
          </div>
          <div className="rounded-lg border border-success/60 bg-success/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="h-3.5 w-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <div className="text-xs font-medium text-success">Update Count</div>
            </div>
            <div className="text-sm font-semibold text-success">{summary.updateCount}</div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-error/35 bg-error/12 p-3 text-sm text-error">
            Failed to load activity log.
          </div>
        )}

        {/* Activity List */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3 animate-pulse">
                <svg className="h-6 w-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-muted-foreground">Loading activities...</p>
            </div>
          ) : formattedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50 mb-3">
                <svg className="h-6 w-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Activity will appear here once actions are performed</p>
            </div>
          ) : (
            <>
              {/* Mobile: Card Layout */}
              <div className="sm:hidden space-y-2">
                {formattedLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border bg-card p-3 space-y-2.5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium capitalize",
                            log.action === "insert" && "bg-success/12 text-success border border-success/35",
                            log.action === "update" && "bg-info/12 text-info border border-info/35",
                            log.action === "delete" && "bg-error/12 text-error border border-error/35"
                          )}>
                            {log.action}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">{log.displayTime}</span>
                        </div>
                        <div className="text-xs font-medium truncate mb-1">{log.displayUser}</div>
                        {log.summary && (
                          <div className="text-xs text-muted-foreground line-clamp-2">{log.summary}</div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="h-7 px-2 text-xs shrink-0"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: Table Layout */}
              <div className="hidden sm:block rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-[160px] font-semibold">Date & Time</TableHead>
                      <TableHead className="w-[140px] font-semibold">User</TableHead>
                      <TableHead className="w-[100px] font-semibold">Action</TableHead>
                      <TableHead className="font-semibold">Summary</TableHead>
                      <TableHead className="w-[80px] text-right font-semibold">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formattedLogs.map((log, index) => (
                      <TableRow
                        key={log.id}
                        className={cn(
                          "hover:bg-muted/30 transition-colors",
                          index % 2 === 0 ? "bg-background" : "bg-muted/10"
                        )}
                      >
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <svg className="h-3.5 w-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium">{log.displayTime}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <svg className="h-3.5 w-3.5 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="truncate" title={log.displayUser}>{log.displayUser}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium capitalize",
                            log.action === "insert" && "bg-success/12 text-success border border-success/35",
                            log.action === "update" && "bg-info/12 text-info border border-info/35",
                            log.action === "delete" && "bg-error/12 text-error border border-error/35"
                          )}>
                            {log.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="line-clamp-2" title={log.summary || ""}>{log.summary || "-"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                            className="h-8"
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden p-0 gap-0">
            {selectedLog && (
              <>
                {/* Header with gradient */}
                <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b bg-gradient-to-br from-primary/5 via-primary/3 to-background">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0 mt-0.5">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-base sm:text-lg font-semibold mb-1">Activity Details</DialogTitle>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="truncate">{selectedLog.displayTime}</span>
                        </div>
                        <span className="hidden sm:inline text-muted-foreground/50">•</span>
                        <div className="flex items-center gap-1.5">
                          <svg className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="truncate">{selectedLog.displayUser}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-140px)] sm:max-h-[calc(85vh-140px)] px-4 sm:px-6 py-4 sm:py-5">
                  <div className="space-y-4 sm:space-y-5">
                    {/* Changed Fields Card */}
                    <div className="rounded-xl border border-warning/80 bg-warning/20 overflow-hidden">
                      <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-warning/60 bg-warning/40">
                        <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <span className="font-medium text-warning text-xs sm:text-sm">Changed Fields</span>
                      </div>
                      <div className="bg-base-100 p-3 sm:p-4">
                        {buildActivityDiffRows(selectedLog.details || null, systemSettings.timezone).length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-muted/50 mb-2 sm:mb-3">
                              <svg className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                            </div>
                            <p className="text-xs sm:text-sm font-medium text-muted-foreground">No details available</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground/70 mt-1">This activity doesn't have change details</p>
                          </div>
                        ) : (
                          <div className="space-y-2 sm:space-y-3">
                            {/* Header Row - Hidden on mobile */}
                            <div className="hidden sm:grid grid-cols-[minmax(120px,1fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)] gap-4 pb-2 border-b text-xs font-semibold text-base-content/80 uppercase tracking-wide">
                              <div>Field</div>
                              <div>Before</div>
                              <div>After</div>
                            </div>
                            {/* Data Rows */}
                            {buildActivityDiffRows(selectedLog.details || null, systemSettings.timezone).map((row, index) => (
                              <div
                                key={row.label}
                                className={cn(
                                  "sm:grid sm:grid-cols-[minmax(120px,1fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)] gap-2 sm:gap-4 py-2 sm:py-2.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm",
                                  index % 2 === 0 ? "bg-muted/30" : "bg-background"
                                )}
                              >
                                {/* Mobile: Stacked layout */}
                                <div className="sm:hidden space-y-2">
                                  <div className="font-semibold text-base-content/90 capitalize text-xs">{row.label}</div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <div className="text-[10px] font-semibold text-base-content/70 uppercase mb-0.5">Before</div>
                                      <div className="break-words text-muted-foreground">
                                        {row.before || <span className="text-muted-foreground/50 italic">empty</span>}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-semibold text-base-content/70 uppercase mb-0.5">After</div>
                                      <div className="break-words font-medium">
                                        {row.after || <span className="text-muted-foreground/50 italic">empty</span>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {/* Desktop: Grid layout */}
                                <div className="hidden sm:contents">
                                  <div className="font-semibold text-base-content/90 capitalize">{row.label}</div>
                                  <div className="break-words text-muted-foreground">
                                    {row.before || <span className="text-muted-foreground/50 italic">empty</span>}
                                  </div>
                                  <div className="break-words font-medium">
                                    {row.after || <span className="text-muted-foreground/50 italic">empty</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Info Card */}
                    <div className="rounded-xl border border-base-300 bg-base-100/50 overflow-hidden">
                      <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-base-300/70 bg-base-100">
                        <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-base-content/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium text-base-content/90 text-xs sm:text-sm">Action Information</span>
                      </div>
                      <div className="bg-base-100 p-3 sm:p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-1">
                            <div className="text-[10px] sm:text-xs font-medium text-base-content/70">Action Type</div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium capitalize",
                                selectedLog.action === "insert" && "bg-success/12 text-success border border-success/35",
                                selectedLog.action === "update" && "bg-info/12 text-info border border-info/35",
                                selectedLog.action === "delete" && "bg-error/12 text-error border border-error/35"
                              )}>
                                {selectedLog.action}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] sm:text-xs font-medium text-base-content/70">Entity Type</div>
                            <div className="text-xs sm:text-sm font-medium capitalize">{selectedLog.entity_type}</div>
                          </div>
                          {selectedLog.entity_id && (
                            <div className="space-y-1">
                              <div className="text-[10px] sm:text-xs font-medium text-base-content/70">Entity ID</div>
                              <div className="text-[10px] sm:text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border inline-block break-all">
                                {selectedLog.entity_id}
                              </div>
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="text-[10px] sm:text-xs font-medium text-base-content/70">Summary</div>
                            <div className="text-xs sm:text-sm">{selectedLog.summary || "-"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-4 sm:px-6 py-2.5 sm:py-3 border-t bg-background/95 backdrop-blur-sm flex items-center justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedLog(null)}
                    className="min-w-[80px] sm:min-w-[100px] text-xs sm:text-sm h-8 sm:h-9"
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
