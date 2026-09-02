'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PaymentStatusBadge, PaymentMethodBadge } from '@/components/shared/badges';
import { EmptyState } from '@/components/shared/empty-state';
import { paymentsApi } from '@/lib/api/misc';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Payment } from '@/lib/types';
import { CreditCard, CheckCircle, Clock, Info } from 'lucide-react';

export default function PatientPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.patient?.id) return;
    const data = await paymentsApi.list({ patient_id: user.patient.id });
    setPayments(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount_cents, 0);
  const totalUnpaid = payments.filter((p) => p.status === 'UNPAID').reduce((s, p) => s + p.amount_cents, 0);

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">Your invoices and payment history</p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <Info className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <p className="text-sm text-blue-800">
            Payments are made at the clinic (cash, EFT, card, or medical aid). Online payment is not available in Phase 1.
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-6">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="mt-1 break-words text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <CheckCircle className="h-10 w-10 shrink-0 text-green-500/30" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-6">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="mt-1 break-words text-2xl font-bold text-red-600">{formatCurrency(totalUnpaid)}</p>
              </div>
              <Clock className="h-10 w-10 shrink-0 text-red-500/30" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoice History</CardTitle>
            <CardDescription>All your invoices and payment status</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
            ) : payments.length === 0 ? (
              <EmptyState icon={<CreditCard className="h-10 w-10" />} title="No invoices" description="Your invoices will appear here after your first appointment." />
            ) : (
              <div className="space-y-3">
                {payments.map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{pay.invoice_number}</p>
                      <p className="text-sm font-medium text-foreground">{formatDate(pay.created_at)}</p>
                      {pay.appointment && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(pay.appointment.scheduled_at)} — {pay.appointment.reason ?? 'Consultation'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <PaymentMethodBadge method={pay.method} />
                      <PaymentStatusBadge status={pay.status} />
                      <p className="w-24 text-right font-bold text-foreground">{formatCurrency(pay.amount_cents)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
