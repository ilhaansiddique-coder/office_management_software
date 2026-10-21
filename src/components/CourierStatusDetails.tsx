import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, Truck, MapPin, Calendar, MessageSquare, Phone, User, ExternalLink, Settings, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from '@/lib/time';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { cn } from '@/lib/utils';
import { ManualCourierStatusSelector } from '@/components/ManualCourierStatusSelector';
import { toast } from '@/utils/toast';

interface TrackingHistoryItem {
  status: string;
  date: string;
  branch?: string;
  remarks?: string;
}

interface CourierStatusDetailsProps {
  sale: {
    id: string;
    invoice_number: string;
    customer_name: string;
    cn_number?: string;
    consignment_id?: string;
    courier_status?: string;
    tracking_number?: string;
    estimated_delivery?: string;
    current_location?: string;
    courier_notes?: string;
    delivery_date?: string;
    return_reason?: string;
    courier_name?: string;
    courier_phone?: string;
    last_status_check?: string;
  };
  onRefreshStatus: (saleId: string, consignmentId: string) => Promise<boolean>;
  isRefreshing?: boolean;
}

export function CourierStatusDetails({ sale, onRefreshStatus, isRefreshing = false }: CourierStatusDetailsProps) {
  const [isRefreshingIndividual, setIsRefreshingIndividual] = useState(false);
  const [showManualSelector, setShowManualSelector] = useState(false);
  const [showTrackingHistory, setShowTrackingHistory] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState<TrackingHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const { systemSettings } = useSystemSettings();

  const courierNameLower = (sale.courier_name || '').toLowerCase();
  const isJanani = courierNameLower === 'janani' || courierNameLower === 'janani express';
  const isSundorban = courierNameLower === 'sundorban';
  const supportsTrackingHistory = isJanani || isSundorban;

  const fetchTrackingHistory = async () => {
    const cnNumber = sale.consignment_id || sale.cn_number;
    if (!cnNumber) return;

    setIsLoadingHistory(true);
    try {
      let endpoint = '';
      if (isJanani) {
        endpoint = 'janani-status-check';
      } else if (isSundorban) {
        endpoint = 'sundorban-status-check';
      }

      if (!endpoint) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ cn_number: cnNumber }),
        }
      );

      const data = await response.json();
      console.log('Tracking history response:', data);

      if (data.success) {
        // Handle Janani tracking history
        if (isJanani && data.tracking_history) {
          setTrackingHistory(data.tracking_history.map((item: any) => ({
            status: item.status,
            date: item.date,
            branch: item.branch,
            remarks: item.remarks,
          })));
        }
        // Handle Sundorban tracking history
        else if (isSundorban && data.data?.cnStatusList) {
          setTrackingHistory(data.data.cnStatusList.map((item: any) => ({
            status: item.status,
            date: item.statusDate,
            branch: item.fromSubBranch,
            remarks: item.remarks,
          })));
        }
        setShowTrackingHistory(true);
      } else {
        toast.error(data.message || 'Failed to fetch tracking history');
      }
    } catch (error) {
      console.error('Error fetching tracking history:', error);
      toast.error('Failed to fetch tracking history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleRefresh = async () => {
    const consignmentId = sale.consignment_id || sale.cn_number;
    if (!consignmentId) return;

    setIsRefreshingIndividual(true);
    try {
      await onRefreshStatus(sale.id, consignmentId);
    } finally {
      setIsRefreshingIndividual(false);
    }
  };

  useEffect(() => {
    // Auto specific checks for "not_sent" or "pending" if we have a valid ID
    if ((sale.consignment_id || sale.cn_number) && (!sale.courier_status || sale.courier_status === 'not_sent')) {
      handleRefresh();
    }
  }, [sale.id]);

  const handleManualStatusUpdate = (newStatus: string) => {
    // The ManualCourierStatusSelector handles the database update
    // We just need to close the selector and potentially refresh the parent
    setShowManualSelector(false);
    // Trigger a page refresh to update the UI
    window.dispatchEvent(new CustomEvent('salesDataUpdated'));
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-success/12 text-success border-success/35';
      case 'payout_ready':
        return 'bg-secondary/12 text-secondary border-secondary/35';
      case 'in_transit':
      case 'out_for_delivery':
        return 'bg-info/12 text-info border-info/35';
      case 'delivery_ready':
        return 'bg-accent/12 text-accent border-accent/35';
      case 'returned':
      case 'lost':
        return 'bg-error/12 text-error border-error/35';
      case 'not_sent':
        return 'bg-base-100 text-base-content border-base-300';
      default:
        return 'bg-warning/12 text-warning border-warning/35';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'delivered':
        return '✅';
      case 'payout_ready':
        return '💰';
      case 'in_transit':
        return '🚚';
      case 'out_for_delivery':
        return '📦';
      case 'delivery_ready':
        return '🏁';
      case 'returned':
        return '↩️';
      case 'lost':
        return '❌';
      case 'not_sent':
        return '📋';
      default:
        return '⏳';
    }
  };

  if (!sale.consignment_id && !sale.cn_number) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Courier Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            <Truck className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
            <p>Order not yet sent to courier</p>
            <p className="text-sm">Use the truck button to send this order to courier service</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Courier Status
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManualSelector(!showManualSelector)}
              className="h-6 w-6 p-0"
              title="Manual status update"
            >
              <Settings className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing || isRefreshingIndividual}
              className="h-6 w-6 p-0"
              title="Refresh status"
            >
              <RefreshCw className={cn("h-3 w-3", (isRefreshing || isRefreshingIndividual) && "animate-spin")} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getStatusIcon(sale.courier_status)}</span>
          <Badge
            variant="outline"
            className={cn("text-sm font-medium", getStatusColor(sale.courier_status))}
          >
            {sale.courier_status === 'not_sent' ? 'Not Sent' :
              sale.courier_status === 'in_transit' ? 'In Transit' :
                sale.courier_status === 'out_for_delivery' ? 'Out for Delivery' :
                  sale.courier_status === 'payout_ready' ? 'Payout Ready' :
                    sale.courier_status === 'returned' ? 'Returned' :
                      sale.courier_status === 'lost' ? 'Lost' :
                        sale.courier_status?.replace('_', ' ').toUpperCase() || 'PENDING'}
          </Badge>
        </div>

        {/* Manual Status Selector */}
        {showManualSelector && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Manual Status Update</span>
              </div>
              <ManualCourierStatusSelector
                saleId={sale.id}
                currentStatus={sale.courier_status}
                onStatusUpdate={handleManualStatusUpdate}
                variant="dropdown"
                size="sm"
              />
            </div>
          </>
        )}

        <Separator />

        {/* Tracking Information */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Tracking ID:</span>
            {(() => {
              const cnNumber = sale.consignment_id || sale.cn_number;
              const courierName = (sale.courier_name || '').toLowerCase();
              let trackingUrl = '';

              if (courierName === 'steadfast') {
                trackingUrl = `https://steadfast.com.bd/user/consignment/${cnNumber}`;
              } else if (courierName === 'pathao') {
                trackingUrl = `https://merchant.pathao.com/courier/orders/${cnNumber}`;
              } else if (courierName === 'sundorban') {
                trackingUrl = `https://tracking.sundarbancourierltd.com/?cnnumber=${cnNumber}`;
              } else if (courierName === 'janani' || courierName === 'janani express') {
                // Janani tracking page requires manual entry - copy CN and open page
                trackingUrl = `https://jananiexpress.com/tracking`;
              }

              const isJanani = courierName === 'janani' || courierName === 'janani express';
              const tooltipText = isJanani
                ? 'Click to copy CN & open tracking page (paste CN, select year 2026, click Search)'
                : trackingUrl ? `Track on ${sale.courier_name}` : 'Tracking URL not available';

              return (
                <a
                  href={trackingUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm bg-info/12 hover:bg-info/18 text-info px-2 py-1 rounded font-mono transition-colors cursor-pointer flex items-center gap-1"
                  title={tooltipText}
                  onClick={() => {
                    if (isJanani && cnNumber) {
                      navigator.clipboard.writeText(String(cnNumber));
                    }
                  }}
                >
                  {cnNumber}
                  <ExternalLink className="h-3 w-3" />
                </a>
              );
            })()}
          </div>

          {sale.tracking_number && (
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tracking Number:</span>
              <code className="text-sm bg-muted px-2 py-1 rounded">{sale.tracking_number}</code>
            </div>
          )}

          {sale.cn_number && (
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">CN Number:</span>
              <code className="text-sm bg-success/12 text-success px-2 py-1 rounded font-mono">{sale.cn_number}</code>
            </div>
          )}
        </div>

        {/* Tracking History for Janani/Sundorban */}
        {supportsTrackingHistory && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Tracking History</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (showTrackingHistory) {
                      setShowTrackingHistory(false);
                    } else {
                      fetchTrackingHistory();
                    }
                  }}
                  disabled={isLoadingHistory}
                  className="h-7 text-xs"
                >
                  {isLoadingHistory ? (
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  ) : showTrackingHistory ? (
                    <ChevronUp className="h-3 w-3 mr-1" />
                  ) : (
                    <ChevronDown className="h-3 w-3 mr-1" />
                  )}
                  {isLoadingHistory ? 'Loading...' : showTrackingHistory ? 'Hide' : 'View Timeline'}
                </Button>
              </div>

              {showTrackingHistory && trackingHistory.length > 0 && (
                <div className="relative pl-4 border-l-2 border-muted space-y-4 mt-3">
                  {trackingHistory.map((item, index) => (
                    <div key={index} className="relative">
                      <div className={cn(
                        "absolute -left-[21px] w-4 h-4 rounded-full border-2 bg-background",
                        index === trackingHistory.length - 1
                          ? "border-success/50 bg-success/12"
                          : "border-muted-foreground"
                      )} />
                      <div className="ml-2">
                        <p className={cn(
                          "text-sm font-medium",
                          index === trackingHistory.length - 1 && "text-success"
                        )}>
                          {item.status}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-0.5">
                          {item.branch && <span>{item.branch}</span>}
                          {item.date && (
                            <span>
                              {new Date(item.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                        {item.remarks && (
                          <p className="text-xs text-muted-foreground mt-1 italic">{item.remarks}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showTrackingHistory && trackingHistory.length === 0 && !isLoadingHistory && (
                <p className="text-sm text-muted-foreground text-center py-2">No tracking history available</p>
              )}
            </div>
          </>
        )}

        {/* Delivery Information */}
        {(sale.estimated_delivery || sale.delivery_date) && (
          <>
            <Separator />
            <div className="space-y-3">
              {sale.estimated_delivery && sale.courier_status !== 'delivered' && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Estimated Delivery:</span>
                  <span className="text-sm">{formatInTimeZone(new Date(sale.estimated_delivery), "MMM dd, yyyy", systemSettings.timezone)}</span>
                </div>
              )}

              {sale.delivery_date && sale.courier_status === 'delivered' && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Delivered on:</span>
                  <span className="text-sm text-success">{formatInTimeZone(new Date(sale.delivery_date), "MMM dd, yyyy", systemSettings.timezone)}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Location Information */}
        {sale.current_location && (
          <>
            <Separator />
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Current Location:</span>
              <span className="text-sm">{sale.current_location}</span>
            </div>
          </>
        )}

        {/* Courier Information */}
        {(sale.courier_name || sale.courier_phone) && (
          <>
            <Separator />
            <div className="space-y-2">
              {sale.courier_name && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Courier:</span>
                  <span className="text-sm">{sale.courier_name}</span>
                </div>
              )}

              {sale.courier_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Contact:</span>
                  <span className="text-sm">{sale.courier_phone}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Notes and Return Reason */}
        {(sale.courier_notes || sale.return_reason) && (
          <>
            <Separator />
            <div className="space-y-2">
              {sale.courier_notes && (
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <span className="text-sm font-medium">Courier Notes:</span>
                    <p className="text-sm text-muted-foreground mt-1">{sale.courier_notes}</p>
                  </div>
                </div>
              )}

              {sale.return_reason && (
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-error mt-0.5" />
                  <div>
                    <span className="text-sm font-medium text-error">Return Reason:</span>
                    <p className="text-sm text-error mt-1">{sale.return_reason}</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Last Update */}
        {sale.last_status_check && (
          <>
            <Separator />
            <div className="text-xs text-muted-foreground text-center">
              Last updated: {formatInTimeZone(new Date(sale.last_status_check), "MMM dd, yyyy 'at' HH:mm", systemSettings.timezone)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
