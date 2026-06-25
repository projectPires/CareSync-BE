import { can, PERMISSIONS, Permission, Role } from './permissions';

const user = (role: Role, perms: string[] = []) => ({ role, perms });

/**
 * Teste-tabela da Matriz de Permissões (Notion §8) — uma linha por
 * célula relevante da matriz. Mudou a matriz ⇒ muda aqui ⇒ muda o Notion.
 */
describe('Matriz de permissões (§8)', () => {
  const rows: Array<[Permission, Role, boolean]> = [
    // Lar
    ['lar.read', 'admin', true],
    ['lar.read', 'nurse', false],
    ['lar.update', 'admin', true],
    ['lar.update', 'doctor', false],
    // Workers
    ['user.read', 'admin', true],
    ['user.read', 'nurse', true],
    ['user.read', 'aide', true],
    ['user.invite', 'admin', true],
    ['user.invite', 'nurse', false],
    ['user.update', 'admin', true],
    ['user.update', 'nurse', false],
    ['user.deactivate', 'admin', true],
    ['user.deactivate', 'doctor', false],
    ['user.permissions', 'admin', true],
    ['user.permissions', 'nurse', false],
    // Residentes
    ['resident.create', 'admin', true],
    ['resident.create', 'nurse', false],
    ['resident.create', 'aide', false],
    ['resident.create', 'doctor', false],
    ['resident.read', 'admin', true],
    ['resident.read', 'nurse', true],
    ['resident.read', 'aide', true],
    ['resident.read', 'doctor', true],
    ['resident.read_all_floors', 'admin', true],
    ['resident.read_all_floors', 'doctor', true],
    ['resident.read_all_floors', 'nurse', false],
    ['resident.read_all_floors', 'aide', false],
    ['resident.update_admin', 'admin', true],
    ['resident.update_admin', 'nurse', false],
    ['resident.update_clinical', 'admin', true],
    ['resident.update_clinical', 'nurse', true],
    ['resident.update_clinical', 'doctor', true],
    ['resident.update_clinical', 'aide', false],
    ['resident.update_dnr', 'admin', true],
    ['resident.update_dnr', 'doctor', true],
    ['resident.update_dnr', 'nurse', false],
    ['resident.archive', 'admin', true],
    ['resident.archive', 'nurse', false],
    ['resident.photo', 'admin', true],
    ['resident.photo', 'nurse', false],
    // eMAR (base — #6 usa)
    ['emar.plan', 'admin', true],
    ['emar.plan', 'doctor', true],
    ['emar.plan', 'nurse', false],
    ['emar.administer', 'nurse', true],
    ['emar.administer', 'aide', false],
    ['emar.refuse', 'aide', true],
    // LogEntry (#10) — médico read-only em cuidados, escreve em medical
    ['log.read', 'aide', true],
    ['log.read', 'doctor', true],
    ['log.write', 'doctor', true],
    ['log.write', 'aide', true],
    ['log.write_medical', 'nurse', true],
    ['log.write_medical', 'doctor', true],
    ['log.write_medical', 'aide', false],
    ['log.write_care', 'aide', true],
    ['log.write_care', 'doctor', false],
  ];

  it.each(rows)('%s × %s → %s', (permission, role, expected) => {
    expect(can(user(role), permission)).toBe(expected);
  });

  it('extra_permissions delegadas estendem o role (🔒 da matriz)', () => {
    expect(can(user('aide'), 'emar.administer')).toBe(false);
    expect(can(user('aide', ['emar.administer']), 'emar.administer')).toBe(true);
    expect(can(user('nurse', ['resident.photo']), 'resident.photo')).toBe(true);
  });

  it('deny by default — permissão desconhecida nunca passa', () => {
    expect(can(user('admin'), 'unknown.permission' as Permission)).toBe(false);
  });

  it('todas as permissões do catálogo têm pelo menos um role', () => {
    for (const roles of Object.values(PERMISSIONS)) {
      expect(roles.length).toBeGreaterThan(0);
    }
  });
});
