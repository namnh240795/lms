import { ShoppingBag, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QueryState } from '@/components/query-state';
import { money, type Order, type Enrollment } from '@/lib/api';
export function OrdersPage({
  orders,
  enrollments,
  loading,
  error,
  onLearning,
  onExplore,
  onRetryOrder,
  onRetry,
}: {
  orders: Order[];
  enrollments: Enrollment[];
  loading: boolean;
  error: Error | null;
  onLearning: () => void;
  onExplore: () => void;
  onRetryOrder: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="workspace">
      <div className="eyebrow">YOUR LEARNING INVESTMENTS</div>
      <h1>My orders</h1>
      <p className="muted">Test checkout only. No money is charged.</p>
      {loading || error ? (
        <QueryState loading={loading} error={error} onRetry={onRetry} />
      ) : orders.length ? (
        <div className="tutor-list">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardContent>
                <div>
                  <span className={`pill ${o.status}`}>
                    {o.status === 'paid'
                      ? 'Confirmed'
                      : o.status === 'pending'
                        ? 'Processing'
                        : 'Payment failed'}
                  </span>
                  <h3>{o.title}</h3>
                  <p className="muted small">{money(o.amount)} · Mock payment</p>
                </div>
                {o.status === 'paid' ? (
                  <Button
                    disabled={!enrollments.some((e) => e.course_id === o.course_id)}
                    onClick={() => {
                      onLearning();
                    }}
                  >
                    {enrollments.some((e) => e.course_id === o.course_id)
                      ? 'Start learning'
                      : 'Preparing enrollment…'}
                    <ArrowRight size={15} />
                  </Button>
                ) : o.status === 'failed' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onRetryOrder(o.course_id);
                    }}
                  >
                    Try again
                  </Button>
                ) : (
                  <span className="muted small">Confirming your order…</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="empty">
          <ShoppingBag size={36} />
          <h3>No orders yet</h3>
          <Button onClick={() => onExplore()}>Find a course</Button>
        </div>
      )}
    </section>
  );
}
