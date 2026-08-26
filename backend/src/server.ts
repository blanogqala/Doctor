import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

import { env } from './config/env';
import { resolveAppEnv } from './config/appEnv';
import { assertProductionConfigSafe } from './config/productionGuard';
import { errorHandler } from './middleware/errorHandler';
import { attachOptionalSessions } from './middleware/auth';
import { csrfProtect } from './middleware/csrf';
import { requestContext } from './middleware/requestContext';
import { createRequestLogger } from './middleware/requestLogger';
import { detectTenant, requireTenant } from './middleware/tenant';
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import doctorRoutes from './routes/doctors';
import appointmentRoutes from './routes/appointments';
import medicalRecordRoutes from './routes/medical-records';
import availabilityRoutes from './routes/availability';
import aiRoutes from './routes/ai';
import publicRoutes from './routes/public';
import superAdminRoutes from './routes/super-admin';
import practiceRoutes from './routes/practice';
import invitationRoutes from './routes/invitations';
import activationRoutes from './routes/activations';
import practiceManagementRoutes from './routes/practice-management';
import { healthRouter } from './routes/health';
import {
  paymentsRouter,
  messagesRouter,
  auditRouter,
  consentRouter,
  dashboardRouter,
} from './routes/misc';
import {
  startAppointmentLifecycleJob,
  stopAppointmentLifecycleJob,
} from './jobs/appointmentLifecycleJob';
import { startBillingSchedulerJob, stopBillingSchedulerJob } from './jobs/billingSchedulerJob';
import { validateClinicalStorageAtStartup } from './services/clinicalStorage';
import { registerGracefulShutdown } from './utils/gracefulShutdown';
import { writeStructuredLog } from './middleware/requestLogger';

const app = express();

// Render (and similar) terminate TLS upstream; needed for correct req.ip / secure cookies.
app.set('trust proxy', 1);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === env.FRONTEND_URL) return true;
  if (env.PLATFORM_FRONTEND_URL && origin === env.PLATFORM_FRONTEND_URL) return true;
  if (env.NODE_ENV !== 'production') {
    if (/^https?:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/i.test(origin)) return true;
    if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin)) return true;
  }
  if (env.CORS_ALLOWED_ORIGINS) {
    const extras = env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    if (extras.includes(origin)) return true;
  }
  return false;
}

app.use(
  helmet({
    // Logos/photos are loaded by the Next app on another origin (e.g. eastern-cape.localhost:3000).
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(requestContext);
app.use(createRequestLogger());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
app.use('/health', healthRouter);

app.use(detectTenant);
app.use(attachOptionalSessions);
app.use(csrfProtect);

app.use('/api/super-admin', superAdminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/activations', activationRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/practice-management', practiceManagementRoutes);
app.use('/api/patients', requireTenant, patientRoutes);
app.use('/api/doctors', requireTenant, doctorRoutes);
app.use('/api/appointments', requireTenant, appointmentRoutes);
app.use('/api/availability', requireTenant, availabilityRoutes);
app.use('/api/medical-records', requireTenant, medicalRecordRoutes);
app.use('/api/ai', requireTenant, aiRoutes);
app.use('/api/payments', requireTenant, paymentsRouter);
app.use('/api/messages', requireTenant, messagesRouter);
app.use('/api/audit-logs', requireTenant, auditRouter);
app.use('/api/telemedicine-consent', requireTenant, consentRouter);
app.use('/api/dashboard', requireTenant, dashboardRouter);
// Logo files are public; other practice routes require tenant + auth
app.use('/api/practice', practiceRoutes);

app.use(errorHandler);

export { app };

async function startServer() {
  assertProductionConfigSafe();
  await validateClinicalStorageAtStartup();

  const server = app.listen(env.PORT, () => {
    writeStructuredLog('info', 'server_started', {
      port: env.PORT,
      appEnv: resolveAppEnv(),
      nodeEnv: env.NODE_ENV,
      clinicalStorageDriver: env.CLINICAL_STORAGE_DRIVER,
    });
    startAppointmentLifecycleJob();
    startBillingSchedulerJob();
  });

  registerGracefulShutdown(server, {
    stopSchedulers: () => {
      stopAppointmentLifecycleJob();
      stopBillingSchedulerJob();
    },
  });
}

if (env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[startup] Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
