import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMockDataContext } from "@/contexts/MockDataContext";

interface MockDataNoticeProps {
  displayedCount: number;
  rawCount: number;
  noun: string;
}

export const MockDataNotice = ({ displayedCount, rawCount, noun }: MockDataNoticeProps) => {
  const { getMockDataStatus } = useMockDataContext();
  const status = getMockDataStatus();

  if (!status.isEnabled) return null;

  // return (
  //   <Alert className="border-warning/35 bg-warning/10 text-warning">
  //     <AlertTriangle className="h-4 w-4 text-warning" />
  //     <div className="flex flex-wrap items-center gap-2">
  //       <AlertTitle>Mock Data Mode Active</AlertTitle>
  //       <Badge variant="outline" className="border-warning/35 bg-warning/15 text-warning">
  //         {status.percentage}% Demo Data
  //       </Badge>
  //     </div>
  //     <AlertDescription>
  //       Showing {displayedCount} of {rawCount} {noun} for the current view. Search and pagination can reduce this further.
  //     </AlertDescription>
  //   </Alert>
  // );
};
