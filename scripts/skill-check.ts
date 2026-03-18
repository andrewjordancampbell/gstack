#!/usr/bin/env bun
/**
 * skill:check — Health summary for all SKILL.md files.
 *
 * Reports:
 *   - Command validation (valid/invalid/snapshot errors)
 *   - Template coverage (which SKILL.md files have .tmpl sources)
 *   - Freshness check (generated files match committed files)
 */

import { validateSkill } from '../test/helpers/skill-parser';
import { discoverCodexSupportLinks, discoverSkillSpecs } from './skill-manifest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dir, '..');
const SKILL_SPECS = discoverSkillSpecs(ROOT);
const SKILL_FILES = SKILL_SPECS
  .map(spec => path.relative(ROOT, spec.outputPath))
  .filter(file => fs.existsSync(path.join(ROOT, file)));
const CODEX_SKILLS = SKILL_SPECS
  .map(spec => path.relative(ROOT, spec.codexOutputPath))
  .filter(file => fs.existsSync(path.join(ROOT, file)));

let hasErrors = false;

// ─── Skills ─────────────────────────────────────────────────

console.log('  Skills:');
for (const file of SKILL_FILES) {
  const fullPath = path.join(ROOT, file);
  const result = validateSkill(fullPath);

  if (result.warnings.length > 0) {
    console.log(`  \u26a0\ufe0f  ${file.padEnd(30)} — ${result.warnings.join(', ')}`);
    continue;
  }

  const totalValid = result.valid.length;
  const totalInvalid = result.invalid.length;
  const totalSnapErrors = result.snapshotFlagErrors.length;

  if (totalInvalid > 0 || totalSnapErrors > 0) {
    hasErrors = true;
    console.log(`  \u274c ${file.padEnd(30)} — ${totalValid} valid, ${totalInvalid} invalid, ${totalSnapErrors} snapshot errors`);
    for (const inv of result.invalid) {
      console.log(`      line ${inv.line}: unknown command '${inv.command}'`);
    }
    for (const se of result.snapshotFlagErrors) {
      console.log(`      line ${se.command.line}: ${se.error}`);
    }
  } else {
    console.log(`  \u2705 ${file.padEnd(30)} — ${totalValid} commands, all valid`);
  }
}

console.log('\n  Codex skills:');
for (const file of CODEX_SKILLS) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
  const nameMatch = content.match(/^name:\s+(.+)$/m);
  const descMatch = content.match(/^description:\s+\|$/m);
  if (!nameMatch || !descMatch || content.includes('.claude/skills/')) {
    hasErrors = true;
    console.log(`  \u274c ${file.padEnd(30)} — invalid frontmatter or legacy Claude path`);
    continue;
  }
  console.log(`  \u2705 ${file.padEnd(30)} — frontmatter + paths look good`);
}

console.log('\n  Codex support tree:');
for (const link of discoverCodexSupportLinks(ROOT)) {
  try {
    const target = fs.readlinkSync(link.linkPath);
    if (target !== link.target) {
      hasErrors = true;
      console.log(`  \u274c ${path.relative(ROOT, link.linkPath).padEnd(30)} — points to ${target}, expected ${link.target}`);
      continue;
    }
    console.log(`  \u2705 ${path.relative(ROOT, link.linkPath).padEnd(30)} — ${target}`);
  } catch {
    hasErrors = true;
    console.log(`  \u274c ${path.relative(ROOT, link.linkPath).padEnd(30)} — missing support link`);
  }
}

// ─── Templates ──────────────────────────────────────────────

console.log('\n  Templates:');
const TEMPLATES = SKILL_SPECS.map(spec => ({
  tmpl: path.relative(ROOT, spec.templatePath),
  output: path.relative(ROOT, spec.outputPath),
}));

for (const { tmpl, output } of TEMPLATES) {
  const tmplPath = path.join(ROOT, tmpl);
  const outPath = path.join(ROOT, output);
  if (!fs.existsSync(tmplPath)) {
    console.log(`  \u26a0\ufe0f  ${output.padEnd(30)} — no template`);
    continue;
  }
  if (!fs.existsSync(outPath)) {
    hasErrors = true;
    console.log(`  \u274c ${output.padEnd(30)} — generated file missing! Run: bun run gen:skill-docs`);
    continue;
  }
  console.log(`  \u2705 ${tmpl.padEnd(30)} \u2192 ${output}`);
}

// ─── Freshness ──────────────────────────────────────────────

console.log('\n  Freshness:');
try {
  execSync('bun run scripts/gen-skill-docs.ts --dry-run', { cwd: ROOT, stdio: 'pipe' });
  execSync('bun run scripts/gen-skill-docs.ts --host codex --dry-run', { cwd: ROOT, stdio: 'pipe' });
  console.log('  \u2705 All generated files are fresh');
} catch (err: any) {
  hasErrors = true;
  const output = err.stdout?.toString() || '';
  console.log('  \u274c Generated files are stale:');
  for (const line of output.split('\n').filter((l: string) => l.startsWith('STALE'))) {
    console.log(`      ${line}`);
  }
  console.log('      Run: bun run gen:skill-docs');
}

console.log('');
process.exit(hasErrors ? 1 : 0);
