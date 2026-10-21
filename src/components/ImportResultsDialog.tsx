import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, CheckCircle2, SkipForward, AlertCircle, Search, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ImportResultData {
  success: boolean;
  results: Record<string, {
    status: 'validated' | 'success' | 'skipped' | 'failed';
    recordCount?: number;
    message?: string;
    reason?: string;
  }>;
  totalRecords: number;
  totalTables: number;
  errors?: string[];
}

interface ImportResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ImportResultData | null;
}

export const ImportResultsDialog = ({ open, onOpenChange, data }: ImportResultsDialogProps) => {
  if (!data) return null;

  const isDryRun = Object.values(data.results || {}).some(
    (r) => r.status === 'validated'
  );

  const entries = Object.entries(data.results || {});
  const successful = entries.filter(([, r]) => r.status === 'success');
  const skipped = entries.filter(([, r]) => r.status === 'skipped');
  const failed = entries.filter(([, r]) => r.status === 'failed');
  const validated = entries.filter(([, r]) => r.status === 'validated');

  const formatTableName = (name: string) =>
    name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 sm:px-6 sm:py-4">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {isDryRun ? (
                <>
                  <Search className="h-5 w-5 text-info" />
                  Validation Summary
                </>
              ) : (
                <>
                  <Database className="h-5 w-5 text-primary" />
                  Import Summary
                </>
              )}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
        </div>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-info/12 p-3">
              <p className="text-xs text-info font-medium">Total Records</p>
              <p className="text-xl font-bold text-info">{data.totalRecords.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-base-100 p-3">
              <p className="text-xs text-base-content/80 font-medium">Tables</p>
              <p className="text-xl font-bold text-base-content/90">{entries.length}</p>
            </div>
            {!isDryRun && (
              <div className="rounded-lg border bg-success/12 p-3 col-span-2 sm:col-span-1">
                <p className="text-xs text-success font-medium">Processed</p>
                <p className="text-xl font-bold text-success">{data.totalTables}</p>
              </div>
            )}
          </div>

          {/* Dry run: single validation table */}
          {isDryRun && validated.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5 text-info">
                <CheckCircle2 className="h-4 w-4" />
                Tables in Backup
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium">#</th>
                      <th className="text-left px-3 py-2 font-medium">Table</th>
                      <th className="text-right px-3 py-2 font-medium">Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validated.map(([table, result], i) => (
                      <tr key={table} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">{formatTableName(table)}</td>
                        <td className="px-3 py-2 text-right font-mono">{(result.recordCount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import: successful table */}
          {!isDryRun && successful.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" />
                Successfully Processed ({successful.length})
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-success/12 border-b">
                      <th className="text-left px-3 py-2 font-medium">Table</th>
                      <th className="text-right px-3 py-2 font-medium">Records</th>
                      <th className="text-left px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {successful.map(([table, result], i) => (
                      <tr key={table} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2">{formatTableName(table)}</td>
                        <td className="px-3 py-2 text-right font-mono">{(result.recordCount || 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{result.message || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import: skipped table */}
          {!isDryRun && skipped.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5 text-warning">
                <SkipForward className="h-4 w-4" />
                Skipped / Unchanged ({skipped.length})
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-warning/12 border-b">
                      <th className="text-left px-3 py-2 font-medium">Table</th>
                      <th className="text-left px-3 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skipped.map(([table, result], i) => (
                      <tr key={table} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2">{formatTableName(table)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{result.reason || 'Unchanged'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import: failed table */}
          {!isDryRun && failed.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5 text-error">
                <AlertCircle className="h-4 w-4" />
                Failed ({failed.length})
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-error/12 border-b">
                      <th className="text-left px-3 py-2 font-medium">Table</th>
                      <th className="text-left px-3 py-2 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failed.map(([table, result], i) => (
                      <tr key={table} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        <td className="px-3 py-2">{formatTableName(table)}</td>
                        <td className="px-3 py-2 text-xs text-error">{result.reason || 'Unknown error'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warnings */}
          {data.errors && data.errors.length > 0 && (
            <div className="rounded-lg border border-warning/35 bg-warning/12 p-3">
              <p className="text-sm font-medium text-warning">Warnings</p>
              <ul className="mt-1 text-xs text-warning list-disc pl-4 space-y-0.5">
                {data.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
