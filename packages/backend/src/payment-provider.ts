export interface PaymentRequest {
  orderId: string;
  amount: number;
  outcome: 'success' | 'failure';
}
export interface PaymentResult {
  status: 'succeeded' | 'failed';
  provider: string;
}
export interface PaymentProvider {
  charge(request: PaymentRequest): Promise<PaymentResult>;
}
/** Development-only adapter. Real providers should confirm payment through verified webhooks. */
export class MockPaymentProvider implements PaymentProvider {
  async charge(request: PaymentRequest): Promise<PaymentResult> {
    if (!Number.isInteger(request.amount) || request.amount < 0)
      throw new Error('Invalid payment amount');
    return { status: request.outcome === 'failure' ? 'failed' : 'succeeded', provider: 'mock' };
  }
}
