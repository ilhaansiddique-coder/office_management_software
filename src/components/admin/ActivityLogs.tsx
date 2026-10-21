import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { buildActivityDiffRows } from "@/utils/activityLogFormat";
import { formatInTimeZone } from "@/lib/time";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useSystemSettings } from "@/hooks/useSystemSettings";

const ACTION_OPTIONS = ["insert", "update", "delete", "status_update", "print_invoice", "download_invoice", "export_invoices"];
const ENTITY_OPTIONS = ["products", "customers", "sales", "sales_items", "payments", "invoices"];

export const ActivityLogs = () => {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const { isAdmin } = useUserRole();
  const { systemSettings } = useSystemSettings();
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, error } = useActivityLogs({
    search,
    action: actionFilter || undefined,
    entityType: entityFilter || undefined,
    limit: 200,
  });

  const formattedLogs = useMemo(() => {
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

  const logRetentionDays = 30;
  const handleClearLogs = async () => {
    setIsClearingLogs(true);
    try {
      const cutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("activity_logs")
        .delete()
        .lt("created_at", cutoff);

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      toast.success(`Removed logs older than ${logRetentionDays} days`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear activity logs");
    } finally {
      setIsClearingLogs(false);
      setClearDialogOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Logs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, action, entity..."
            />
          </div>
          <div className="space-y-1">
            <Label>Action</Label>
            <Select value={actionFilter || "all"} onValueChange={(value) => setActionFilter(value === "all" ? "" : value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ACTION_OPTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Entity</Label>
            <Select value={entityFilter || "all"} onValueChange={(value) => setEntityFilter(value === "all" ? "" : value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ENTITY_OPTIONS.map((entity) => (
                  <SelectItem key={entity} value={entity}>
                    {entity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isClearingLogs}>
                  {isClearingLogs ? "Clearing logs..." : "Clear old logs"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear activity logs</AlertDialogTitle>
                  <AlertDialogDescription>
                    Delete entries older than {logRetentionDays} days. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearLogs} disabled={isClearingLogs}>
                    {isClearingLogs ? "Clearing..." : "Clear logs"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">
            Failed to load activity logs.
          </div>
        )}

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : formattedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No logs found.
                  </TableCell>
                </TableRow>
              ) : (
                formattedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">{log.displayTime}</TableCell>
                    <TableCell className="max-w-[160px] truncate" title={log.displayUser}>
                      {log.displayUser}
                    </TableCell>
                    <TableCell className="capitalize">{log.action}</TableCell>
                    <TableCell className="capitalize">{log.entity_type}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={log.summary || ""}>
                      {log.summary || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Activity Details</DialogTitle>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 pb-10">
                <div className="text-sm text-muted-foreground">
                  {selectedLog.displayTime} - {selectedLog.displayUser}
                </div>
                <div className="grid gap-2 text-sm">
                  <div><strong>Action:</strong> {selectedLog.action}</div>
                  <div><strong>Entity:</strong> {selectedLog.entity_type}</div>
                  <div><strong>Summary:</strong> {selectedLog.summary || "-"}</div>
                  {selectedLog.entity_id && (
                    <div><strong>Entity ID:</strong> {selectedLog.entity_id}</div>
                  )}
                </div>
                <div className="rounded-md border bg-muted/30 p-3 pb-6">
                  <div className="text-sm font-medium mb-2">Changed Fields</div>
                  {buildActivityDiffRows(selectedLog.details || null, systemSettings.timezone).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No details available.</div>
                  ) : (
                    <div className="grid gap-2 text-sm">
                      <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                        <div>Field</div>
                        <div>Before</div>
                        <div>After</div>
                      </div>
                      {buildActivityDiffRows(selectedLog.details || null, systemSettings.timezone).map((row) => (
                        <div key={row.label} className="grid grid-cols-3 gap-3">
                          <div className="font-medium">{row.label}</div>
                          <div className="break-words">{row.before}</div>
                          <div className="break-words">{row.after}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="h-6" />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
