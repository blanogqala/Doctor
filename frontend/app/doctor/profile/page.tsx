'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { practiceApi } from '@/lib/api/practice';
import { AppPage } from '@/components/layout/app-page';
import { PageHeader } from '@/components/layout/page-header';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DoctorProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, refresh } = useAuth();
  const [bio, setBio] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [telemedicineFee, setTelemedicineFee] = useState('');
  const [credentials, setCredentials] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'DOCTOR' || !user.doctor) {
      router.replace('/dashboard');
      return;
    }
    const doctor = user.doctor;
    setBio(doctor.bio ?? '');
    setConsultationFee(String((doctor.consultation_fee_cents ?? 0) / 100));
    setTelemedicineFee(String(((user.doctor.telemedicine_fee_cents ?? 0) / 100)));
    const creds = user.doctor.credentials;
    setCredentials(Array.isArray(creds) ? creds.join('\n') : '');
  }, [authLoading, user, router]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.doctor) return;
    setSaving(true);
    try {
      await practiceApi.updateDoctor(user.doctor.id, {
        bio: bio.trim() || null,
        consultation_fee_cents: Math.round(Number(consultationFee) * 100),
        telemedicine_fee_cents: Math.round(Number(telemedicineFee) * 100),
        credentials: credentials
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      await refresh();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.doctor) return;
    setUploading(true);
    try {
      await practiceApi.uploadDoctorPhoto(user.doctor.id, file);
      await refresh();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (authLoading || !user?.doctor) {
    return (
      <DashboardLayout>
        <AppPage>
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        </AppPage>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <AppPage>
        <PageHeader
          title="My profile"
          description="Update your public doctor profile — branding is managed by Reception."
        />

        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>{user.profile?.full_name ?? user.email}</CardTitle>
            <CardDescription>
              HPCSA {user.doctor.hpcsa_registration_number ?? '—'} · {user.doctor.specialization}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="photo">Profile photo</Label>
                <Input id="photo" type="file" accept="image/*" disabled={uploading} onChange={onPhoto} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="consult">Consultation fee (ZAR)</Label>
                  <Input
                    id="consult"
                    type="number"
                    min={0}
                    step={1}
                    value={consultationFee}
                    onChange={(e) => setConsultationFee(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tele">Telemedicine fee (ZAR)</Label>
                  <Input
                    id="tele"
                    type="number"
                    min={0}
                    step={1}
                    value={telemedicineFee}
                    onChange={(e) => setTelemedicineFee(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="creds">Credentials (one per line)</Label>
                <Textarea
                  id="creds"
                  rows={4}
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </AppPage>
    </DashboardLayout>
  );
}
