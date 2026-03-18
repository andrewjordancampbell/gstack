import * as fs from 'fs';
import * as path from 'path';

export interface SkillSpec {
  dir: string;
  templatePath: string;
  outputPath: string;
  codexName: string;
  codexOutputPath: string;
}

export interface CodexSupportLink {
  name: string;
  linkPath: string;
  target: string;
}

const WALK_SKIP_DIRS = new Set(['.git', '.claude', '.agents', 'node_modules']);
const ROOT_SUPPORT_ENTRIES = [
  'bin',
  'browse',
  'scripts',
  'setup',
  'package.json',
  'VERSION',
  'CHANGELOG.md',
] as const;

export function codexSkillName(dir: string): string {
  if (dir === '.') return 'gstack';
  return dir.startsWith('gstack-') ? dir : `gstack-${dir}`;
}

export function discoverSkillSpecs(root: string): SkillSpec[] {
  const specs: SkillSpec[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && WALK_SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile() || entry.name !== 'SKILL.md.tmpl') continue;

      const relPath = path.relative(root, fullPath);
      const dir = path.dirname(relPath) === '.' ? '.' : path.dirname(relPath);
      specs.push({
        dir,
        templatePath: fullPath,
        outputPath: fullPath.replace(/\.tmpl$/, ''),
        codexName: codexSkillName(dir),
        codexOutputPath: path.join(root, '.agents', 'skills', codexSkillName(dir), 'SKILL.md'),
      });
    }
  }

  return specs.sort((left, right) => left.dir.localeCompare(right.dir));
}

export function discoverCodexSupportLinks(root: string): CodexSupportLink[] {
  const codexRoot = path.join(root, '.agents', 'skills', 'gstack');
  const skills = discoverSkillSpecs(root)
    .filter(spec => spec.dir !== '.')
    .map(spec => spec.dir);
  const entries = [...new Set([...ROOT_SUPPORT_ENTRIES, ...skills])].sort((left, right) => left.localeCompare(right));

  return entries.map(name => ({
    name,
    linkPath: path.join(codexRoot, name),
    target: path.relative(codexRoot, path.join(root, name)),
  }));
}
