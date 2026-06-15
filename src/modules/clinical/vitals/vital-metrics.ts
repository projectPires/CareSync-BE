import { UnprocessableEntityException } from '@nestjs/common';
import { VitalMetric } from '@prisma/client';
import { z } from 'zod';

/**
 * Per-metric value shape + abnormal thresholds (Notion §6 M2). The `abnormal`
 * flag is computed server-side and feeds the alerts engine (vital.abnormal).
 * Thresholds mirror the "Alerta automático" column exactly.
 */
const single = (min: number, max: number, integer = true) =>
  z.object({ value: (integer ? z.number().int() : z.number()).min(min).max(max) }).strict();

const SCHEMAS: Record<VitalMetric, z.ZodType> = {
  bp: z
    .object({ sys: z.number().int().min(40).max(300), dia: z.number().int().min(20).max(200) })
    .strict(),
  hr: single(0, 300),
  spo2: single(0, 100),
  temp: z.object({ value: z.number().min(25).max(45) }).strict(), // decimal °C
  glucose: single(0, 1000),
  pain: single(0, 10),
};

export interface ParsedVital {
  sys?: number;
  dia?: number;
  value?: number;
}

/** Validate the jsonb value against the metric's schema. 422 on bad shape. */
export function validateVitalValue(metric: VitalMetric, value: unknown): ParsedVital {
  const parsed = SCHEMAS[metric].safeParse(value);
  if (!parsed.success) {
    throw new UnprocessableEntityException(`Valor inválido para a métrica ${metric}`);
  }
  return parsed.data as ParsedVital;
}

/** Server-side abnormal detection (thresholds = Notion §6 M2 alert column). */
export function isAbnormal(metric: VitalMetric, v: ParsedVital): boolean {
  switch (metric) {
    case 'bp':
      return (v.sys ?? 0) > 140 || (v.sys ?? 0) < 90;
    case 'hr':
      return (v.value ?? 0) > 100 || (v.value ?? 0) < 50;
    case 'spo2':
      return (v.value ?? 100) < 92;
    case 'temp':
      return (v.value ?? 0) > 38;
    case 'glucose':
      return (v.value ?? 0) < 70 || (v.value ?? 0) > 250;
    case 'pain':
      return (v.value ?? 0) >= 4;
  }
}
