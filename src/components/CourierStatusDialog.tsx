import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
    RefreshCw, Truck, MapPin, Calendar, Clock, Package, Hash, Building,
    CheckCircle, XCircle, AlertTriangle, Send, Copy, ExternalLink, User, Edit, Save, X
} from 'lucide-react';
import { formatInTimeZone } from '@/lib/time';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useWebhookSettings } from '@/hooks/useWebhookSettings';
import { cn } from '@/lib/utils';
import { ManualCourierStatusSelector } from '@/components/ManualCourierStatusSelector';
import { toast } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';

interface TrackingHistoryItem {
    status: string;
    date: string;
    branch?: string;
    remarks?: string;
}

interface CourierStatusDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
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
        grand_total?: number;
        delivery_address?: string;
        customer_phone?: string;
    } | null;
    onRefreshStatus: (saleId: string, consignmentId: string) => Promise<boolean>;
    isRefreshing?: boolean;
}

export function CourierStatusDialog({
    open,
    onOpenChange,
    sale,
    onRefreshStatus,
    isRefreshing = false
}: CourierStatusDialogProps) {
    const [isRefreshingIndividual, setIsRefreshingIndividual] = useState(false);
    const [trackingHistory, setTrackingHistory] = useState<TrackingHistoryItem[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [courierDetails, setCourierDetails] = useState<any>(null);
    const [isEditingTracking, setIsEditingTracking] = useState(false);
    const [editableTrackingNumber, setEditableTrackingNumber] = useState('');
    const [isSavingTracking, setIsSavingTracking] = useState(false);
    const { systemSettings } = useSystemSettings();
    const { webhookSettings, isLoading: isWebhookSettingsLoading } = useWebhookSettings();

    const courierNameLower = (sale?.courier_name || '').toLowerCase();
    const isJanani = courierNameLower === 'janani' || courierNameLower === 'janani express';
    const isSundorban = courierNameLower === 'sundorban';
    const isSteadfast = courierNameLower === 'steadfast';
    const isPathao = courierNameLower === 'pathao';
    // Couriers that support tracking history timeline
    const supportsTrackingHistory = isJanani || isSundorban || isPathao || isSteadfast;
    // Couriers that provide detailed courier info
    const supportsCourierDetails = isJanani || isSundorban || isPathao || isSteadfast;

    // Reset state when dialog closes or sale changes
    useEffect(() => {
        if (!open) {
            // Clear data when dialog closes
            setTrackingHistory([]);
            setCourierDetails(null);
            setIsEditingTracking(false);
        }
    }, [open]);

    // Initialize editable tracking number when sale changes
    useEffect(() => {
        if (sale) {
            setEditableTrackingNumber(sale.tracking_number || '');
            setIsEditingTracking(false);
        }
    }, [sale?.id, sale?.tracking_number]);

    // Reset and fetch tracking history when sale changes
    useEffect(() => {
        if (open && sale) {
            // Clear previous sale's data immediately
            setTrackingHistory([]);
            setCourierDetails(null);

            // Fetch new data if courier supports it
            if (supportsTrackingHistory || supportsCourierDetails) {
                fetchTrackingHistory();
            }
        }
    }, [open, sale?.id]);

    // Save tracking number to database
    const saveTrackingNumber = async () => {
        if (!sale) return;

        const trackingToSave = editableTrackingNumber.trim() || null;
        console.log('Saving tracking number:', trackingToSave, 'for sale:', sale.id);

        setIsSavingTracking(true);
        try {
            // Update the tracking_number - cast to any to handle dynamic column
            const { error: updateError } = await supabase
                .from('sales')
                .update({ tracking_number: trackingToSave } as any)
                .eq('id', sale.id);

            if (updateError) {
                console.error('Save error:', updateError);
                toast.error('Failed to save tracking number: ' + updateError.message);
                return;
            }

            // Verify the update by fetching the record
            const { data: verifyData, error: verifyError } = await supabase
                .from('sales')
                .select('tracking_number')
                .eq('id', sale.id)
                .single();

            console.log('Verify result:', { verifyData, verifyError });

            if (verifyError) {
                console.error('Verify error:', verifyError);
                toast.error('Update may have failed: ' + verifyError.message);
                return;
            }

            const savedValue = (verifyData as any)?.tracking_number;
            console.log('Verified tracking_number:', savedValue);

            if (savedValue !== trackingToSave) {
                console.warn('Mismatch! Saved:', savedValue, 'Expected:', trackingToSave);
                toast.error('Tracking number was not saved correctly');
                return;
            }

            toast.success('Tracking number saved successfully');
            setIsEditingTracking(false);

            // Update local state with saved value
            setEditableTrackingNumber(savedValue || '');

            // Trigger refresh to update sale data and fetch tracking history
            window.dispatchEvent(new CustomEvent('salesDataUpdated'));

            // Fetch tracking history with the new tracking number
            if (savedValue) {
                setTimeout(() => fetchTrackingHistory(), 500);
            }
        } catch (err) {
            console.error('Save exception:', err);
            toast.error('Failed to save tracking number: ' + (err as Error).message);
        } finally {
            setIsSavingTracking(false);
        }
    };

    const cancelEditTracking = () => {
        setEditableTrackingNumber(sale?.tracking_number || '');
        setIsEditingTracking(false);
    };

    const fetchTrackingHistory = async () => {
        if (!sale) return;
        const cnNumber = sale.consignment_id || sale.cn_number;
        if (!cnNumber) return;

        setIsLoadingHistory(true);
        try {
            let endpoint = '';
            let payload: any = {};

            if (isSteadfast) {
                // Wait for settings to load before deciding credentials are missing.
                if (isWebhookSettingsLoading) {
                    setIsLoadingHistory(false);
                    return;
                }
                // Check if Steadfast credentials are configured
                const steadfastApiKey = String(webhookSettings?.steadfast_api_key || '').trim();
                const steadfastSecretKey = String(webhookSettings?.steadfast_secret_key || '').trim();
                if (!steadfastApiKey || !steadfastSecretKey) {
                    console.log('Steadfast credentials not configured');
                    setIsLoadingHistory(false);
                    return;
                }
                // Use editableTrackingNumber if set (after manual edit), otherwise use sale's tracking_number
                const trackingCodeToUse = editableTrackingNumber?.trim() || sale?.tracking_number || null;
                endpoint = 'steadfast-status-check';
                payload = {
                    consignment_id: cnNumber,
                    // Pass tracking_code for public tracking API (alphanumeric code like SFR260210ST210D6F1BD)
                    tracking_code: trackingCodeToUse,
                    api_key: steadfastApiKey,
                    secret_key: steadfastSecretKey
                };
                console.log('Fetching Steadfast tracking with code:', trackingCodeToUse);
            } else if (isJanani) {
                endpoint = 'janani-status-check';
                payload = { cn_number: cnNumber };
            } else if (isSundorban) {
                endpoint = 'sundorban-status-check';
                payload = { cn_number: cnNumber };
            } else if (isPathao) {
                endpoint = 'pathao-status-check';
                payload = { consignment_id: cnNumber };
            }

            if (!endpoint) {
                setIsLoadingHistory(false);
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify(payload),
                }
            );

            const data = await response.json();
            console.log('Tracking/courier details response:', data);

            if (data.success) {
                setCourierDetails(data);

                if (isSteadfast) {
                    if (data.tracking_history && Array.isArray(data.tracking_history) && data.tracking_history.length > 0) {
                        // Use tracking_history from Steadfast public tracking API
                        const timeline = data.tracking_history.map((item: any) => ({
                            status: item.status || item.title || item.event || 'Update',
                            date: item.date || item.time || item.created_at || item.timestamp || new Date().toISOString(),
                            branch: item.branch || item.location || item.hub || '',
                            remarks: item.note || item.remarks || item.description || item.message || ''
                        }));
                        setTrackingHistory(timeline);
                    } else if (data.delivery_status) {
                        // Fallback: Show current status from API if detailed tracking not available
                        const statusLabel = String(data.delivery_status).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                        setTrackingHistory([{
                            status: statusLabel,
                            date: new Date().toISOString(),
                            remarks: 'Current status from Steadfast API'
                        }]);
                    }
                } else if (isJanani && data.tracking_history) {
                    setTrackingHistory(data.tracking_history.map((item: any) => ({
                        status: item.status,
                        date: item.date,
                        branch: item.branch,
                        remarks: item.remarks,
                    })));
                } else if (isSundorban && data.data?.cnStatusList) {
                    setTrackingHistory(data.data.cnStatusList.map((item: any) => ({
                        status: item.status,
                        date: item.statusDate,
                        branch: item.fromSubBranch,
                        remarks: item.remarks,
                    })));
                } else if (isPathao) {
                    // Build a timeline from Pathao order data
                    const pathaoTimeline: TrackingHistoryItem[] = [];
                    const orderData = data.data || data;

                    // Add order creation
                    if (orderData.created_at) {
                        pathaoTimeline.push({
                            status: 'Order Created',
                            date: orderData.created_at,
                            remarks: `Invoice: ${orderData.merchant_order_id || ''}`
                        });
                    }

                    // Add pickup if assigned
                    if (data.raw_status?.toLowerCase().includes('pickup') ||
                        data.raw_status?.toLowerCase().includes('picked')) {
                        pathaoTimeline.push({
                            status: 'Pickup Assigned',
                            date: orderData.updated_at || orderData.created_at,
                            branch: orderData.store_name
                        });
                    }

                    // Add transit status if applicable
                    if (data.raw_status?.toLowerCase().includes('transit') ||
                        data.raw_status?.toLowerCase().includes('hub') ||
                        data.raw_status?.toLowerCase().includes('sorting')) {
                        pathaoTimeline.push({
                            status: 'In Transit',
                            date: orderData.updated_at,
                            remarks: 'Package is on the way'
                        });
                    }

                    // Add out for delivery if applicable
                    if (data.raw_status?.toLowerCase().includes('out_for_delivery') ||
                        data.raw_status?.toLowerCase().includes('delivery_assigned')) {
                        pathaoTimeline.push({
                            status: 'Out for Delivery',
                            date: orderData.updated_at,
                            remarks: 'Package is being delivered'
                        });
                    }

                    // Add current status if different from above
                    if (data.raw_status && orderData.updated_at) {
                        const statusLabel = data.raw_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                        // Check if we haven't already added this status
                        const alreadyAdded = pathaoTimeline.some(item =>
                            item.status.toLowerCase() === statusLabel.toLowerCase()
                        );
                        if (!alreadyAdded) {
                            pathaoTimeline.push({
                                status: statusLabel,
                                date: orderData.updated_at,
                                branch: orderData.recipient_zone || orderData.recipient_city
                            });
                        }
                    }

                    // Sort by date and set timeline
                    pathaoTimeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    setTrackingHistory(pathaoTimeline);
                }
            }
        } catch (error) {
            console.error('Error fetching tracking history:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleRefresh = async () => {
        if (!sale) return;
        const consignmentId = sale.consignment_id || sale.cn_number;
        if (!consignmentId) return;

        setIsRefreshingIndividual(true);
        try {
            await onRefreshStatus(sale.id, consignmentId);
            // Always fetch tracking history if courier supports it
            if (supportsTrackingHistory || supportsCourierDetails) {
                await fetchTrackingHistory();
            }
        } finally {
            setIsRefreshingIndividual(false);
        }
    };

    const handleManualStatusUpdate = () => {
        window.dispatchEvent(new CustomEvent('salesDataUpdated'));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const getStatusConfig = (status?: string) => {
        switch (status) {
            case 'delivered':
                return {
                    color: 'bg-success',
                    bgLight: 'bg-success/12 border-success/35',
                    text: 'text-success',
                    icon: CheckCircle,
                    label: 'Delivered'
                };
            case 'payout_ready':
                return {
                    color: 'bg-secondary',
                    bgLight: 'bg-secondary/12 border-secondary/35',
                    text: 'text-secondary',
                    icon: CheckCircle,
                    label: 'Payout Ready'
                };
            case 'in_transit':
                return {
                    color: 'bg-info',
                    bgLight: 'bg-info/12 border-info/35',
                    text: 'text-info',
                    icon: Truck,
                    label: 'In Transit'
                };
            case 'out_for_delivery':
                return {
                    color: 'bg-info',
                    bgLight: 'bg-info/12 border-info/35',
                    text: 'text-info',
                    icon: Package,
                    label: 'Out for Delivery'
                };
            case 'delivery_ready':
                return {
                    color: 'bg-accent',
                    bgLight: 'bg-accent/12 border-accent/35',
                    text: 'text-accent',
                    icon: CheckCircle,
                    label: 'Ready for Delivery'
                };
            case 'sent':
                return {
                    color: 'bg-secondary',
                    bgLight: 'bg-secondary/12 border-secondary/35',
                    text: 'text-secondary',
                    icon: Send,
                    label: 'Sent'
                };
            case 'returned':
                return {
                    color: 'bg-warning',
                    bgLight: 'bg-warning/12 border-warning/35',
                    text: 'text-warning',
                    icon: AlertTriangle,
                    label: 'Returned'
                };
            case 'lost':
                return {
                    color: 'bg-error',
                    bgLight: 'bg-error/12 border-error/35',
                    text: 'text-error',
                    icon: XCircle,
                    label: 'Lost'
                };
            case 'cancelled':
                return {
                    color: 'bg-base-200',
                    bgLight: 'bg-base-100 border-base-300',
                    text: 'text-base-content/90',
                    icon: XCircle,
                    label: 'Cancelled'
                };
            case 'not_sent':
                return {
                    color: 'bg-base-200',
                    bgLight: 'bg-base-100 border-base-300',
                    text: 'text-base-content/80',
                    icon: Clock,
                    label: 'Not Sent'
                };
            default:
                return {
                    color: 'bg-warning',
                    bgLight: 'bg-warning/12 border-warning/35',
                    text: 'text-warning',
                    icon: Clock,
                    label: status?.replace('_', ' ').toUpperCase() || 'Pending'
                };
        }
    };

    const getTrackingUrl = () => {
        if (!sale) return '';
        const cnNumber = sale.consignment_id || sale.cn_number;

        if (isSteadfast) return `https://steadfast.com.bd/user/consignment/${cnNumber}`;
        if (isPathao) return `https://merchant.pathao.com/tracking?consignment_id=${cnNumber}`;
        if (isSundorban) return `https://tracking.sundarbancourierltd.com/?cnnumber=${cnNumber}`;
        if (isJanani) return `https://jananiexpress.com/tracking`;
        return '';
    };

    const getCourierLogo = () => {
        if (isSteadfast) return '⚡';
        if (isPathao) return '🏍️';
        if (isSundorban) return '🌴';
        if (isJanani) return '📦';
        return '🚚';
    };

    if (!sale) return null;

    const statusConfig = getStatusConfig(sale.courier_status);
    const StatusIcon = statusConfig.icon;
    const trackingUrl = getTrackingUrl();
    const cnNumber = sale.consignment_id || sale.cn_number;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-y-auto p-0">
                {/* Header */}
                <div className={cn("border-b", statusConfig.bgLight)}>
                    <DialogHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 !pl-0 pr-10 sm:!pl-4 sm:pr-12">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-2xl shrink-0">{getCourierLogo()}</span>
                                <div className="min-w-0 text-left">
                                    <DialogTitle className="text-base truncate">
                                        {sale.courier_name || 'Courier'} - {sale.invoice_number}
                                    </DialogTitle>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {sale.customer_name}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <ManualCourierStatusSelector
                                    saleId={sale.id}
                                    currentStatus={sale.courier_status}
                                    onStatusUpdate={handleManualStatusUpdate}
                                    variant="inline"
                                    size="sm"
                                />
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleRefresh}
                                    disabled={isRefreshing || isRefreshingIndividual}
                                    className="h-8"
                                >
                                    <RefreshCw className={cn("h-4 w-4 mr-1", (isRefreshing || isRefreshingIndividual) && "animate-spin")} />
                                    Refresh
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="px-3 sm:px-4 pb-4 pt-2 overflow-hidden">
                    {/* Status Banner */}
                    <div className={cn("rounded-lg border p-3 mb-4", statusConfig.bgLight)}>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className={cn("w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0", statusConfig.color)}>
                                    <StatusIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                </div>
                                <div className="min-w-0">
                                    <p className={cn("text-base sm:text-lg font-semibold", statusConfig.text)}>
                                        {statusConfig.label}
                                    </p>
                                    {sale.last_status_check && (
                                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                            Updated {formatInTimeZone(new Date(sale.last_status_check), "MMM dd, yyyy 'at' HH:mm", systemSettings.timezone)}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {sale.grand_total && (
                                <div className="text-right shrink-0">
                                    <p className="text-xs text-muted-foreground">Amount</p>
                                    <p className="text-base sm:text-lg font-bold">৳{sale.grand_total.toLocaleString()}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left Column - Order & Tracking Info */}
                        <div className="space-y-3">
                            {/* Tracking ID Card */}
                            <div className="bg-card rounded-lg border p-3">
                                <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                                    <Hash className="h-3.5 w-3.5" />
                                    Tracking Information
                                </h3>
                                <div className="space-y-2">
                                    {cnNumber && (
                                        <div>
                                            <span className="text-sm text-muted-foreground">CN / Consignment ID</span>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <code className="bg-primary/10 text-primary px-2 py-1 rounded font-mono font-semibold text-sm truncate min-w-0">
                                                    {cnNumber}
                                                </code>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 shrink-0"
                                                    onClick={() => copyToClipboard(String(cnNumber))}
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                                {trackingUrl && (
                                                    <a
                                                        href={trackingUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md hover:bg-accent shrink-0"
                                                        title={isJanani ? 'Open tracking page (paste CN manually)' : 'Track on courier website'}
                                                        onClick={() => {
                                                            if (isJanani) copyToClipboard(String(cnNumber));
                                                        }}
                                                    >
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {isSteadfast && (
                                        <div>
                                            <span className="text-sm text-muted-foreground">Tracking Code</span>
                                            {isEditingTracking ? (
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <Input
                                                        value={editableTrackingNumber}
                                                        onChange={(e) => setEditableTrackingNumber(e.target.value)}
                                                        placeholder="e.g., SFR260210ST210D6F1BD"
                                                        className="h-7 text-xs font-mono min-w-0 flex-1"
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 shrink-0 text-success hover:text-success hover:bg-success/12"
                                                        onClick={saveTrackingNumber}
                                                        disabled={isSavingTracking}
                                                    >
                                                        {isSavingTracking ? (
                                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <Save className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 shrink-0 text-error hover:text-error hover:bg-error/12"
                                                        onClick={cancelEditTracking}
                                                        disabled={isSavingTracking}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    {editableTrackingNumber ? (
                                                        <>
                                                            <code className="bg-info/12 text-info px-2 py-1 rounded font-mono text-xs sm:text-sm truncate min-w-0">
                                                                {editableTrackingNumber}
                                                            </code>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-7 w-7 p-0 shrink-0"
                                                                onClick={() => copyToClipboard(editableTrackingNumber)}
                                                            >
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                            <a
                                                                href={`https://steadfast.com.bd/t/${editableTrackingNumber}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md hover:bg-accent text-info shrink-0"
                                                                title="Track on Steadfast public page"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">Not set</span>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 shrink-0"
                                                        onClick={() => setIsEditingTracking(true)}
                                                        title="Edit tracking code"
                                                    >
                                                        <Edit className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {!isSteadfast && sale.tracking_number && sale.tracking_number !== cnNumber && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">Tracking Number</span>
                                            <code className="bg-muted px-2 py-1 rounded text-sm">{sale.tracking_number}</code>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">Courier Service</span>
                                        <Badge variant="secondary">{sale.courier_name || 'Unknown'}</Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Customer & Delivery Info */}
                            <div className="bg-card rounded-lg border p-3">
                                <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                                    <User className="h-3.5 w-3.5" />
                                    Delivery Details
                                </h3>
                                <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-sm text-muted-foreground shrink-0">Customer</span>
                                        <span className="text-sm font-medium text-right break-words min-w-0">{sale.customer_name}</span>
                                    </div>
                                    {sale.customer_phone && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm text-muted-foreground shrink-0">Phone</span>
                                            <a href={`tel:${sale.customer_phone}`} className="text-sm text-info hover:underline">
                                                {sale.customer_phone}
                                            </a>
                                        </div>
                                    )}
                                    {sale.delivery_address && (
                                        <div>
                                            <span className="text-sm text-muted-foreground">Address</span>
                                            <p className="text-sm mt-0.5 break-words">{sale.delivery_address}</p>
                                        </div>
                                    )}
                                    {sale.current_location && (
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm text-muted-foreground shrink-0">Location</span>
                                            <span className="text-sm flex items-center gap-1 min-w-0 break-words">
                                                <MapPin className="h-3 w-3 shrink-0" />
                                                {sale.current_location}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dates & Additional Info */}
                            {(sale.estimated_delivery || sale.delivery_date || sale.courier_notes || sale.return_reason) && (
                                <div className="bg-card rounded-lg border p-3">
                                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                                        <Calendar className="h-3.5 w-3.5" />
                                        Additional Information
                                    </h3>
                                    <div className="space-y-2">
                                        {sale.estimated_delivery && sale.courier_status !== 'delivered' && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">Estimated Delivery</span>
                                                <span className="text-sm">{formatInTimeZone(new Date(sale.estimated_delivery), "MMM dd, yyyy", systemSettings.timezone)}</span>
                                            </div>
                                        )}
                                        {sale.delivery_date && sale.courier_status === 'delivered' && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-success">Delivered On</span>
                                                <span className="text-sm text-success font-medium">
                                                    {formatInTimeZone(new Date(sale.delivery_date), "MMM dd, yyyy", systemSettings.timezone)}
                                                </span>
                                            </div>
                                        )}
                                        {sale.courier_notes && (
                                            <div>
                                                <span className="text-sm text-muted-foreground">Notes</span>
                                                <p className="text-sm mt-1 p-2 bg-muted/50 rounded">{sale.courier_notes}</p>
                                            </div>
                                        )}
                                        {sale.return_reason && (
                                            <div>
                                                <span className="text-sm text-warning">Return Reason</span>
                                                <p className="text-sm mt-1 p-2 bg-warning/12 rounded text-warning">{sale.return_reason}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Courier-specific details */}
                            {courierDetails && (
                                <div className="bg-card rounded-lg border p-3">
                                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                                        <Building className="h-3.5 w-3.5" />
                                        Courier Details
                                    </h3>
                                    <div className="space-y-2 text-sm">
                                        {/* Janani/Sundorban specific fields */}
                                        {courierDetails.booking_place && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-muted-foreground shrink-0">Booking Branch</span>
                                                <span className="text-right break-words min-w-0">{courierDetails.booking_place}</span>
                                            </div>
                                        )}
                                        {courierDetails.destination && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-muted-foreground shrink-0">Destination</span>
                                                <span className="text-right break-words min-w-0">{courierDetails.destination}</span>
                                            </div>
                                        )}
                                        {courierDetails.sender_name && (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-muted-foreground shrink-0">Sender</span>
                                                <span className="text-right break-words min-w-0">{courierDetails.sender_name}</span>
                                            </div>
                                        )}
                                        {courierDetails.service_type && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Service Type</span>
                                                <Badge variant="outline" className="text-xs">{courierDetails.service_type}</Badge>
                                            </div>
                                        )}

                                        {/* Pathao specific fields */}
                                        {courierDetails.store_name && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Store</span>
                                                <span>{courierDetails.store_name}</span>
                                            </div>
                                        )}
                                        {courierDetails.recipient_city && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">City</span>
                                                <span>{courierDetails.recipient_city}</span>
                                            </div>
                                        )}
                                        {courierDetails.recipient_zone && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Zone</span>
                                                <span>{courierDetails.recipient_zone}</span>
                                            </div>
                                        )}
                                        {courierDetails.delivery_fee !== undefined && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Delivery Fee</span>
                                                <span>৳{courierDetails.delivery_fee}</span>
                                            </div>
                                        )}
                                        {courierDetails.cod_fee !== undefined && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">COD Fee</span>
                                                <span>৳{courierDetails.cod_fee}</span>
                                            </div>
                                        )}
                                        {courierDetails.amount_to_collect !== undefined && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Amount to Collect</span>
                                                <span className="font-semibold">৳{courierDetails.amount_to_collect}</span>
                                            </div>
                                        )}
                                        {courierDetails.item_quantity && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Items</span>
                                                <span>{courierDetails.item_quantity}</span>
                                            </div>
                                        )}
                                        {courierDetails.item_weight && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Weight</span>
                                                <span>{courierDetails.item_weight} kg</span>
                                            </div>
                                        )}

                                        {/* Common fields */}
                                        {courierDetails.raw_status && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Raw Status</span>
                                                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{courierDetails.raw_status}</span>
                                            </div>
                                        )}
                                        {courierDetails.tracking_url && (
                                            <div className="pt-2">
                                                <a
                                                    href={courierDetails.tracking_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm text-info hover:underline flex items-center gap-1"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    Track on {sale.courier_name}
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column - Tracking Timeline */}
                        <div className="bg-card rounded-lg border p-3">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                    <Clock className="h-3.5 w-3.5" />
                                    Tracking Timeline
                                </h3>
                                {supportsTrackingHistory && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={fetchTrackingHistory}
                                        disabled={isLoadingHistory}
                                        className="h-7"
                                    >
                                        <RefreshCw className={cn("h-3 w-3", isLoadingHistory && "animate-spin")} />
                                    </Button>
                                )}
                            </div>

                            {isLoadingHistory ? (
                                <div className="flex items-center justify-center py-8">
                                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : trackingHistory.length > 0 ? (
                                <div className="max-h-[350px] overflow-y-auto overflow-x-visible">
                                    <div className="relative pl-6 border-l-2 border-muted ml-2 space-y-3">
                                        {trackingHistory.map((item, index) => {
                                            const isLatest = index === trackingHistory.length - 1;
                                            return (
                                                <div key={index} className="relative">
                                                    <div className={cn(
                                                        "absolute -left-[17px] top-0.5 w-3.5 h-3.5 rounded-full border-2",
                                                        isLatest ? "border-success/50 bg-success" : "border-muted-foreground/50 bg-background"
                                                    )} />
                                                    <div>
                                                        <p className={cn(
                                                            "font-medium",
                                                            isLatest ? "text-success" : "text-foreground"
                                                        )}>
                                                            {item.status}
                                                        </p>
                                                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-1">
                                                            {item.branch && (
                                                                <span className="flex items-center gap-1">
                                                                    <MapPin className="h-3 w-3" />
                                                                    {item.branch}
                                                                </span>
                                                            )}
                                                            {item.date && (
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />
                                                                    {new Date(item.date).toLocaleDateString('en-US', {
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.remarks && (
                                                            <p className="text-xs text-muted-foreground mt-1 italic bg-muted/50 px-2 py-1 rounded">
                                                                {item.remarks}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : supportsTrackingHistory ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>No tracking history available yet</p>
                                    <p className="text-xs mt-1">Click refresh to fetch latest updates</p>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>Timeline not available for {sale.courier_name}</p>
                                    {trackingUrl && (
                                        <a
                                            href={trackingUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-info hover:underline mt-2 inline-flex items-center gap-1"
                                        >
                                            Track on courier website
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
