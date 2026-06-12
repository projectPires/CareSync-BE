import { SetMetadata } from '@nestjs/common';
import { Permission } from '../auth/permissions';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Única forma de exigir autorização num endpoint (regra dura 5 do CLAUDE.md —
 * nada de role-checks ad-hoc em services). Ex: @Require('resident.archive').
 */
export const Require = (permission: Permission) => SetMetadata(REQUIRE_PERMISSION_KEY, permission);
