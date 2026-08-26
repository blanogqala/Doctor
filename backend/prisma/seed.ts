import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  UserRole,
  SubscriptionStatus,
  SubscriptionPlan,
  SubscriptionInvoiceStatus,
  Prisma,
  AppointmentStatus,
  AppointmentType,
} from '@prisma/client';
import { hashToken } from '../src/utils/secureToken';
import {
  assertPhase7DemoSeedPeriodsUnique,
  buildPhase7DemoSeedInvoicePeriods,
  PHASE7_SEED_INVOICE_NUMBERS,
} from '../src/config/seedPhase7InvoicePeriods';

const prisma = new PrismaClient();

const DEFAULT_PRACTICE_ID = 'a0000000-0000-4000-8000-000000000001';

const OFFICE_HOURS = {
  monFri: '08:00 - 17:00',
  saturday: '09:00 - 13:00',
  sunday: 'Closed',
} as const;

const DOCTOR_CREDENTIALS = [
  'MBChB, University of Cape Town',
  '15+ Years Experience',
  'HPCSA Registered (MP1234567)',
  'Member of South African Medical Association',
];

const DOCTOR_BIO =
  'Dr. Ndamase has been serving the Eastern Cape community for over 15 years. He completed his medical degree at the University of Cape Town and specializes in family medicine with a focus on preventive care. He is fluent in English, isiXhosa, and Afrikaans.';

async function ensurePractice() {
  const publicProfile = {
    tagline: 'Quality healthcare for the whole family. Book online in 2 minutes.',
    phone: '043 123 4567',
    email: 'reception@easterncapepractice.co.za',
    whatsapp: '043 123 4567',
    addressLine1: '123 Main Street',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    postalCode: '6001',
    mapEmbedUrl:
      'https://maps.google.com/maps?q=123+Main+Street,+Port+Elizabeth,+6001&output=embed',
    emergencyPhone: '082 123 4567',
    officeHours: OFFICE_HOURS as unknown as Prisma.InputJsonValue,
  };

  const existing = await prisma.practice.findUnique({ where: { subdomain: 'eastern-cape' } });
  if (existing) {
    return prisma.practice.update({
      where: { id: existing.id },
      data: {
        ...publicProfile,
        subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
        doctorSeatLimit: 3,
        monthlyFeeCents: 180_000,
      },
    });
  }

  return prisma.practice.create({
    data: {
      id: DEFAULT_PRACTICE_ID,
      subdomain: 'eastern-cape',
      clinicName: 'Eastern Cape Family Practice',
      brandColor: '#1E40AF',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
      doctorSeatLimit: 3,
      setupFeePaid: true,
      monthlyFeeCents: 180_000,
      ...publicProfile,
    },
  });
}

async function ensureSuperAdmin() {
  const email = 'owner@ecdoctor.co.za';
  const existing = await prisma.superAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`${email}: already exists`);
    return;
  }

  const passwordHash = await bcrypt.hash('EasternCape@2026!', 10);
  await prisma.superAdmin.create({
    data: {
      email,
      name: 'Platform Owner',
      role: 'owner',
      passwordHash,
    },
  });
  console.log(`${email}: created`);
}

const accounts = [
  {
    email: 'admin@ecdoctor.co.za',
    password: 'EasternCape@2026!',
    role: UserRole.ADMIN,
    fullName: 'Thandiwe Mokoena',
    phone: '+27 82 123 4567',
  },
  {
    email: 'doctor@ecdoctor.co.za',
    password: 'EasternCape@2026!',
    role: UserRole.DOCTOR,
    fullName: 'Dr. Sipho Ndamase',
    phone: '+27 83 456 7890',
    doctor: {
      hpcsaRegistrationNumber: 'MP1234567',
      practiceName: 'Eastern Cape Family Practice',
      specialization: 'General Practitioner',
      consultationFeeCents: 60000,
      telemedicineFeeCents: 45000,
      isVerified: true,
      bio: DOCTOR_BIO,
      credentials: DOCTOR_CREDENTIALS as unknown as Prisma.InputJsonValue,
    },
  },
  {
    email: 'patient@ecdoctor.co.za',
    password: 'EasternCape@2026!',
    role: UserRole.PATIENT,
    fullName: 'Lindiwe Dlamini',
    phone: '+27 84 987 6543',
    patient: {
      idNumber: '9001015800085',
      idNumberLast4: '0085',
      gender: 'FEMALE' as const,
      province: 'Eastern Cape',
      consentTelemedicine: true,
    },
  },
];

async function main() {
  const practice = await ensurePractice();
  console.log(`Practice: ${practice.subdomain} (${practice.id})`);

  await ensureSuperAdmin();

  for (const account of accounts) {
    const existing = await prisma.profile.findUnique({
      where: {
        practiceId_email: { practiceId: practice.id, email: account.email },
      },
    });
    if (existing) {
      console.log(`${account.email}: already exists`);
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 10);
    await prisma.profile.create({
      data: {
        practiceId: practice.id,
        email: account.email,
        fullName: account.fullName,
        phone: account.phone,
        role: account.role,
        passwordHash,
        isActive: true,
        ...(account.doctor && {
          doctor: {
            create: {
              practiceId: practice.id,
              ...account.doctor,
            },
          },
        }),
        ...(account.patient && {
          patient: {
            create: {
              practiceId: practice.id,
              ...account.patient,
            },
          },
        }),
      },
    });
    console.log(`${account.email}: created`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`  password: ${account.password}`);
    }
  }

  const doctor = await prisma.doctor.findFirst({
    where: { practiceId: practice.id, profile: { email: 'doctor@ecdoctor.co.za' } },
  });
  const patient = await prisma.patient.findFirst({
    where: { practiceId: practice.id, profile: { email: 'patient@ecdoctor.co.za' } },
  });

  if (doctor) {
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        bio: DOCTOR_BIO,
        telemedicineFeeCents: 45000,
        credentials: DOCTOR_CREDENTIALS as unknown as Prisma.InputJsonValue,
        consultationFeeCents: 60000,
        isVerified: true,
      },
    });
    console.log('Updated doctor public profile');
  }

  if (doctor && patient && !patient.assignedDoctorId) {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { assignedDoctorId: doctor.id },
    });
    console.log('Assigned patient to doctor');
  }

  if (doctor && patient) {
    await seedQaClinicalData(practice.id, doctor.id, patient.id);
  }

  const doctorProfile = await prisma.profile.findFirst({
    where: { practiceId: practice.id, email: 'doctor@ecdoctor.co.za' },
  });
  if (doctorProfile) {
    await prisma.practice.update({
      where: { id: practice.id },
      data: { ownerProfileId: doctorProfile.id },
    });
    console.log('Set eastern-cape practice owner to Dr Ndamase');
  }

  await seedPhase7DemoData();
}

async function seedPhase7DemoData() {
  const superAdmin = await prisma.superAdmin.findFirst({ where: { email: 'owner@ecdoctor.co.za' } });
  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 14);

  const solo = await prisma.practice.upsert({
    where: { subdomain: 'demo-solo-care' },
    create: {
      subdomain: 'demo-solo-care',
      clinicName: 'Demo Solo Care',
      subscriptionStatus: SubscriptionStatus.TRIAL,
      subscriptionPlan: SubscriptionPlan.SOLO,
      doctorSeatLimit: 1,
      monthlyFeeCents: 80_000,
      trialEndsAt: trialEnds,
    },
    update: {
      subscriptionPlan: SubscriptionPlan.SOLO,
      doctorSeatLimit: 1,
      monthlyFeeCents: 80_000,
      trialEndsAt: trialEnds,
    },
  });

  const periods = buildPhase7DemoSeedInvoicePeriods(now);
  assertPhase7DemoSeedPeriodsUnique(periods);

  const small = await prisma.practice.upsert({
    where: { subdomain: 'demo-small-health' },
    create: {
      subdomain: 'demo-small-health',
      clinicName: 'Demo Small Health Group',
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
      doctorSeatLimit: 3,
      monthlyFeeCents: 180_000,
      trialEndsAt: periods.trialEndsAt,
    },
    update: {
      subscriptionPlan: SubscriptionPlan.SMALL_PRACTICE,
      doctorSeatLimit: 3,
      monthlyFeeCents: 180_000,
      subscriptionStatus: SubscriptionStatus.SUSPENDED,
      trialEndsAt: periods.trialEndsAt,
    },
  });

  const inviteExpiry = new Date(now);
  inviteExpiry.setDate(inviteExpiry.getDate() + 7);

  await prisma.practiceInvitation.upsert({
    where: { tokenHash: hashToken('seed-demo-solo-owner-token') },
    create: {
      practiceId: solo.id,
      email: 'owner.pending@demosolo.co.za',
      fullName: 'Dr Pending Owner',
      role: UserRole.DOCTOR,
      hpcsaNumber: 'MP9999001',
      isPracticeOwner: true,
      tokenHash: hashToken('seed-demo-solo-owner-token'),
      expiresAt: inviteExpiry,
      invitedBySuperAdminId: superAdmin?.id ?? null,
    },
    update: {
      expiresAt: inviteExpiry,
      revokedAt: null,
      acceptedAt: null,
    },
  });

  await prisma.practiceInvitation.upsert({
    where: { tokenHash: hashToken('seed-demo-small-reception-token') },
    create: {
      practiceId: small.id,
      email: 'reception.pending@demosmall.co.za',
      fullName: 'Pending Reception',
      role: UserRole.ADMIN,
      isPracticeOwner: false,
      tokenHash: hashToken('seed-demo-small-reception-token'),
      expiresAt: inviteExpiry,
      invitedBySuperAdminId: superAdmin?.id ?? null,
    },
    update: {
      expiresAt: inviteExpiry,
      revokedAt: null,
      acceptedAt: null,
    },
  });

  // Fictional MS-SEED invoices only — never in production; never delete unrelated invoices.
  if (process.env.NODE_ENV !== 'production') {
    await prisma.practiceSubscriptionInvoice.deleteMany({
      where: { invoiceNumber: { in: [...PHASE7_SEED_INVOICE_NUMBERS] } },
    });

    await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId: small.id,
        invoiceNumber: 'MS-SEED-PAID-001',
        periodStart: periods.paid.periodStart,
        periodEnd: periods.paid.periodEnd,
        amountCents: 180_000,
        status: SubscriptionInvoiceStatus.PAID,
        dueAt: periods.paid.dueAt,
        paidAt: now,
        paymentMethod: 'EFT',
        verifiedBySuperAdminId: superAdmin?.id ?? null,
      },
    });

    await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId: small.id,
        invoiceNumber: 'MS-SEED-REPORTED-001',
        periodStart: periods.reported.periodStart,
        periodEnd: periods.reported.periodEnd,
        amountCents: 180_000,
        status: SubscriptionInvoiceStatus.PAYMENT_REPORTED,
        dueAt: periods.reported.dueAt,
        paymentReportedAt: now,
        paymentReference: 'SEED-EFT-12345',
        paymentMethod: 'EFT',
      },
    });

    await prisma.practiceSubscriptionInvoice.create({
      data: {
        practiceId: small.id,
        invoiceNumber: 'MS-SEED-DUE-001',
        periodStart: periods.due.periodStart,
        periodEnd: periods.due.periodEnd,
        amountCents: 180_000,
        status: SubscriptionInvoiceStatus.DUE,
        dueAt: periods.due.dueAt,
      },
    });
  }

  console.log('Phase 7 demo: demo-solo-care, demo-small-health, invitations, invoices');
}

async function seedQaClinicalData(practiceId: string, doctorId: string, patientId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const atHour = (h: number, m = 0) => {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const QA_DRAFT_ID = 'b0000000-0000-4000-8000-000000000101';
  const QA_FINAL_ID = 'b0000000-0000-4000-8000-000000000102';
  const QA_APPT_WAITING = 'c0000000-0000-4000-8000-000000000201';
  const QA_APPT_IN_CONSULT = 'c0000000-0000-4000-8000-000000000202';
  const QA_APPT_COMPLETED = 'c0000000-0000-4000-8000-000000000203';

  const appointments = [
    {
      id: QA_APPT_WAITING,
      scheduledAt: atHour(10),
      status: AppointmentStatus.ARRIVED,
      reason: 'Follow-up hypertension',
    },
    {
      id: QA_APPT_IN_CONSULT,
      scheduledAt: atHour(11),
      status: AppointmentStatus.IN_CONSULTATION,
      reason: 'Chest pain assessment',
    },
    {
      id: QA_APPT_COMPLETED,
      scheduledAt: atHour(9),
      status: AppointmentStatus.COMPLETED,
      reason: 'Routine check-up',
    },
  ];

  for (const appt of appointments) {
    await prisma.appointment.upsert({
      where: { id: appt.id },
      create: {
        id: appt.id,
        practiceId,
        patientId,
        doctorId,
        scheduledAt: appt.scheduledAt,
        type: AppointmentType.IN_PERSON,
        status: appt.status,
        reason: appt.reason,
      },
      update: {
        scheduledAt: appt.scheduledAt,
        status: appt.status,
        reason: appt.reason,
      },
    });
  }

  await prisma.medicalRecord.upsert({
    where: { id: QA_DRAFT_ID },
    create: {
      id: QA_DRAFT_ID,
      practiceId,
      patientId,
      doctorId,
      recordDate: today,
      chiefComplaint: 'Persistent headache — draft in progress',
      assessment: 'Tension-type headache, pending full workup',
      isDraft: true,
      aiFieldProvenance: {
        chief_complaint: {
          source: 'AI_ACCEPTED',
          model: 'llama-3.3-70b-versatile',
          generatedAt: today.toISOString(),
        },
      },
    },
    update: {
      isDraft: true,
      chiefComplaint: 'Persistent headache — draft in progress',
    },
  });

  await prisma.medicalRecord.upsert({
    where: { id: QA_FINAL_ID },
    create: {
      id: QA_FINAL_ID,
      practiceId,
      patientId,
      doctorId,
      recordDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      chiefComplaint: 'Annual wellness visit',
      assessment: 'Healthy adult, no acute concerns',
      plan: 'Continue current lifestyle. Return in 12 months.',
      isDraft: false,
    },
    update: {
      isDraft: false,
    },
  });

  console.log('QA seed IDs:');
  console.log(`  QA_DRAFT_RECORD_ID=${QA_DRAFT_ID}`);
  console.log(`  QA_FINAL_RECORD_ID=${QA_FINAL_ID}`);
  console.log(`  QA_APPT_WAITING=${QA_APPT_WAITING}`);
  console.log(`  QA_APPT_IN_CONSULT=${QA_APPT_IN_CONSULT}`);
  console.log(`  QA_APPT_COMPLETED=${QA_APPT_COMPLETED}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
