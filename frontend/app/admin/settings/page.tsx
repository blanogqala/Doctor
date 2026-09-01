'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { doctorsApi, profilesApi } from '@/lib/api/patients';
import { availabilityApi } from '@/lib/api/availability';
import { practiceApi } from '@/lib/api/practice';
import { useTenant, absoluteApiUrl } from '@/lib/tenant';
import type { Doctor } from '@/lib/types';
import {
  addDays,
  formatDate,
  minuteToTimeInput,
  startOfWeekMonday,
  timeInputToMinute,
  toDateInput,
} from '@/lib/format';
import { FormGrid, Field } from '@/components/ds/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ShieldCheck, Lock, Clock, Server, Globe, Save, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Trash2, Palette, MapPin, ExternalLink } from 'lucide-react';
import {
  DEFAULT_LANDING_SERVICES,
  SERVICE_ICON_OPTIONS,
  parseLandingServices,
} from '@/components/practice/practice-defaults';
import type { LandingServiceItem } from '@/lib/tenant';
import {
  applyPracticeThemeToDocument,
  resolvePracticeTheme,
} from '@/lib/theme/resolve-practice-theme';

const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type DayBlock = { start: string; end: string };
type WeekDayState = { date: string; blocks: DayBlock[] };

function emptyWeek(weekStart: Date): WeekDayState[] {
  return WEEKDAY_LABELS.map((_, i) => ({
    date: toDateInput(addDays(weekStart, i)),
    blocks: [],
  }));
}

export default function AdminSettingsPage() {
  const { user, refresh } = useAuth();
  const { practice, refresh: refreshTenant, logoSrc } = useTenant();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user?.profile?.full_name ?? '');
  const [phone, setPhone] = useState(user?.profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const [clinicName, setClinicName] = useState('');
  const [brandColor, setBrandColor] = useState('#1E40AF');
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [tagline, setTagline] = useState('');
  const [practicePhone, setPracticePhone] = useState('');
  const [practiceEmail, setPracticeEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [mapEmbedUrl, setMapEmbedUrl] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [hoursMonFri, setHoursMonFri] = useState('08:00 - 17:00');
  const [hoursSaturday, setHoursSaturday] = useState('09:00 - 13:00');
  const [hoursSunday, setHoursSunday] = useState('Closed');
  const [savingProfile, setSavingProfile] = useState(false);

  const [servicesIntro, setServicesIntro] = useState('');
  const [landingServices, setLandingServices] = useState<LandingServiceItem[]>(DEFAULT_LANDING_SERVICES);
  const [expandedServiceIndexes, setExpandedServiceIndexes] = useState<Set<number>>(new Set());
  const [savingServices, setSavingServices] = useState(false);

  const [doctorBio, setDoctorBio] = useState('');
  const [doctorCredentials, setDoctorCredentials] = useState('');
  const [telemedicineFeeRands, setTelemedicineFeeRands] = useState('450');
  const [consultationFeeRands, setConsultationFeeRands] = useState('600');
  const [doctorPhotoUrl, setDoctorPhotoUrl] = useState<string | null>(null);
  const [savingDoctorProfile, setSavingDoctorProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [days, setDays] = useState<WeekDayState[]>(() => emptyWeek(startOfWeekMonday(new Date())));
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);

  useEffect(() => {
    if (practice) {
      setClinicName(practice.clinic_name);
      setBrandColor(practice.brand_color || '#1E40AF');
      setTagline(practice.tagline || '');
      setPracticePhone(practice.phone || '');
      setPracticeEmail(practice.email || '');
      setWhatsapp(practice.whatsapp || '');
      setAddressLine1(practice.address_line1 || '');
      setCity(practice.city || '');
      setProvince(practice.province || '');
      setPostalCode(practice.postal_code || '');
      setMapEmbedUrl(practice.map_embed_url || '');
      setEmergencyPhone(practice.emergency_phone || '');
      setHoursMonFri(practice.office_hours?.monFri || '08:00 - 17:00');
      setHoursSaturday(practice.office_hours?.saturday || '09:00 - 13:00');
      setHoursSunday(practice.office_hours?.sunday || 'Closed');
      setServicesIntro(practice.services_intro || '');
      setLandingServices(parseLandingServices(practice.landing_services) ?? DEFAULT_LANDING_SERVICES);
    }
  }, [practice]);

  useEffect(() => {
    if (!practice?.doctors?.length) return;
    const selected =
      practice.doctors.find((d) => d.id === doctorId) || practice.doctors[0];
    if (!doctorId && selected) setDoctorId(selected.id);
    setDoctorBio(selected.bio || '');
    setDoctorCredentials((selected.credentials || []).join('\n'));
    setTelemedicineFeeRands(String((selected.telemedicine_fee_cents ?? 45000) / 100));
    setConsultationFeeRands(String((selected.consultation_fee_cents ?? 60000) / 100));
    setDoctorPhotoUrl(absoluteApiUrl(selected.photo_url));
  }, [practice, doctorId]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartStr = toDateInput(weekStart);
  const weekEndStr = toDateInput(weekEnd);

  useEffect(() => {
    doctorsApi.list().then((list) => {
      setDoctors(list);
      if (list.length && !doctorId) setDoctorId(list[0].id);
    }).catch(() => {
      toast({ title: 'Failed to load doctors', variant: 'destructive' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWeek = useCallback(async () => {
    if (!doctorId) return;
    setLoadingWeek(true);
    try {
      const windows = await availabilityApi.list({
        doctor_id: doctorId,
        from: weekStartStr,
        to: weekEndStr,
      });
      const base = emptyWeek(weekStart);
      for (const w of windows) {
        const dateStr = toDateInput(w.date);
        const day = base.find((d) => d.date === dateStr);
        if (day) {
          day.blocks.push({
            start: minuteToTimeInput(w.start_minute),
            end: minuteToTimeInput(w.end_minute),
          });
        }
      }
      setDays(base);
    } catch (err) {
      toast({
        title: 'Failed to load availability',
        description: err instanceof Error ? err.message : 'Load failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingWeek(false);
    }
  }, [doctorId, weekStart, weekStartStr, weekEndStr, toast]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await profilesApi.update({ full_name: fullName, phone: phone || undefined });
    } catch (err) {
      setSaving(false);
      toast({
        title: 'Failed to update settings',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
      return;
    }
    setSaving(false);
    toast({ title: 'Settings updated successfully' });
    refresh();
  };

  const updateBlock = (dayIdx: number, blockIdx: number, field: 'start' | 'end', value: string) => {
    setDays((prev) =>
      prev.map((day, i) =>
        i !== dayIdx
          ? day
          : {
              ...day,
              blocks: day.blocks.map((b, j) => (j === blockIdx ? { ...b, [field]: value } : b)),
            }
      )
    );
  };

  const addBlock = (dayIdx: number) => {
    setDays((prev) =>
      prev.map((day, i) =>
        i !== dayIdx ? day : { ...day, blocks: [...day.blocks, { start: '08:00', end: '17:00' }] }
      )
    );
  };

  const removeBlock = (dayIdx: number, blockIdx: number) => {
    setDays((prev) =>
      prev.map((day, i) =>
        i !== dayIdx ? day : { ...day, blocks: day.blocks.filter((_, j) => j !== blockIdx) }
      )
    );
  };

  const saveWeek = async () => {
    if (!doctorId) return;
    setSavingWeek(true);
    try {
      await availabilityApi.replaceWeek({
        doctor_id: doctorId,
        week_start: weekStartStr,
        days: days.map((d) => ({
          date: d.date,
          blocks: d.blocks.map((b) => ({
            start_minute: timeInputToMinute(b.start),
            end_minute: timeInputToMinute(b.end),
          })),
        })),
      });
      toast({ title: 'Availability saved', description: 'Week schedule updated for this doctor.' });
      await loadWeek();
    } catch (err) {
      toast({
        title: 'Failed to save availability',
        description: err instanceof Error ? err.message : 'Save failed',
        variant: 'destructive',
      });
    } finally {
      setSavingWeek(false);
    }
  };

  const handleSaveBrand = async () => {
    setSavingBrand(true);
    try {
      await practiceApi.update({ clinic_name: clinicName, brand_color: brandColor });
      applyPracticeThemeToDocument(resolvePracticeTheme(brandColor));
      await refreshTenant();
      toast({ title: 'Branding updated' });
    } catch (err) {
      toast({
        title: 'Failed to update branding',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setSavingBrand(false);
    }
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      await practiceApi.uploadLogo(file);
      await refreshTenant();
      toast({ title: 'Logo uploaded' });
    } catch (err) {
      toast({
        title: 'Logo upload failed',
        description: err instanceof Error ? err.message : 'Upload failed',
        variant: 'destructive',
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSavePublicProfile = async () => {
    setSavingProfile(true);
    try {
      await practiceApi.update({
        tagline: tagline || null,
        phone: practicePhone || null,
        email: practiceEmail || null,
        whatsapp: whatsapp || null,
        address_line1: addressLine1 || null,
        city: city || null,
        province: province || null,
        postal_code: postalCode || null,
        map_embed_url: mapEmbedUrl || null,
        emergency_phone: emergencyPhone || null,
        office_hours: {
          monFri: hoursMonFri,
          saturday: hoursSaturday,
          sunday: hoursSunday,
        },
      });
      await refreshTenant();
      toast({ title: 'Public profile updated' });
    } catch (err) {
      toast({
        title: 'Failed to update public profile',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveServices = async () => {
    const cleaned = landingServices
      .map((s) => ({
        title: s.title.trim(),
        description: s.description.trim(),
        icon: s.icon || 'stethoscope',
      }))
      .filter((s) => s.title);
    if (cleaned.length === 0) {
      toast({ title: 'Add at least one service', variant: 'destructive' });
      return;
    }
    setSavingServices(true);
    try {
      await practiceApi.update({
        services_intro: servicesIntro.trim() || null,
        landing_services: cleaned,
      });
      await refreshTenant();
      toast({ title: 'Landing services updated' });
    } catch (err) {
      toast({
        title: 'Failed to update services',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setSavingServices(false);
    }
  };

  const handleSaveDoctorProfile = async () => {
    const targetId = doctorId || practice?.doctors[0]?.id;
    if (!targetId) {
      toast({ title: 'No doctor found', variant: 'destructive' });
      return;
    }
    setSavingDoctorProfile(true);
    try {
      const teleCents = Math.round(parseFloat(telemedicineFeeRands || '0') * 100);
      const consultCents = Math.round(parseFloat(consultationFeeRands || '0') * 100);
      await practiceApi.updateDoctor(targetId, {
        bio: doctorBio || null,
        credentials: doctorCredentials
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        telemedicine_fee_cents: Number.isFinite(teleCents) ? teleCents : 45000,
        consultation_fee_cents: Number.isFinite(consultCents) ? consultCents : 60000,
      });
      await refreshTenant();
      toast({ title: 'Doctor profile updated' });
    } catch (err) {
      toast({
        title: 'Failed to update doctor profile',
        description: err instanceof Error ? err.message : 'Update failed',
        variant: 'destructive',
      });
    } finally {
      setSavingDoctorProfile(false);
    }
  };

  const handleDoctorPhotoUpload = async (file: File | null) => {
    const targetId = doctorId || practice?.doctors[0]?.id;
    if (!file || !targetId) return;
    setUploadingPhoto(true);
    try {
      const updated = await practiceApi.uploadDoctorPhoto(targetId, file);
      setDoctorPhotoUrl(absoluteApiUrl(updated.photo_url ?? null));
      await refreshTenant();
      toast({ title: 'Doctor photo uploaded' });
    } catch (err) {
      toast({
        title: 'Photo upload failed',
        description: err instanceof Error ? err.message : 'Upload failed',
        variant: 'destructive',
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const complianceItems = [
    { icon: Lock, label: 'Encryption', value: 'TLS in transit; configure at-rest encryption with your hosting provider' },
    { icon: Clock, label: 'Session Timeout', value: '15 minutes inactivity (recommended)' },
    { icon: Server, label: 'Hosting', value: 'Configure region with your infrastructure provider (hosting not finalized)' },
    { icon: ShieldCheck, label: 'Audit Logging', value: 'Enabled — operational access logs' },
    { icon: Globe, label: 'Telemedicine consent', value: 'Consent-aware workflows available — configure Practice responsibly' },
  ];

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account, doctor availability, and compliance</p>
        </div>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="doctors">Doctors</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
          </TabsList>

          <TabsContent value="practice" className="space-y-6">
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                View landing page
              </Link>
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Practice Branding</CardTitle>
              <CardDescription>Clinic name, brand colour, and logo shown to patients</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormGrid>
                <Field id="clinicName" label="Clinic name" required>
                  <Input
                    id="clinicName"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                  />
                </Field>
                <Field
                  id="brandColor"
                  label="Brand colour"
                  hint="Used for navigation accents and primary actions. Unreadable colours are adjusted automatically."
                >
                  <div className="flex items-center gap-3">
                    <Input
                      id="brandColor"
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-10 w-16 cursor-pointer p-1"
                    />
                    <Input
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="font-mono"
                      aria-label="Brand colour hex"
                    />
                  </div>
                </Field>
              </FormGrid>
              <Field id="logo" label="Logo" hint="PNG, JPEG, WebP or GIF — max 5MB">
                <div className="flex flex-wrap items-center gap-4">
                  {logoSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoSrc}
                      alt=""
                      className="h-12 w-12 rounded-md bg-muted object-contain"
                    />
                  )}
                  <Input
                    id="logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
                    disabled={uploadingLogo}
                    className="max-w-xs"
                  />
                </div>
              </Field>
              <Button onClick={handleSaveBrand} loading={savingBrand}>
                <Palette className="h-4 w-4" />
                Save branding
              </Button>
            </CardContent>
          </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Landing page — Our Services</CardTitle>
            <CardDescription>
              Service cards shown on the public landing page. Leave empty titles out when saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="servicesIntro">Section subtitle</Label>
              <Input
                id="servicesIntro"
                value={servicesIntro}
                onChange={(e) => setServicesIntro(e.target.value)}
                placeholder="Comprehensive primary care for you and your family."
              />
            </div>
            <div className="space-y-3">
              {landingServices.map((service, index) => {
                const isExpanded = expandedServiceIndexes.has(index);
                const headerLabel = service.title.trim() || `Service ${index + 1}`;
                return (
                  <div
                    key={index}
                    className="space-y-3 rounded-lg border border-primary p-3 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">
                        {headerLabel}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs text-muted-foreground"
                          onClick={() =>
                            setExpandedServiceIndexes((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              View less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              View more
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          onClick={() => {
                            setLandingServices((prev) => prev.filter((_, i) => i !== index));
                            setExpandedServiceIndexes((prev) => {
                              const next = new Set<number>();
                              for (const i of prev) {
                                if (i < index) next.add(i);
                                else if (i > index) next.add(i - 1);
                              }
                              return next;
                            });
                          }}
                          aria-label={`Remove service ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`service-title-${index}`}>Title</Label>
                            <Input
                              id={`service-title-${index}`}
                              value={service.title}
                              onChange={(e) =>
                                setLandingServices((prev) =>
                                  prev.map((s, i) =>
                                    i === index ? { ...s, title: e.target.value } : s
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`service-icon-${index}`}>Icon</Label>
                            <Select
                              value={service.icon}
                              onValueChange={(value) =>
                                setLandingServices((prev) =>
                                  prev.map((s, i) =>
                                    i === index ? { ...s, icon: value } : s
                                  )
                                )
                              }
                            >
                              <SelectTrigger id={`service-icon-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SERVICE_ICON_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`service-desc-${index}`}>Description</Label>
                          <Textarea
                            id={`service-desc-${index}`}
                            rows={2}
                            value={service.description}
                            onChange={(e) =>
                              setLandingServices((prev) =>
                                prev.map((s, i) =>
                                  i === index ? { ...s, description: e.target.value } : s
                                )
                              )
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLandingServices((prev) => [
                    ...prev,
                    { title: '', description: '', icon: 'stethoscope' },
                  ]);
                  setExpandedServiceIndexes((prev) => new Set(prev).add(landingServices.length));
                }}
                disabled={landingServices.length >= 12}
              >
                <Plus className="h-4 w-4" />
                Add service
              </Button>
              <Button onClick={handleSaveServices} loading={savingServices}>
                <Save className="h-4 w-4" />
                Save services
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Public Profile</CardTitle>
            <CardDescription>
              Contact details, hours, and location shown on your patient landing page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Quality healthcare for the whole family…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="practicePhone">Phone</Label>
                <Input
                  id="practicePhone"
                  value={practicePhone}
                  onChange={(e) => setPracticePhone(e.target.value)}
                  placeholder="043 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="043 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="practiceEmail">Email</Label>
                <Input
                  id="practiceEmail"
                  type="email"
                  value={practiceEmail}
                  onChange={(e) => setPracticeEmail(e.target.value)}
                  placeholder="reception@practice.co.za"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Emergency phone</Label>
                <Input
                  id="emergencyPhone"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="082 123 4567"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="123 Main Street"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Province</Label>
                <Input id="province" value={province} onChange={(e) => setProvince(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal">Postal code</Label>
                <Input id="postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapEmbed">Google Maps embed URL</Label>
              <Input
                id="mapEmbed"
                value={mapEmbedUrl}
                onChange={(e) => setMapEmbedUrl(e.target.value)}
                placeholder="https://maps.google.com/maps?q=…&output=embed"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="hoursMonFri">Mon–Fri hours</Label>
                <Input
                  id="hoursMonFri"
                  value={hoursMonFri}
                  onChange={(e) => setHoursMonFri(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hoursSat">Saturday hours</Label>
                <Input
                  id="hoursSat"
                  value={hoursSaturday}
                  onChange={(e) => setHoursSaturday(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hoursSun">Sunday hours</Label>
                <Input
                  id="hoursSun"
                  value={hoursSunday}
                  onChange={(e) => setHoursSunday(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleSavePublicProfile} disabled={savingProfile}>
              <MapPin className="mr-2 h-4 w-4" />
              {savingProfile ? 'Saving…' : 'Save public profile'}
            </Button>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="doctors" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Doctor Public Profile</CardTitle>
            <CardDescription>Bio, credentials, fees, and photo for the landing page</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Doctor</Label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.profile?.full_name ?? 'Doctor'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doctorBio">Bio</Label>
              <Textarea
                id="doctorBio"
                value={doctorBio}
                onChange={(e) => setDoctorBio(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credentials">Credentials (one per line)</Label>
              <Textarea
                id="credentials"
                value={doctorCredentials}
                onChange={(e) => setDoctorCredentials(e.target.value)}
                rows={4}
                placeholder="MBChB, University of Cape Town"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="consultFee">In-person fee (R)</Label>
                <Input
                  id="consultFee"
                  type="number"
                  min={0}
                  step={1}
                  value={consultationFeeRands}
                  onChange={(e) => setConsultationFeeRands(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teleFee">Telemedicine fee (R)</Label>
                <Input
                  id="teleFee"
                  type="number"
                  min={0}
                  step={1}
                  value={telemedicineFeeRands}
                  onChange={(e) => setTelemedicineFeeRands(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="doctorPhoto">Photo</Label>
              <div className="flex items-center gap-4">
                {doctorPhotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={doctorPhotoUrl}
                    alt="Doctor"
                    className="h-16 w-16 rounded-lg object-cover bg-muted"
                  />
                )}
                <Input
                  id="doctorPhoto"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => handleDoctorPhotoUpload(e.target.files?.[0] ?? null)}
                  disabled={uploadingPhoto}
                />
              </div>
            </div>
            <Button onClick={handleSaveDoctorProfile} disabled={savingDoctorProfile}>
              <Save className="mr-2 h-4 w-4" />
              {savingDoctorProfile ? 'Saving…' : 'Save doctor profile'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Doctor Availability</CardTitle>
            <CardDescription>
              Set each doctor&apos;s hours week by week. Days with no blocks are unavailable. Patients can only book inside these windows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2 sm:w-72">
                <Label>Doctor</Label>
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select doctor" />
                  </SelectTrigger>
                  <SelectContent>
                    {doctors.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.profile?.full_name ?? 'Doctor'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setWeekStart((w) => addDays(w, -7))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="min-w-[180px] text-center text-sm font-medium">
                  {formatDate(weekStart)} – {formatDate(weekEnd)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setWeekStart((w) => addDays(w, 7))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {loadingWeek ? (
              <p className="text-sm text-muted-foreground">Loading week…</p>
            ) : (
              <div className="space-y-4">
                {days.map((day, dayIdx) => (
                  <div key={day.date} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{WEEKDAY_LABELS[dayIdx]}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(day.date)}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => addBlock(dayIdx)}>
                        <Plus className="mr-1 h-3 w-3" /> Add block
                      </Button>
                    </div>
                    {day.blocks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Unavailable (no hours set)</p>
                    ) : (
                      <div className="space-y-2">
                        {day.blocks.map((block, blockIdx) => (
                          <div key={blockIdx} className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              value={block.start}
                              onChange={(e) => updateBlock(dayIdx, blockIdx, 'start', e.target.value)}
                              className="w-[130px]"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input
                              type="time"
                              value={block.end}
                              onChange={(e) => updateBlock(dayIdx, blockIdx, 'end', e.target.value)}
                              className="w-[130px]"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => removeBlock(dayIdx, blockIdx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button onClick={saveWeek} disabled={savingWeek || !doctorId || loadingWeek}>
              <Save className="mr-2 h-4 w-4" />
              {savingWeek ? 'Saving week…' : 'Save week availability'}
            </Button>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Profile Information</CardTitle>
                <CardDescription>Update your Receptionist personal details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user?.email ?? ''} disabled />
                  <p className="text-xs text-muted-foreground">Email cannot be changed — contact support</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
                </div>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compliance & Security</CardTitle>
                <CardDescription>
                  Security controls and operational reminders — configure your Practice responsibly
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {complianceItems.map((item, idx) => (
                  <div key={item.label}>
                    {idx > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary/10">
                        <item.icon className="h-5 w-5 text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{item.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
