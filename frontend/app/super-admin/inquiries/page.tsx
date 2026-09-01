'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { superAdminApi, type InquirySummary } from '@/lib/api/super-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { formatDate } from '@/lib/format';
import { formatInterestedPlanDisplay } from '@/lib/subscription-plans';
import { toast } from 'sonner';

function inquiryTone(status: string): StatusTone {
  switch (status) {
    case 'NEW':
      return 'primary';
    case 'CONTACTED':
      return 'info';
    case 'CONVERTED':
      return 'success';
    case 'DECLINED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function practiceTypeLabel(type: string): string {
  switch (type) {
    case 'SOLO':
      return 'Solo';
    case 'SMALL_CLINIC':
      return 'Small Clinic';
    case 'LARGE_CLINIC':
      return 'Large Clinic';
    default:
      return type;
  }
}

export default function SuperAdminInquiriesPage() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<InquirySummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current;
    if (!opts?.silent) setLoading(true);
    setError(null);
    const filter = statusFilter === 'all' ? undefined : statusFilter;
    try {
      const list = await superAdminApi.listInquiries(filter);
      if (requestId !== requestIdRef.current) return;
      setInquiries(list);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load({ silent: true });
  }, [load]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await superAdminApi.updateInquiry(id, status);
      toast.success(`Inquiry marked as ${status.toLowerCase()}`);
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const startOnboarding = (inquiry: InquirySummary) => {
    sessionStorage.setItem(
      `inquiry-prefill-${inquiry.id}`,
      JSON.stringify({
        full_name: inquiry.full_name,
        email: inquiry.email,
        hpcsa_number: inquiry.hpcsa_number,
        practice_name: inquiry.practice_name,
        practice_type: inquiry.practice_type,
        requested_subscription_plan: inquiry.requested_subscription_plan,
      })
    );
    router.push(`/super-admin/practices/new?inquiryId=${inquiry.id}`);
  };

  const locationLabel = (inquiry: InquirySummary) =>
    inquiry.province ? `${inquiry.city}, ${inquiry.province}` : inquiry.city;

  return (
    <AppPage>
      <PageHeader
        title="Practice inquiries"
        description="Doctor signup requests from the marketing landing page."
        actions={
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="CONTACTED">Contacted</SelectItem>
              <SelectItem value="CONVERTED">Converted</SelectItem>
              <SelectItem value="DECLINED">Declined</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Inquiries</CardTitle>
          <CardDescription>
            {loading && inquiries.length === 0
              ? 'Loading…'
              : `${inquiries.length} inquiry(ies)${loading ? ' · Refreshing…' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && inquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : inquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inquiries yet.</p>
          ) : (
            <div className="divide-y">
              {inquiries.map((inquiry) => (
                <div key={inquiry.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{inquiry.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {locationLabel(inquiry)} · HPCSA {inquiry.hpcsa_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Interested plan:{' '}
                        {formatInterestedPlanDisplay(inquiry.requested_subscription_plan) ??
                          'Plan not selected'}
                        {!inquiry.requested_subscription_plan && inquiry.practice_type && (
                          <span className="text-xs">
                            {' '}
                            (legacy type: {practiceTypeLabel(inquiry.practice_type)})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inquiry.email} · {inquiry.phone} · {formatDate(inquiry.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={inquiryTone(inquiry.status)} label={inquiry.status} />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedId(expandedId === inquiry.id ? null : inquiry.id)
                        }
                      >
                        {expandedId === inquiry.id ? 'Hide' : 'Details'}
                      </Button>
                    </div>
                  </div>

                  {expandedId === inquiry.id && (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
                      {inquiry.province && (
                        <p>
                          <span className="font-medium">Province:</span> {inquiry.province}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Interested plan:</span>{' '}
                        {formatInterestedPlanDisplay(inquiry.requested_subscription_plan) ??
                          'Plan not selected'}
                      </p>
                      {!inquiry.requested_subscription_plan && inquiry.practice_type && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Legacy practice type:</span>{' '}
                          {practiceTypeLabel(inquiry.practice_type)}
                        </p>
                      )}
                      {inquiry.practice_name && (
                        <p>
                          <span className="font-medium">Practice:</span> {inquiry.practice_name}
                        </p>
                      )}
                      {inquiry.referral_source && (
                        <p>
                          <span className="font-medium">Referral:</span> {inquiry.referral_source}
                        </p>
                      )}
                      {inquiry.message && (
                        <p className="mt-2">
                          <span className="font-medium">Message:</span> {inquiry.message}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {inquiry.status === 'NEW' && (
                          <Button size="sm" onClick={() => updateStatus(inquiry.id, 'CONTACTED')}>
                            Mark Contacted
                          </Button>
                        )}
                        {inquiry.status !== 'DECLINED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => updateStatus(inquiry.id, 'DECLINED')}
                          >
                            Decline
                          </Button>
                        )}
                        {inquiry.status !== 'CONVERTED' && (
                          <Button size="sm" onClick={() => startOnboarding(inquiry)}>
                            Start Onboarding
                          </Button>
                        )}
                        {inquiry.status === 'CONVERTED' && (
                          <Button size="sm" variant="outline" asChild>
                            <Link href="/super-admin/practices">View practices</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppPage>
  );
}
