import { ReactNode } from "react";
import { useUserRole } from "@/hooks/useUserRole";

interface PermissionGateProps {
    permission: string;
    children: ReactNode;
    fallback?: ReactNode;
}

/**
 * PermissionGate - Conditionally renders children based on permission check
 * 
 * Usage:
 * <PermissionGate permission="products.edit">
 *   <Button>Edit Product</Button>
 * </PermissionGate>
 */
export const PermissionGate = ({ permission, children, fallback = null }: PermissionGateProps) => {
    const { hasPermission, isLoading } = useUserRole();

    if (isLoading) {
        return <>{fallback}</>;
    }

    if (!hasPermission(permission)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
};
