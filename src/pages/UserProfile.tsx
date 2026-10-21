import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { User, BarChart3, Palette, TrendingUp, Users, RefreshCw, Trophy, CreditCard, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfileTab } from "@/components/ProfileTab";
import { AppearanceTab } from "@/components/AppearanceTab";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";

interface AdminUserSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
}

const fetchUserSummary = async (userId: string): Promise<AdminUserSummary | null> => {
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_all_users_with_roles");
  if (!rpcError && rpcData) {
    const match = (rpcData as any[]).find((user) => user.id === userId);
    if (match) {
      return {
        id: match.id,
        full_name: match.full_name || "Unknown User",
        email: match.email || null,
        phone: match.phone || null,
        role: match.role || null,
      };
    }
  }

  const [{ data: profile, error: profileError }, { data: roleRow, error: roleError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (roleError) throw roleError;
  if (!profile) return null;

  return {
    id: profile.id,
    full_name: profile.full_name || "Unknown User",
    email: null,
    phone: profile.phone || null,
    role: roleRow?.role || null,
  };
};

export default function UserProfile() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { hasPermission, isLoading: roleLoading } = useUserRole();
  const { formatAmount } = useCurrency();
  const params = useParams();
  const targetUserId = params.userId || user?.id || "";
  const isSelf = !!user?.id && targetUserId === user.id;
  const canViewOthers = hasPermission("admin.manage_roles") || hasPermission("admin.manage_permissions");

  const [userStartDate, setUserStartDate] = useState<Date | undefined>();
  const [userEndDate, setUserEndDate] = useState<Date | undefined>();

  const {
    data: targetUser,
    isLoading: isTargetUserLoading,
  } = useQuery({
    queryKey: ["admin-user-summary", targetUserId],
    queryFn: () => fetchUserSummary(targetUserId),
    enabled: !!targetUserId && !isSelf,
  });

  const {
    data: targetUserPreferences,
    isLoading: isPreferencesLoading,
  } = useQuery({
    queryKey: ["user-preferences-readonly", targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("dark_mode, compact_view")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId && !isSelf,
  });

  // Fetch all sales associates for the performance table
  const { data: salesAssociates = [] } = useQuery({
    queryKey: ["sales-associates-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_users_with_roles');
      if (error) {
        console.error('Failed to fetch users via RPC:', error);
        return [];
      }
      // Filter to only show sales associates
      const associates = (data || []).filter((user: any) => {
        const role = (user.role || '').toLowerCase();
        return role === 'sales_associate' || role === 'salesassociate' || role === 'sales' || role === 'user' || role === '';
      });
      return associates;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch performance for all sales associates
  const { data: allPerformance = [], isLoading: isPerformanceLoading } = useQuery({
    queryKey: [
      "all-sales-associates-performance",
      userStartDate?.toISOString() || "all",
      userEndDate?.toISOString() || "all",
      salesAssociates.map((u: any) => u.id).join(','),
    ],
    queryFn: async () => {
      if (salesAssociates.length === 0) return [];

      const getNetAmount = (sale: { grand_total?: number | null; fee?: number | null }) =>
        Math.max(0, (sale.grand_total || 0) - ((sale as any).fee || 0));

      const returnStatuses = new Set(["returned", "cancelled", "lost"]);

      // Fetch all sales and customers in bulk with pagination to handle > 1000 rows
      const fetchAllData = async (table: string, select: string) => {
        let allRows: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;

        while (true) {
          let query = supabase
            .from(table)
            .select(select)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (userStartDate) {
            query = query.gte("created_at", userStartDate.toISOString());
          }
          if (userEndDate) {
            query = query.lte("created_at", userEndDate.toISOString());
          }

          const { data, error } = await query;
          if (error) throw error;

          if (!data || data.length === 0) break;
          allRows = [...allRows, ...data];

          if (data.length < PAGE_SIZE) break;
          page++;
        }
        return allRows;
      };

      const [allSales, allCustomers] = await Promise.all([
        fetchAllData("sales", "id, grand_total, fee, created_at, courier_status, created_by"),
        fetchAllData("customers", "id, created_at, created_by")
      ]);

      // Calculate performance for each sales associate
      const performanceData = salesAssociates.map((associate: any) => {
        const userSales = (allSales || []).filter((sale: any) => sale.created_by === associate.id);
        const userCustomers = (allCustomers || []).filter((c: any) => c.created_by === associate.id);

        const salesCount = userSales.length;
        const salesAmount = userSales.reduce((sum: number, sale: any) => sum + getNetAmount(sale), 0);
        const returnSales = userSales.filter((sale: any) =>
          returnStatuses.has((sale.courier_status || "").toLowerCase())
        );
        const returnCount = returnSales.length;
        const returnAmount = returnSales.reduce((sum: number, sale: any) => sum + getNetAmount(sale), 0);
        const netSales = salesAmount - returnAmount;
        const customersCreated = userCustomers.length;

        return {
          userId: associate.id,
          userName: associate.full_name || 'Unknown User',
          salesCount,
          salesAmount,
          returnCount,
          returnAmount,
          netSales,
          customersCreated,
        };
      });

      // Sort by net sales descending
      return performanceData.sort((a, b) => b.netSales - a.netSales);
    },
    enabled: salesAssociates.length > 0,
  });

  // Calculate total team performance for the summary cards
  const performance = useMemo(() => {
    return allPerformance.reduce(
      (acc: any, curr: any) => ({
        salesCount: acc.salesCount + curr.salesCount,
        salesAmount: acc.salesAmount + curr.salesAmount,
        returnCount: acc.returnCount + curr.returnCount,
        returnAmount: acc.returnAmount + curr.returnAmount,
        netSales: acc.netSales + curr.netSales,
        customersCreated: acc.customersCreated + curr.customersCreated,
      }),
      {
        salesCount: 0,
        salesAmount: 0,
        returnCount: 0,
        returnAmount: 0,
        netSales: 0,
        customersCreated: 0,
      }
    );
  }, [allPerformance]);

  const displayName = useMemo(() => {
    if (isSelf) return profile?.full_name || user?.email || "User";
    return targetUser?.full_name || "User";
  }, [isSelf, profile?.full_name, targetUser?.full_name, user?.email]);

  if (!targetUserId) {
    return <div className="text-center py-8 text-muted-foreground">User not found.</div>;
  }

  if (!isSelf && !canViewOthers && !roleLoading) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <User className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">{displayName}</h1>
          <p className="text-sm text-muted-foreground">User profile details and performance</p>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
          <TabsTrigger value="profile" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">
            Profile
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">
            Performance
          </TabsTrigger>
          <TabsTrigger value="appearance" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">
            Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          {isSelf ? (
            <ProfileTab />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Account details for this user</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isTargetUserLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center">
                        {targetUser?.full_name || "Unknown User"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center">
                        {targetUser?.email || "Not available"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center">
                        {targetUser?.phone || "Not available"}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>User Role</Label>
                      <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center">
                        <Badge variant="secondary" className="capitalize">
                          {targetUser?.role || "Unknown"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Sales Team Performance
                </CardTitle>
                <CardDescription>Performance comparison of all sales associates</CardDescription>
              </div>
              <SimpleDateRangeFilter
                onDateRangeChange={(start, end) => {
                  setUserStartDate(start);
                  setUserEndDate(end);
                }}
                defaultPreset="today"
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-info/35 bg-info/50 p-4 transition-colors hover:bg-info/12">
                  <div className="flex items-center gap-2 text-info mb-2">
                    <ShoppingBag className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider">Total Sales</p>
                  </div>
                  <p className="text-2xl font-bold text-info">{performance?.salesCount.toLocaleString() || 0}</p>
                </div>

                <div className="rounded-xl border border-success/35 bg-success/50 p-4 transition-colors hover:bg-success/12">
                  <div className="flex items-center gap-2 text-success mb-2">
                    <CreditCard className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider">Sales Amount</p>
                  </div>
                  <p className="text-2xl font-bold text-success">{formatAmount(performance?.salesAmount || 0)}</p>
                </div>

                <div className="rounded-xl border border-error/35 bg-error/50 p-4 transition-colors hover:bg-error/12">
                  <div className="flex items-center gap-2 text-error mb-2">
                    <RefreshCw className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider">Returns</p>
                  </div>
                  <p className="text-2xl font-bold text-error">{performance?.returnCount.toLocaleString() || 0}</p>
                  <p className="text-xs font-medium text-error/80 mt-1">{formatAmount(performance?.returnAmount || 0)}</p>
                </div>

                <div className="rounded-xl border border-success/35 bg-success/50 p-4 transition-colors hover:bg-success/12">
                  <div className="flex items-center gap-2 text-success mb-2">
                    <TrendingUp className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider">Net Sales</p>
                  </div>
                  <p className="text-2xl font-bold text-success">{formatAmount(performance?.netSales || 0)}</p>
                </div>

                <div className="rounded-xl border border-secondary/35 bg-secondary/50 p-4 transition-colors hover:bg-secondary/12">
                  <div className="flex items-center gap-2 text-secondary mb-2">
                    <Users className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider">Customers</p>
                  </div>
                  <p className="text-2xl font-bold text-secondary">{performance?.customersCreated.toLocaleString() || 0}</p>
                </div>

                <div className="rounded-xl border border-warning/35 bg-warning/50 p-4 transition-colors hover:bg-warning/12">
                  <div className="flex items-center gap-2 text-warning mb-2">
                    <Trophy className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wider">Top Performer</p>
                  </div>
                  <p className="text-2xl font-bold text-warning truncate" title={allPerformance[0]?.userName || 'N/A'}>
                    {allPerformance[0]?.userName || 'N/A'}
                  </p>
                </div>
              </div>

              {isPerformanceLoading ? (
                <div className="text-center py-6 text-muted-foreground">Loading performance...</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>User</TableHead>
                        <TableHead>Sales</TableHead>
                        <TableHead>Sales Amount</TableHead>
                        <TableHead>Return</TableHead>
                        <TableHead>Return Amount</TableHead>
                        <TableHead>Net Sales</TableHead>
                        <TableHead>Customers</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allPerformance.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
                            No sales associates found
                          </TableCell>
                        </TableRow>
                      ) : (
                        allPerformance.map((perf: any) => (
                          <TableRow
                            key={perf.userId}
                            className={perf.userId === targetUserId ? "bg-primary/5 font-medium" : ""}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {perf.userName}
                                {perf.userId === targetUserId && (
                                  <Badge variant="outline" className="text-xs">You</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{perf.salesCount.toLocaleString()}</TableCell>
                            <TableCell>{formatAmount(perf.salesAmount)}</TableCell>
                            <TableCell>{perf.returnCount.toLocaleString()}</TableCell>
                            <TableCell>{formatAmount(perf.returnAmount)}</TableCell>
                            <TableCell className="font-semibold">{formatAmount(perf.netSales)}</TableCell>
                            <TableCell>{perf.customersCreated.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4">
          {isSelf ? (
            <AppearanceTab />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Appearance Settings
                </CardTitle>
                <CardDescription>Read-only view of user appearance preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isPreferencesLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Dark Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Toggle between light and dark themes
                        </p>
                      </div>
                      <Switch checked={!!targetUserPreferences?.dark_mode} disabled />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Compact View</Label>
                        <p className="text-sm text-muted-foreground">
                          Use a more compact layout for tables and lists
                        </p>
                      </div>
                      <Switch checked={!!targetUserPreferences?.compact_view} disabled />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
