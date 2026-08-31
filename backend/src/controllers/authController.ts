import { Request, Response } from 'express';
import { z } from 'zod';
import {
  buildAuthUser,
  login,
  register,
  adminCreatePatient,
  changePassword,
} from '../services/authService';
import { logAudit } from '../services/auditService';
import { sendPasswordResetEmail, sendPatientActivationEmail } from '../services/emailService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requestPasswordReset, resetPasswordWithToken } from '../services/passwordResetService';
import { toSnakeCase } from '../utils/serialize';
import { toRoleScopedPatientDto } from '../utils/patientDto';
import {
  createPracticeSession,
  revokePracticeSessionByRawToken,
} from '../services/sessionService';
import { generateSecureToken, hashToken } from '../utils/secureToken';
import { prisma } from '../config/database';
import {
  clearPracticeSessionCookie,
  getPracticeSessionRawToken,
  setPracticeSessionCookie,
} from '../utils/cookies';
import { checkRateLimit, clientIp } from '../utils/rateLimit';
import { buildUatActivationUrlIfEnabled } from '../config/uatActivationLinks';
import { resendPatientActivation } from '../services/patientActivationService';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  patient: z.record(z.unknown()).optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

function requirePracticeId(req: Request): string {
  if (!req.practiceContext?.id) {
    throw new AppError(400, 'Tenant context required');
  }
  return req.practiceContext.id;
}

async function issuePracticeSession(
  req: Request,
  res: Response,
  profileId: string,
  practiceId: string
) {
  const { rawToken, csrfToken } = await createPracticeSession({
    profileId,
    practiceId,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });
  setPracticeSessionCookie(res, rawToken);
  return csrfToken;
}

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'clinic-login', key: `${ip}:${requirePracticeId(req)}`, max: 30, windowMs: 15 * 60 * 1000 })) {
      throw new AppError(429, 'Too many login attempts. Please try again later.');
    }
    const { email, password } = loginSchema.parse(req.body);
    const practiceId = requirePracticeId(req);
    const result = await login(email, password, practiceId);
    const csrfToken = await issuePracticeSession(req, res, result.profileId, result.practiceId);

    await logAudit({
      practiceId,
      actorId: result.profileId,
      action: 'LOGIN',
      resource: 'USER',
      resourceId: result.profileId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ user: result.user, csrf_token: csrfToken });
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const body = registerSchema.parse(req.body);
    const practiceId = requirePracticeId(req);
    const result = await register({
      email: body.email,
      password: body.password,
      fullName: body.full_name,
      phone: body.phone,
      practiceId,
      patient: body.patient,
    });
    const csrfToken = await issuePracticeSession(req, res, result.profileId, result.practiceId);

    await logAudit({
      practiceId,
      actorId: result.profileId,
      action: 'REGISTER',
      resource: 'USER',
      resourceId: result.profileId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user: result.user, csrf_token: csrfToken });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    const raw = getPracticeSessionRawToken(req);

    // Anonymous hydrate (no cookie): 200 so SPA boot does not look like an auth failure.
    if (!raw) {
      return res.json({ user: null, csrf_token: null });
    }

    // Cookie present but session not resolved (expired/revoked/disabled).
    if (!req.user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    if (req.practiceContext && req.user.practiceId !== req.practiceContext.id) {
      throw new AppError(403, 'Token practice mismatch', 'PRACTICE_MISMATCH');
    }

    const user = await buildAuthUser(req.user.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Issue a fresh CSRF token on hydration so credentialed reloads stay usable
    // without storing auth secrets in localStorage.
    const csrfToken = generateSecureToken();
    if (req.practiceSession?.id) {
      await prisma.practiceSession.update({
        where: { id: req.practiceSession.id },
        data: { csrfTokenHash: hashToken(csrfToken) },
      });
      req.practiceSession.csrfTokenHash = hashToken(csrfToken);
    }

    res.json({ user, csrf_token: csrfToken });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const raw = getPracticeSessionRawToken(req);
    await revokePracticeSessionByRawToken(raw);
    clearPracticeSessionCookie(res);

    await logAudit({
      practiceId: req.user?.practiceId ?? req.practiceContext?.id,
      actorId: req.user?.userId,
      action: 'LOGOUT',
      resource: 'USER',
      resourceId: req.user?.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true });
  }),

  adminCreatePatient: asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      email: z.string().email().optional().or(z.literal('')),
      full_name: z.string().min(1),
      phone: z.string().optional(),
      patient: z.record(z.unknown()).optional(),
    });
    const body = schema.parse(req.body);
    const practiceId = requirePracticeId(req);
    const created = await adminCreatePatient(
      {
        email: body.email || undefined,
        fullName: body.full_name,
        phone: body.phone,
        patient: body.patient ?? {},
      },
      practiceId,
      req.user!.userId
    );

    res.status(201).json({
      patient: toSnakeCase(toRoleScopedPatientDto(req.user!.role, created)),
      message: 'Patient created. Portal access is not issued until an invitation is sent.',
    });
  }),

  resendPatientActivation: asyncHandler(async (req: Request, res: Response) => {
    const practiceId = requirePracticeId(req);
    const profileId = String(req.params.profileId || '');
    const result = await resendPatientActivation({
      practiceId,
      profileId,
      actorId: req.user!.userId,
    });

    let emailDelivered = false;
    try {
      emailDelivered = await sendPatientActivationEmail({
        email: result.email,
        fullName: result.fullName,
        practiceName: result.clinicName,
        subdomain: result.subdomain,
        token: result.token,
        isResend: true,
      });
    } catch (err) {
      console.error('[auth] Patient activation resend email failed:', err);
    }

    const payload: Record<string, unknown> = {
      activation_issued: true,
      email_delivered: emailDelivered,
      message: 'Activation invitation resent.',
    };
    const uatActivationUrl = buildUatActivationUrlIfEnabled(result.subdomain, result.token);
    if (uatActivationUrl) {
      payload.uat_activation_url = uatActivationUrl;
    }

    res.json(payload);
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const { current_password, new_password } = changePasswordSchema.parse(req.body);
    const userId = req.user!.userId;
    await changePassword(userId, current_password, new_password);

    // Password change revokes all sessions; clear this cookie and force re-login.
    clearPracticeSessionCookie(res);

    await logAudit({
      practiceId: req.user!.practiceId,
      actorId: userId,
      action: 'PASSWORD_CHANGE',
      resource: 'USER',
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'forgot-password', key: ip, max: 10, windowMs: 60 * 60 * 1000 })) {
      throw new AppError(429, 'Too many password reset requests. Please try again later.');
    }
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);
    const practiceId = requirePracticeId(req);
    const result = await requestPasswordReset(practiceId, email);
    if (result.sent) {
      try {
        await sendPasswordResetEmail({
          email: result.email,
          fullName: result.fullName,
          subdomain: result.subdomain,
          token: result.token,
        });
      } catch (err) {
        console.error('[auth] Password reset email failed:', err);
      }
    }
    res.json({
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'reset-password', key: ip, max: 20, windowMs: 60 * 60 * 1000 })) {
      throw new AppError(429, 'Too many password reset attempts. Please try again later.');
    }
    const schema = z.object({
      token: z.string().min(16),
      password: z.string().min(1),
    });
    const { token, password } = schema.parse(req.body);
    await resetPasswordWithToken(token, password);
    clearPracticeSessionCookie(res);
    res.json({ success: true, message: 'Password updated. You can now sign in.' });
  }),
};
