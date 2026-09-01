import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toSnakeCase } from '../utils/serialize';
import { login } from '../services/authService';
import { logAudit } from '../services/auditService';
import { acceptInvitation, validateInvitationToken } from '../services/invitationService';
import { createPracticeSession } from '../services/sessionService';
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

function assertInvitationOrigin(req: Request, practiceSubdomain: string) {
  if (isInvitationOriginMismatch(requestBrowserOrigin(req), practiceSubdomain)) {
    throw new AppError(
      403,
      'This invitation is not valid on this practice site.',
      'INVITATION_HOST_MISMATCH'
    );
  }
}

router.get(
  '/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const ip = clientIp(req);
    if (!checkRateLimit({ bucket: 'invite-validate', key: ip, max: 60, windowMs: 15 * 60 * 1000 })) {
      throw new AppError(429, 'Too many requests. Please try again later.');
    }
    const token = String(req.query.token ?? '');
    const invitation = await validateInvitationToken(token);
    assertInvitationOrigin(req, invitation.practice.subdomain);
    res.json(
      toSnakeCase({
        practiceName: invitation.practice.clinicName,
        subdomain: invitation.practice.subdomain,
        role: invitation.role,
        fullName: invitation.fullName,
        isPracticeOwner: invitation.isPracticeOwner,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
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
    if (!checkRateLimit({ bucket: 'invite-accept', key: ip, max: 20, windowMs: 15 * 60 * 1000 })) {
      throw new AppError(429, 'Too many requests. Please try again later.');
    }
    const { token, password } = acceptSchema.parse(req.body);
    const preview = await validateInvitationToken(token);
    assertInvitationOrigin(req, preview.practice.subdomain);
    const result = await acceptInvitation(token, password);
    const auth = await login(result.profile.email, password, result.practice.id);
    const session = await createPracticeSession({
      profileId: auth.profileId,
      practiceId: auth.practiceId,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    setPracticeSessionCookie(res, session.rawToken);

    await logAudit({
      practiceId: result.practice.id,
      actorId: result.profile.id,
      action: 'LOGIN',
      resource: 'USER',
      resourceId: result.profile.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user: auth.user, csrf_token: session.csrfToken });
  })
);

export default router;
