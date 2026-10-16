import { Button } from '@/components/ui/button';
export function QueryState({
  loading,
  error,
  onRetry,
}: {
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  if (error)
    return (
      <div className="empty query-error" role="alert">
        <h3>We couldn’t load this page.</h3>
        <p>{error.message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  if (loading)
    return (
      <div className="loading-state" role="status" aria-live="polite">
        <span className="loading-spinner" />
        Loading…
      </div>
    );
  return null;
}
