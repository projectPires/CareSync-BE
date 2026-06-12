import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '../auth/jwt-payload';
import { can, Permission } from '../auth/permissions';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require.decorator';

/**
 * Autorização pela Matriz de Permissões (Notion §8). Corre DEPOIS do
 * JwtAuthGuard (ordem de registo no app.module). Endpoints sem @Require
 * passam (autenticação já garantida); com @Require, role base OU
 * extra_permissions delegadas têm de cobrir a permissão.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;

    const user = context.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user || !can(user, permission)) {
      throw new ForbiddenException(`Sem permissão: ${permission}`);
    }
    return true;
  }
}
