import { runProgram, type Program, type RunResult } from '../lang';
import { World } from '../sim/world';
import type { Level, LevelVariant } from './types';

export type { Level, LevelVariant, Requirement } from './types';

const modules = import.meta.glob<Level>('./*.json', { eager: true, import: 'default' });

export const LEVELS: Level[] = Object.values(modules).sort((a, b) => a.id - b.id);

export function worldFor(level: Level, variant: LevelVariant): World {
  return new World({ w: level.grid.w, h: level.grid.h, ...variant });
}

// Run without animation and report how it ended.
export function runHeadless(program: Program, level: Level, variant: LevelVariant): RunResult {
  const gen = runProgram(program, worldFor(level, variant), { maxTotalStatements: 200000 });
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

// True when the program reaches the goal on every version of the map.
export function passesAllVariants(program: Program, level: Level): boolean {
  return level.variants.every((v) => runHeadless(program, level, v).status === 'goal');
}
