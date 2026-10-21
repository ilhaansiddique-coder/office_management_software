// Utility function to format database errors into user-friendly messages
export const formatDatabaseError = (error: any, action: string): string => {
    // Handle different error object structures
    const errorMessage = error?.message || error?.error?.message || String(error);
    const errorCode = error?.code || error?.error?.code;
    const errorDetails = error?.details || error?.error?.details || '';

    // Combine all error information for checking
    const fullErrorText = `${errorMessage} ${errorDetails}`.toLowerCase();

    // Check for RLS (Row Level Security) policy violations
    // Common patterns: "row-level security", "policy", "new row violates", "permission denied", "blocked by permissions"
    if (
        fullErrorText.includes('row-level security') ||
        fullErrorText.includes('rls') ||
        fullErrorText.includes('policy') ||
        fullErrorText.includes('new row violates') ||
        fullErrorText.includes('permission denied') ||
        fullErrorText.includes('insufficient privilege') ||
        fullErrorText.includes('violates row-level security') ||
        fullErrorText.includes('blocked by rls') ||
        fullErrorText.includes('blocked by permissions') ||
        fullErrorText.includes('blocked by permission') ||
        errorCode === '42501' ||
        errorCode === 'PGRST301' ||
        errorCode === '23503' // Foreign key violation can also indicate permission issues
    ) {
        return `You don't have permission to ${action}`;
    }

    // Check for foreign key violations
    if (fullErrorText.includes('foreign key') || fullErrorText.includes('violates foreign key constraint')) {
        return `Cannot ${action} because it is referenced by other records`;
    }

    // Check for unique constraint violations
    if (fullErrorText.includes('unique constraint') || fullErrorText.includes('duplicate key')) {
        return `This ${action} already exists`;
    }

    // Check for not null violations
    if (fullErrorText.includes('null value') || fullErrorText.includes('violates not-null constraint')) {
        return `Required information is missing for ${action}`;
    }

    // Check for authentication errors
    if (fullErrorText.includes('jwt') || fullErrorText.includes('authentication') || fullErrorText.includes('not authenticated')) {
        return `You need to be logged in to ${action}`;
    }

    // Default fallback for other errors
    return `Failed to ${action}. Please try again or contact support.`;
};
