import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/utils/toast";

export function AdminRecovery() {
  const [isRestoring, setIsRestoring] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRestore = async () => {
    if (!user) {
      toast.error("You must be logged in to restore admin access");
      return;
    }

    setIsRestoring(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error("Missing auth session. Please sign out and sign in again.");
      }

      const { data, error } = await supabase.functions.invoke('restore-admin', {
        headers: {
          "x-user-access-token": sessionData.session.access_token,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to restore admin access');
      }

      await queryClient.invalidateQueries({ queryKey: ["userRole", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["has-admin"] });
      toast.success("Admin access restored successfully.");
      navigate("/");

    } catch (error: any) {
      console.error('Restore admin error:', error);

      const rawMessage = error?.message || 'Failed to restore admin access';
      const normalized = rawMessage.toLowerCase();
      let message = "We could not restore admin access. Please try again.";

      if (normalized.includes("admin already exists")) {
        message = "An admin already exists. Please sign in with an admin account.";
      } else if (normalized.includes("missing auth") || normalized.includes("not authenticated")) {
        message = "Your session expired. Please sign out and sign in again.";
      }

      toast.error(message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 p-3 bg-warning/12 dark:bg-warning/20 rounded-full">
            <AlertTriangle className="h-6 w-6 text-warning dark:text-warning" />
          </div>
          <CardTitle className="text-xl">Admin Access Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Your account does not have a role assigned yet. 
            This typically happens after an app reset or if you're the first user.
            Click the button below to set up your account with admin access.
          </p>
          <Button 
            onClick={handleRestore}
            disabled={isRestoring}
            className="w-full"
            size="lg"
          >
            {isRestoring ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Restoring Access...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Restore Admin Access
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
