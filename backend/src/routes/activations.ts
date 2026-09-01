import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toSnakeCase } from '../utils/serialize';
import { logAudit } from '../services/auditService';
import {
  activateAndCreateSession,
  validatePatientActivationToken,
} from '../services/patientActivationService';
import { buildAuthUser } from '../services/authService';
import { setPracticeSessionCookie } from '../utils/cookies';
import { checkRateLimit, clientIp } from '../utils/rateLimit';
import { browserOriginFromHeaders, isInvitationOriginMismatch } from '../utils/browserOrigin';

const router = Router();

function requestBrowserOrigin(req: Request): string | undefined {
  return browserOriginFromHeaders({
    origin: req.get('origin') || undefined,
    referer: req.get('referer') || undefined,
  });
}

function assertActivationOrigin(req: Request, practiceSubdomain: string) {
  if (isInvitationOriginMismatch(requestBrowserOrigin(req), practiceSubdomain)) {
    throw new AppError(
      403,
      'This activation is not valid on this practice site.',
      'INVITATION_HOST_MISMATCH'
    );
  }
}

router.get(
  '/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'activation-validate', key: ip, max: 60, windowMs: 15 * 60 * 1000 })) {
      throw new AppError(429, 'Too many requests. Please try again later.');
    }
    const token = String(req.query.token ?? '');
    const preview = await validatePatientActivationToken(token);
    assertActivationOrigin(req, preview.subdomain);

    // Optional wrong-tenant detection when a tenant header is present.
    if (req.practiceContext && req.practiceContext.id !== preview.practiceId) {
      throw new AppError(403, 'Activation token does not match this Practice');
    }

    res.json(
      toSnakeCase({
        practiceName: preview.practiceName,
        subdomain: preview.subdomain,
        fullName: preview.fullName,
        email: preview.email,
        expiresAt: preview.expiresAt,
      })
    );
  })
);

const acceptSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(1),
});

router.post(
  '/accept',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'activation-accept', key: ip, max: 20, windowMs: 15 * 60 * 1000 })) {
      throw new AppError(429, 'Too many requests. Please try again later.');
    }
    const { token, password } = acceptSchema.parse(req.body);
    const preview = await validatePatientActivationToken(token);
    assertActivationOrigin(req, preview.subdomain);
    const result = await activateAndCreateSession({
      token,
      password,
      practiceId: req.practiceContext?.id ?? null,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    setPracticeSessionCookie(res, result.session.rawToken);
    const user = await buildAuthUser(result.profileId);

    await logAudit({
      practiceId: result.practiceId,
      actorId: result.profileId,
      action: 'LOGIN',
      resource: 'USER',
      resourceId: result.profileId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user, csrf_token: result.session.csrfToken });
  })
);

export default router;
