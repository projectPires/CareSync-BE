import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { JwtPayload } from '../../common/auth/jwt-payload';
import { PrismaService } from '../../prisma/prisma.service';
import { forTenant } from '../../prisma/tenant';
import { AcceptInviteDto, InviteDto, LoginDto, PinLoginDto } from './dto/auth.dto';
import { LockoutService } from './lockout.service';
import { RawUser } from './raw-user';
import { TokenService } from './token.service';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    lar_id: string;
    name: string;
    role: string;
    floors: number[];
    extra_permissions: string[];
  };
}

@Injectable()
export class AuthService {
  // Logs carry user IDs only — never emails, names or tokens (RGPD red line 1/8).
  private readonly logger = new Logger(AuthService.name);
  private readonly isDev: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly lockout: LockoutService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.isDev = config.get('NODE_ENV') !== 'production';
  }

  // ── pre-tenant lookups (SECURITY DEFINER — see migration 20260612160000) ──

  private usersByEmail(email: string): Promise<RawUser[]> {
    return this.prisma.$queryRaw<RawUser[]>`SELECT * FROM auth_users_by_email(${email})`;
  }

  private async userById(id: string): Promise<RawUser | undefined> {
    const rows = await this.prisma.$queryRaw<RawUser[]>`SELECT * FROM auth_user_by_id(${id}::uuid)`;
    return rows[0];
  }

  // ── login flows ────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResult> {
    return this.credentialLogin(dto.email, dto.lar_id, (u) =>
      u.password_hash ? compare(dto.password, u.password_hash) : Promise.resolve(false),
    );
  }

  async pinLogin(dto: PinLoginDto): Promise<AuthResult> {
    return this.credentialLogin(dto.email, dto.lar_id, (u) =>
      u.pin_hash ? compare(dto.pin, u.pin_hash) : Promise.resolve(false),
    );
  }

  private async credentialLogin(
    email: string,
    larId: string | undefined,
    verify: (u: RawUser) => Promise<boolean>,
  ): Promise<AuthResult> {
    if (await this.lockout.isLocked(email)) {
      throw new HttpException(
        { statusCode: 423, error: 'AccountLocked', message: 'Conta bloqueada. Tenta em 30 min.' },
        HttpStatus.LOCKED,
      );
    }

    let candidates = (await this.usersByEmail(email)).filter((u) => u.status === 'active');
    if (larId) candidates = candidates.filter((u) => u.lar_id === larId);

    const matches: RawUser[] = [];
    for (const u of candidates) {
      if (await verify(u)) matches.push(u);
    }

    if (matches.length === 0) {
      const justLocked = await this.lockout.registerFailure(email);
      if (justLocked && candidates.length === 1) {
        const u = candidates[0];
        await this.audit(u.lar_id, u.id, 'auth.lockout', 'user', u.id);
        this.logger.warn(`lockout engaged for user ${u.id}`);
      }
      throw new UnauthorizedException('Credenciais inválidas'); // uniform — no oracle
    }
    if (matches.length > 1) {
      throw new ConflictException({
        statusCode: 409,
        error: 'LarSelectionRequired',
        message: 'Email existe em mais do que um Lar — indica lar_id.',
        details: { lares: matches.map((m) => m.lar_id) },
      });
    }

    const user = matches[0];
    await this.lockout.clear(email);
    await forTenant(this.prisma, user.lar_id).user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.buildAuthResult(user);
  }

  private async buildAuthResult(user: RawUser): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      lar_id: user.lar_id,
      role: user.role,
      perms: user.extra_permissions,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      refresh_token: await this.tokens.issue(user.id),
      user: {
        id: user.id,
        lar_id: user.lar_id,
        name: user.name,
        role: user.role,
        floors: user.floors,
        extra_permissions: user.extra_permissions,
      },
    };
  }

  // ── refresh / logout ───────────────────────────────────────────────────────

  async refresh(presented: string): Promise<AuthResult> {
    const { userId, newToken } = await this.tokens.rotate(presented);
    const user = await this.userById(userId);
    if (user?.status !== 'active') {
      throw new UnauthorizedException('Utilizador inativo');
    }
    const payload: JwtPayload = {
      sub: user.id,
      lar_id: user.lar_id,
      role: user.role,
      perms: user.extra_permissions,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      refresh_token: newToken,
      user: {
        id: user.id,
        lar_id: user.lar_id,
        name: user.name,
        role: user.role,
        floors: user.floors,
        extra_permissions: user.extra_permissions,
      },
    };
  }

  async logout(presented: string): Promise<void> {
    await this.tokens.revokeByPresentedToken(presented);
  }

  // ── PIN management ─────────────────────────────────────────────────────────

  async setPin(actor: JwtPayload, pin: string): Promise<void> {
    const pinHash = await hash(pin, 10);
    await forTenant(this.prisma, actor.lar_id).user.update({
      where: { id: actor.sub },
      data: { pinHash },
    });
    await this.audit(actor.lar_id, actor.sub, 'auth.pin_set', 'user', actor.sub);
  }

  // ── invites ────────────────────────────────────────────────────────────────

  async invite(actor: JwtPayload, dto: InviteDto): Promise<{ accept_url?: string }> {
    const db = forTenant(this.prisma, actor.lar_id);
    const existing = await db.user.findUnique({
      where: { larId_email: { larId: actor.lar_id, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException('Já existe um utilizador com este email neste Lar');
    }
    if (['nurse', 'doctor'].includes(dto.role) && !dto.licence_number) {
      throw new HttpException(
        { statusCode: 422, error: 'LicenceRequired', message: 'Cédula obrigatória para este role' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const user = await db.user.create({
      data: {
        larId: actor.lar_id,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        floors: dto.floors,
        licenceNumber: dto.licence_number ?? null,
        status: 'invited',
      },
    });
    const token = await this.createInviteToken(user.id);
    await this.audit(actor.lar_id, actor.sub, 'user.invited', 'user', user.id);
    this.logger.log(`invite created for user ${user.id}`);

    // TODO(email): wire real mailer (Resend/SES — open decision). Until then the
    // accept URL is returned in DEV ONLY so the flow is testable end-to-end.
    return this.isDev ? { accept_url: `caresync://invite/accept?token=${token}` } : {};
  }

  private async createInviteToken(userId: string): Promise<string> {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    await this.prisma.inviteToken.create({
      data: {
        id,
        userId,
        tokenHash: createHash('sha256').update(secret).digest('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return `${id}.${secret}`;
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<void> {
    const [id, secret] = dto.token.split('.');
    const row = id
      ? await this.prisma.inviteToken.findUnique({ where: { id } }).catch(() => null)
      : null;
    const hashOk =
      row && secret && row.tokenHash === createHash('sha256').update(secret).digest('hex');

    if (!row || !hashOk || row.usedAt) {
      throw new UnauthorizedException('Convite inválido');
    }
    if (row.expiresAt < new Date()) {
      // Q2 (option A): expired link → client calls /invite/resend for a fresh one.
      throw new HttpException(
        { statusCode: 410, error: 'InviteExpired', message: 'Convite expirado — pede um novo.' },
        HttpStatus.GONE,
      );
    }

    const user = await this.userById(row.userId);
    if (user?.status !== 'invited') {
      throw new UnauthorizedException('Convite inválido');
    }

    const passwordHash = await hash(dto.password, 10);
    await this.prisma.inviteToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await forTenant(this.prisma, user.lar_id).user.update({
      where: { id: user.id },
      data: { passwordHash, status: 'active' },
    });
    await this.audit(user.lar_id, user.id, 'user.invite_accepted', 'user', user.id);
  }

  async resendInvite(email: string): Promise<{ accept_url?: string }> {
    // Uniform response whether or not the email exists (no user oracle).
    const users = (await this.usersByEmail(email)).filter((u) => u.status === 'invited');
    if (users.length !== 1) return {};
    const token = await this.createInviteToken(users[0].id);
    this.logger.log(`invite re-issued for user ${users[0].id}`);
    return this.isDev ? { accept_url: `caresync://invite/accept?token=${token}` } : {};
  }

  // ── audit helper (interceptor global chega no #5) ──────────────────────────

  private async audit(
    larId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await forTenant(this.prisma, larId).auditLog.create({
      data: { larId, userId, action, entityType, entityId },
    });
  }
}
