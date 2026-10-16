import { Injectable, CanActivate, ExecutionContext, SetMetadata, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DbService } from '../db/db.service';
import { hashSha256 } from '../crypto/password';
import { DomainException } from '../errors/domain.exception';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
const ALLOW_MFA_CHALLENGE_KEY = 'allowMfaChallenge';
export const AllowMfaChallenge = () => SetMetadata(ALLOW_MFA_CHALLENGE_KEY, true);

export interface RequestUser {
  id: string;
  loginId: string;
  displayName: string;
  role: 'student' | 'teacher' | 'school_admin';
}

export interface RequestSchool {
  id: string;
  name: string;
  timezone: string;
}

declare module 'express' {
  interface Request {
    sessionUser?: RequestUser;
    school?: RequestSchool;
    sessionId?: string;
    csrfToken?: string;
    isMfaChallenge?: boolean;
    deviceId?: string;
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(
    @Inject(Reflector) reflector?: Reflector,
    @Inject(DbService) private readonly db?: DbService,
  ) {
    this.reflector = reflector || new Reflector();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reflector = this.reflector || new Reflector();
    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowMfaChallenge = reflector.getAllAndOverride<boolean>(ALLOW_MFA_CHALLENGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Request>();
    const sessionCookie = req.cookies?.['nexora_session'];

    if (!sessionCookie) {
      if (isPublic) return true;
      throw DomainException.authRequired('Session cookie missing');
    }

    const tokenHash = hashSha256(sessionCookie);

    const query = `
      SELECT 
        s.id AS session_id,
        s.school_id,
        s.user_id,
        s.csrf_token,
        s.is_mfa_challenge,
        s.mfa_verified_at,
        s.expires_at,
        s.revoked_at,
        u.login_id,
        u.display_name,
        u.role,
        u.status AS user_status,
        u.mfa_enrolled_at,
        sch.status AS school_status,
        sch.name AS school_name,
        sch.timezone AS school_timezone
      FROM auth_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN schools sch ON sch.id = s.school_id
      WHERE s.token_hash = $1
    `;

    if (!this.db) {
      throw new Error('DbService not injected');
    }

    const result = await this.db.authQuery({ tokenHash }, query, [tokenHash]);
    if (result.rows.length === 0) {
      if (isPublic) return true;
      throw DomainException.authRequired('Invalid session token');
    }

    const session = result.rows[0];

    if (
      session.revoked_at ||
      (session.user_id &&
        (session.user_status !== 'active' || session.school_status !== 'active')) ||
      (session.role === 'school_admin' &&
        (!session.mfa_enrolled_at ||
          (!session.is_mfa_challenge &&
            (!session.mfa_verified_at ||
              new Date(session.mfa_verified_at) < new Date(session.mfa_enrolled_at)))))
    ) {
      if (isPublic) return true;
      throw DomainException.authRequired('Session has been revoked');
    }

    if (new Date(session.expires_at) <= new Date()) {
      if (isPublic) return true;
      throw DomainException.authRequired('Session has expired');
    }

    req.sessionId = session.session_id;
    req.csrfToken = session.csrf_token;
    req.isMfaChallenge = session.is_mfa_challenge;

    if (session.user_id && session.role) {
      req.sessionUser = {
        id: session.user_id,
        loginId: session.login_id,
        displayName: session.display_name,
        role: session.role,
      };
    }

    if (session.school_id && session.school_name) {
      req.school = {
        id: session.school_id,
        name: session.school_name,
        timezone: session.school_timezone || 'Africa/Addis_Ababa',
      };
    }

    if (isPublic) {
      return true;
    }

    if (allowMfaChallenge && (!session.is_mfa_challenge || session.role !== 'school_admin')) {
      throw DomainException.authRequired('MFA challenge required');
    }
    if (session.is_mfa_challenge && !allowMfaChallenge) {
      throw DomainException.authRequired('MFA verification challenge required');
    }

    if (!req.sessionUser || !req.school) {
      throw DomainException.authRequired('Anonymous session cannot access protected resource');
    }

    return true;
  }
}
