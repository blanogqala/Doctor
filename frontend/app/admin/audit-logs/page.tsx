'use client';

import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { StatusBadge, type StatusTone } from '@/components/ds/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { auditApi } from '@/lib/api/misc';
import { formatAuditTimestamp } from '@/lib/format';
import type { AuditLog } from '@/lib/types';
import { ScrollText, Search, Download, Lock, ShieldCheck } from 'lucide-react';

const actionTone: Record<string, StatusTone> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  SOFT_DELETE: 'warning',
  READ: 'neutral',
  CANCEL: 'warning',
  VOID: 'danger',
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resourceFilter, setResourceFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  const loadLogs = useCallback(async () => {
    const params: Record<string, string> = { limit: '200' };
    if (resourceFilter !== 'ALL') params.resource = resourceFilter;
    if (actionFilter !== 'ALL') params.action = actionFilter;

    const data = await auditApi.list(params);
    setLogs(data);
    setLoading(false);
  }, [resourceFilter, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = logs.filter((l) => {
    const actor = l.actor?.full_name ?? '';
    const matchesSearch =
      !search ||
      actor.toLowerCase().includes(search.toLowerCase()) ||
      l.resource.toLowerCase().includes(search.toLowerCase()) ||
      (l.resource_id ?? '').includes(search);
    return matchesSearch;
  });

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Actor', 'Action', 'Resource', 'Resource ID', 'Patient ID'].join(','),
      ...filtered.map((l) =>
        [
          l.created_at,
          l.actor?.full_name ?? 'System',
          l.action,
          l.resource,
          l.resource_id ?? '',
          l.patient_id ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
            <p className="text-sm text-muted-foreground">
              Immutable record of data access and modifications
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-secondary/30 bg-secondary/5 p-3">
          <ShieldCheck className="h-5 w-5 flex-shrink-0 text-secondary" />
          <p className="text-sm text-foreground">
            These logs are <strong>immutable</strong> — no entry can be modified or deleted, even by administrators.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by actor, resource, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={resourceFilter} onValueChange={setResourceFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Resource" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All resources</SelectItem>
              <SelectItem value="patients">Patients</SelectItem>
              <SelectItem value="appointments">Appointments</SelectItem>
              <SelectItem value="medical_records">Medical Records</SelectItem>
              <SelectItem value="payments">Payments</SelectItem>
              <SelectItem value="prescriptions">Prescriptions</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              <SelectItem value="CREATE">Create</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
              <SelectItem value="SOFT_DELETE">Archive</SelectItem>
              <SelectItem value="CANCEL">Cancel</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
              <SelectItem value="READ">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TableSection scrollLabel="Audit logs">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="h-10 w-10" />}
                title="No audit entries"
                description="No log entries match your current filters."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead className="table-priority-low">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatAuditTimestamp(log.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[8rem] truncate font-medium sm:max-w-none">
                        {log.actor?.full_name ?? 'System'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={actionTone[log.action] ?? 'neutral'}
                          label={log.action.replace(/_/g, ' ').toLowerCase()}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{log.resource.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="table-priority-low max-w-md truncate text-xs text-muted-foreground">
                        {log.resource_id && <span>ID: {log.resource_id.slice(0, 8)}... </span>}
                        {log.patient_id && <span>Patient: {log.patient_id.slice(0, 8)}... </span>}
                        {log.new_value && Object.keys(log.new_value).length > 0 && (
                          <span>Changed: {Object.keys(log.new_value).join(', ')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </TableSection>

        <p className="text-center text-xs text-muted-foreground">
          Showing {filtered.length} of {logs.length} entries (max 200 loaded)
        </p>
      </div>
    </DashboardLayout>
  );
}
