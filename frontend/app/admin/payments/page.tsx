'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableSection } from '@/components/ds/table-section';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { PaymentStatusBadge, PaymentMethodBadge } from '@/components/shared/badges';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { paymentsApi } from '@/lib/api/misc';
import { patientsApi } from '@/lib/api/patients';
import { appointmentsApi } from '@/lib/api/appointments';
import { formatCurrency, formatDate } from '@/lib/format';
import { patientDisplayName } from '@/lib/patients/display-name';
import type { Payment, Patient, Appointment, PaymentStatus, PaymentMethod } from '@/lib/types';
import { CreditCard, Plus, Search, CheckCircle, Ban, Loader2 } from 'lucide-react';

export default function AdminPaymentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [createOpen, setCreateOpen] = useState(false);
  const [markPaidPay, setMarkPaidPay] = useState<Payment | null>(null);
  const [voidPay, setVoidPay] = useState<Payment | null>(null);

  const [form, setForm] = useState({
    patient_id: '',
    appointment_id: '',
    amount: '600',
  });

  const [paidMethod, setPaidMethod] = useState<PaymentMethod>('CASH');

  const loadData = useCallback(async () => {
    const [paymentsData, patientsData, appointmentsData] = await Promise.all([
      paymentsApi.list(),
      patientsApi.list(),
      appointmentsApi.list(),
    ]);
    setPayments(paymentsData);
    setPatients(patientsData);
    setAppointments(appointmentsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = payments.filter((p) => {
    const name = patientDisplayName(p.patient).toLowerCase();
    const matchesSearch = !search || name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPaid = payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount_cents, 0);
  const totalUnpaid = payments.filter((p) => p.status === 'UNPAID').reduce((s, p) => s + p.amount_cents, 0);

  const handleCreate = async () => {
    if (!form.patient_id || !form.amount) {
      toast({ title: 'Patient and amount are required', variant: 'destructive' });
      return;
    }
    const amountCents = Math.round(parseFloat(form.amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }

    try {
      const data = await paymentsApi.create({
        patient_id: form.patient_id,
        appointment_id: form.appointment_id || null,
        amount_cents: amountCents,
        status: 'UNPAID',
      });

      await logAudit({
        action: 'CREATE',
        resource: 'payments',
        resource_id: data.id,
        patient_id: form.patient_id,
        new_value: { amount_cents: amountCents, status: 'UNPAID' },
      });

      toast({ title: 'Invoice created', description: `Invoice ${data.invoice_number} for ${formatCurrency(amountCents)}` });
      setCreateOpen(false);
      setForm({ patient_id: '', appointment_id: '', amount: '600' });
      loadData();
    } catch (err) {
      toast({
        title: 'Failed to create invoice',
        description: err instanceof Error ? err.message : 'Create failed',
        variant: 'destructive',
      });
    }
  };

  const handleMarkPaid = async () => {
    if (!markPaidPay) return;
    try {
      await paymentsApi.update(markPaidPay.id, {
        status: 'PAID',
        method: paidMethod,
        paid_at: new Date().toISOString(),
      });
    } catch (err) {
      toast({
        title: 'Failed to mark as paid',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'UPDATE',
      resource: 'payments',
      resource_id: markPaidPay.id,
      patient_id: markPaidPay.patient_id,
      old_value: { status: 'UNPAID' },
      new_value: { status: 'PAID', method: paidMethod, paid_at: new Date().toISOString() },
    });

    toast({ title: 'Payment marked as received' });
    setMarkPaidPay(null);
    loadData();
  };

  const handleVoid = async (reason?: string) => {
    if (!voidPay) return;
    try {
      await paymentsApi.update(voidPay.id, { status: 'VOID', void_reason: reason });
    } catch (err) {
      toast({
        title: 'Failed to void invoice',
        description: err instanceof Error ? err.message : 'Void failed',
        variant: 'destructive',
      });
      return;
    }

    await logAudit({
      action: 'VOID',
      resource: 'payments',
      resource_id: voidPay.id,
      patient_id: voidPay.patient_id,
      new_value: { status: 'VOID', void_reason: reason },
    });

    toast({ title: 'Invoice voided', description: 'Reason logged for audit trail' });
    setVoidPay(null);
    loadData();
  };

  const patientAppointments = appointments.filter(
    (a) => a.patient_id === form.patient_id && a.status === 'COMPLETED'
  );

  return (
    <>
      <AppPage>
        <PageHeader
          title="Payments"
          description="Track invoices and manual payments"
          actions={
            <Button
              onClick={() => {
                setForm({ patient_id: '', appointment_id: '', amount: '600' });
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-muted-foreground">Total Collected</p>
                <p className="mt-1 text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-500/30" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(totalUnpaid)}</p>
              </div>
              <CreditCard className="h-10 w-10 text-red-500/30" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by patient name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="UNPAID">Unpaid</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <TableSection scrollLabel="Payments">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="h-10 w-10" />}
                title="No invoices found"
                description="Create a new invoice to get started."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead className="table-priority-medium">Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="table-priority-low">Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((pay) => (
                    <TableRow key={pay.id}>
                      <TableCell className="font-mono text-xs">{pay.invoice_number}</TableCell>
                      <TableCell>
                        <div className="font-medium">{patientDisplayName(pay.patient)}</div>
                      </TableCell>
                      <TableCell className="table-priority-medium text-sm text-muted-foreground">
                        {formatDate(pay.created_at)}
                      </TableCell>
                      <TableCell className="font-semibold">{formatCurrency(pay.amount_cents)}</TableCell>
                      <TableCell className="table-priority-low"><PaymentMethodBadge method={pay.method} /></TableCell>
                      <TableCell><PaymentStatusBadge status={pay.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {pay.status === 'UNPAID' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setMarkPaidPay(pay); setPaidMethod('CASH'); }}
                                className="text-green-600 hover:text-green-700"
                              >
                                <CheckCircle className="mr-1 h-4 w-4" />
                                Mark Paid
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setVoidPay(pay)}
                                aria-label="Void invoice"
                                className="text-destructive hover:text-destructive"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </TableSection>
      </AppPage>

      {/* Create invoice dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>Generate an invoice for a patient</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Patient *</Label>
              <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v, appointment_id: '' })}>
                <SelectTrigger><SelectValue placeholder="Select patient..." /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{patientDisplayName(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.patient_id && patientAppointments.length > 0 && (
              <div className="space-y-2">
                <Label>Link to Appointment (optional)</Label>
                <Select value={form.appointment_id} onValueChange={(v) => setForm({ ...form, appointment_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {patientAppointments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {formatDate(a.scheduled_at)} — {a.reason ?? 'Consultation'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Amount (R) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="600.00"
              />
              <p className="text-xs text-muted-foreground">Standard consultation fee: R600.00</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid dialog */}
      <Dialog open={!!markPaidPay} onOpenChange={(o) => !o && setMarkPaidPay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Payment Received</DialogTitle>
            <DialogDescription>
              {patientDisplayName(markPaidPay?.patient)} — {markPaidPay ? formatCurrency(markPaidPay.amount_cents) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paidMethod} onValueChange={(v) => setPaidMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="EFT">EFT (Bank Transfer)</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="MEDICAL_AID">Medical Aid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidPay(null)}>Cancel</Button>
            <Button onClick={handleMarkPaid}>Confirm Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirmation */}
      <ConfirmDialog
        open={!!voidPay}
        onOpenChange={(o) => !o && setVoidPay(null)}
        title="Void Invoice"
        description={`Void invoice ${voidPay?.invoice_number} for ${formatCurrency(voidPay?.amount_cents ?? 0)}? This will be logged in the audit trail.`}
        confirmLabel="Void Invoice"
        destructive
        requireReason
        reasonLabel="Reason for Voiding"
        onConfirm={handleVoid}
      />
    </>
  );
}
