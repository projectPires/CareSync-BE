import { UnprocessableEntityException } from '@nestjs/common';

/** Body-map pressure zones (§6 M7 — 10 clickable zones). */
export const BODY_MAP_ZONES = [
  'cabeca',
  'omoplata_e',
  'omoplata_d',
  'cotovelo_e',
  'cotovelo_d',
  'sacro',
  'anca_e',
  'anca_d',
  'calcanhar_e',
  'calcanhar_d',
] as const;

/** Dressing types (§6 M7 select). */
export const DRESSINGS = ['hidrocoloide', 'alginato', 'hidrogel', 'filme', 'espuma'] as const;

/** UPP grade >= this requires wound.stage_severe (nurse/doctor/admin) — aides are capped below it. */
export const SEVERE_GRADE = 3;

export function assertValidZone(location: string): void {
  if (!(BODY_MAP_ZONES as readonly string[]).includes(location)) {
    throw new UnprocessableEntityException('localização (zona do body map) inválida');
  }
}

/** `floor` = 1 for a wound (a wound is at least grade 1), 0 for an evolution (0 = healed). */
export function assertValidGrade(grade: number, floor: number): void {
  if (!Number.isInteger(grade) || grade < floor || grade > 4) {
    throw new UnprocessableEntityException(`grau UPP inválido (esperado ${floor}–4)`);
  }
}

export function assertValidDressing(dressing?: string | null): void {
  if (dressing != null && !(DRESSINGS as readonly string[]).includes(dressing)) {
    throw new UnprocessableEntityException('penso inválido');
  }
}
