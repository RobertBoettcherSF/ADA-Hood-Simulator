/**
 * 2032 is reserved for a future merge with another project.
 * `ERA_2032_ENABLED` stays false. No catalogue, art, or rule reads it.
 */
export const ERA_1932 = '1932' as const;
export const ERA_2032 = '2032' as const;
export type EraId = typeof ERA_1932 | typeof ERA_2032;

export const ERA_2032_ENABLED = false;
export const ACTIVE_ERA: EraId = ERA_1932;
