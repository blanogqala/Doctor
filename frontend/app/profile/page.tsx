'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { usePracticeAccess } from '@/lib/use-practice-access';
import { DashboardLayout } from '@/components/shared/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { patientsApi, profilesApi } from '@/lib/api/patients';
import { authApi } from '@/lib/api/auth';
import { formatDate } from '@/lib/format';
import type { Patient } from '@/lib/types';
import {
  User,
  Phone,
  Mail,
  MapPin,
  HeartPulse,
  Pill,
  Shield,
  Loader2,
  Save,
  Lock,
  KeyRound,
} from 'lucide-react';

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const { canMutate, mutationHint, isPatient } = usePracticeAccess();
  const { toast } = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingMedical, setSavingMedical] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [personalForm, setPersonalForm] = useState({
    full_name: '',
    phone: '',
  });

  const [medicalForm, setMedicalForm] = useState({
    medical_history: '',
    allergies: '',
    current_medications: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const load = useCallback(async () => {
    if (!user?.patient?.id) return;
    const pat = await patientsApi.getById(user.patient.id);

    setPatient(pat);
    if (pat) {
      setPersonalForm({
        full_name: pat.profile?.full_name ?? '',
        phone: pat.profile?.phone ?? '',
      });
      setMedicalForm({
        medical_history: pat.medical_history ?? '',
        allergies: pat.allergies ?? '',
        current_medications: pat.current_medications ?? '',
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSavePersonal = async () => {
    if (!personalForm.full_name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter your full name.',
        variant: 'destructive',
      });
      return;
    }

    setSavingPersonal(true);
    try {
      await profilesApi.update({
        full_name: personalForm.full_name.trim(),
        phone: personalForm.phone.trim() || undefined,
      });
      await refresh();
      toast({ title: 'Profile updated', description: 'Your personal information has been saved.' });
      await load();
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSaveMedical = async () => {
    if (!patient || !user?.patient?.id) return;
    setSavingMedical(true);
    try {
      await patientsApi.update(patient.id, {
        medical_history: medicalForm.medical_history || null,
        allergies: medicalForm.allergies || null,
        current_medications: medicalForm.current_medications || null,
      });
    } catch (err) {
      setSavingMedical(false);
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Save failed',
        variant: 'destructive',
      });
      return;
    }

    setSavingMedical(false);

    await logAudit({
      action: 'UPDATE',
      resource: 'patients',
      resource_id: patient.id,
      patient_id: patient.id,
      new_value: {
        medical_history: medicalForm.medical_history,
        allergies: medicalForm.allergies,
        current_medications: medicalForm.current_medications,
      },
    });

    toast({
      title: 'Medical details saved',
      description:
        'Your information is confidential and only accessible by authorized medical personnel.',
    });
    load();
  };

  const handleChangePassword = async () => {
    if (passwordForm.new_password.length < 8) {
      toast({
        title: 'Password too short',
        description: 'New password must be at least 8 characters.',
        variant: 'destructive',
      });
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast({
        title: 'Passwords do not match',
        description: 'New password and confirmation must match.',
        variant: 'destructive',
      });
      return;
    }

    setSavingPassword(true);
    try {
      await authApi.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
    } catch (err) {
      toast({
        title: 'Failed to change password',
        description: err instanceof Error ? err.message : 'Password change failed',
        variant: 'destructive',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const profile = patient?.profile;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground">Your personal information and medical details</p>
        </div>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Personal Information
            </CardTitle>
            <CardDescription>Update your name and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={personalForm.full_name}
                  onChange={(e) =>
                    setPersonalForm({ ...personalForm, full_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Patient ID</Label>
                <p className="flex h-10 items-center font-mono text-sm text-foreground">
                  {patient?.id?.slice(0, 8) ?? '—'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    className="pl-9"
                    value={profile?.email ?? user?.email ?? ''}
                    disabled
                  />
                </div>
                <p className="text-xs text-muted-foreground">Email cannot be changed — contact support</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    className="pl-9"
                    value={personalForm.phone}
                    onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                    placeholder="+27 82 123 4567"
                  />
                </div>
              </div>
              {patient?.id_number_last4 && (
                <div className="space-y-2">
                  <Label>ID Number (last 4)</Label>
                  <p className="flex h-10 items-center text-sm text-foreground">
                    ...{patient.id_number_last4}
                  </p>
                </div>
              )}
              {patient?.date_of_birth && (
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <p className="flex h-10 items-center text-sm text-foreground">
                    {formatDate(patient.date_of_birth)}
                  </p>
                </div>
              )}
              {patient?.city && (
                <div className="space-y-2">
                  <Label>City</Label>
                  <div className="flex h-10 items-center gap-2 text-sm text-foreground">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {patient.city}, {patient.province}
                  </div>
                </div>
              )}
              {patient?.medical_aid_provider && (
                <div className="space-y-2">
                  <Label>Medical Aid</Label>
                  <p className="flex h-10 items-center text-sm text-foreground">
                    {patient.medical_aid_provider}
                    {patient.medical_aid_number ? ` (${patient.medical_aid_number})` : ''}
                  </p>
                </div>
              )}
            </div>
            <Button onClick={handleSavePersonal} disabled={savingPersonal || (isPatient && !canMutate)} title={isPatient && !canMutate ? mutationHint : undefined}>
              {savingPersonal ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Medical Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HeartPulse className="h-5 w-5 text-primary" />
              Medical Details
            </CardTitle>
            <CardDescription className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              This information is confidential and only accessible by authorized medical personnel. It
              will help your doctor provide better care. Fill this in at your own discretion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
                Medical History
              </Label>
              <Textarea
                value={medicalForm.medical_history}
                onChange={(e) =>
                  setMedicalForm({ ...medicalForm, medical_history: e.target.value })
                }
                rows={3}
                placeholder="Previous conditions, surgeries, chronic illnesses, family history..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Allergies
              </Label>
              <Textarea
                value={medicalForm.allergies}
                onChange={(e) => setMedicalForm({ ...medicalForm, allergies: e.target.value })}
                rows={2}
                placeholder="Known allergies to medications, foods, or other substances..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-muted-foreground" />
                Current Medications
              </Label>
              <Textarea
                value={medicalForm.current_medications}
                onChange={(e) =>
                  setMedicalForm({ ...medicalForm, current_medications: e.target.value })
                }
                rows={2}
                placeholder="Medications you are currently taking, including dosage and frequency..."
              />
            </div>
            <Button onClick={handleSaveMedical} disabled={savingMedical || (isPatient && !canMutate)} title={isPatient && !canMutate ? mutationHint : undefined}>
              {savingMedical ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Medical Details
            </Button>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Change your account password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={passwordForm.current_password}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, current_password: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={passwordForm.new_password}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, new_password: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirm_password}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                }
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={
                savingPassword ||
                !passwordForm.current_password ||
                !passwordForm.new_password ||
                !passwordForm.confirm_password
              }
            >
              {savingPassword ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              Change Password
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
