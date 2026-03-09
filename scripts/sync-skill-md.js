#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(readText(filePath));
  } catch (e) {
    console.warn(`[sync-skill-md] Failed to read JSON ${filePath}: ${e.message}`);
    return fallback;
  }
}

function sanitizeSkillId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function relativeToRoot(rootDir, absolutePath) {
  const rel = path.relative(rootDir, absolutePath);
  return rel.split(path.sep).join('/');
}

function parseBuiltinSkills(content) {
  const items = [];
  const re = /skills:\s*\[(.*?)\]/gs;
  let match;
  while ((match = re.exec(content)) !== null) {
    const block = match[1] || '';
    const itemRe = /\{\s*name:\s*'([^']+)'\s*,\s*description:\s*'([^']*)'\s*\}/g;
    let m;
    while ((m = itemRe.exec(block)) !== null) {
      items.push({
        id: sanitizeSkillId(m[1]),
        description: String(m[2] || '').trim(),
        source: 'builtin-agents',
      });
    }
  }
  return items;
}

function collectSkillRefs(rootDir) {
  const map = new Map();

  function upsert(id, description, source, owner) {
    if (!id) return;
    const key = sanitizeSkillId(id);
    if (!key) return;
    const existing = map.get(key) || {
      id: key,
      description: '',
      sources: new Set(),
      owners: new Set(),
    };
    if (!existing.description && description) {
      existing.description = String(description).trim();
    }
    existing.sources.add(source);
    if (owner) existing.owners.add(owner);
    map.set(key, existing);
  }

  const builtinPath = path.join(rootDir, 'lib', 'config', 'builtin-agents.ts');
  const builtinContent = readText(builtinPath);
  const builtinSkills = parseBuiltinSkills(builtinContent);
  for (const s of builtinSkills) {
    upsert(s.id, s.description, s.source);
  }

  const dynamicPath = path.join(rootDir, 'agents', 'dynamic-registry.json');
  const dynamicEntries = readJson(dynamicPath, []);
  for (const entry of dynamicEntries) {
    const owner = entry && entry.id ? String(entry.id) : '';
    const skills = Array.isArray(entry?.skills) ? entry.skills : [];
    for (const skill of skills) {
      upsert(skill?.name, skill?.description, 'dynamic-registry', owner);
    }
  }

  const overridePath = path.join(rootDir, 'agents', 'agent-skill-overrides.json');
  const overrides = readJson(overridePath, {});
  for (const [agentId, entry] of Object.entries(overrides || {})) {
    const skills = Array.isArray(entry?.skills) ? entry.skills : [];
    for (const skill of skills) {
      upsert(skill?.name, skill?.description, 'agent-skill-overrides', agentId);
    }
  }

  return Array.from(map.values()).map((x) => ({
    id: x.id,
    description: x.description || `Skill: ${x.id}`,
    sources: Array.from(x.sources),
    owners: Array.from(x.owners),
  }));
}

function collectImplementationRefs(rootDir) {
  const map = new Map();
  const roots = [
    path.join(rootDir, 'agents'),
    path.join(rootDir, 'projects'),
  ];

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!full.endsWith('.ts')) continue;
      if (!full.includes(`${path.sep}skills${path.sep}`)) continue;
      if (!full.includes(`${path.sep}agents${path.sep}`)) continue;
      const id = sanitizeSkillId(path.basename(full, '.ts'));
      if (!id) continue;

      const rel = relativeToRoot(rootDir, full);
      const list = map.get(id) || [];
      list.push(rel);
      map.set(id, list);
    }
  }

  for (const root of roots) {
    if (fs.existsSync(root)) {
      walk(root);
    }
  }

  for (const [id, list] of map.entries()) {
    map.set(id, Array.from(new Set(list)).sort((a, b) => a.localeCompare(b)));
  }
  return map;
}

function renderSkillMd(skill) {
  const tags = Array.from(new Set((skill.sources || []).map((s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase())));
  const tagsLiteral = tags.length > 0 ? tags.join(', ') : 'general';
  const owners = (skill.owners || []).length > 0
    ? (skill.owners || []).map((o) => `- ${o}`).join('\n')
    : '- (global or builtin)';
  const refs = Array.isArray(skill.implementationRefs) ? skill.implementationRefs : [];
  const refsLiteral = refs.length > 0
    ? refs.map((p) => `- \`${p}\``).join('\n')
    : '- (no direct agents/*/skills/*.ts implementation found)';

  return `<!-- sync-skill-md:managed -->
---
name: ${skill.id}
description: ${skill.description}
version: 1.0.0
requires:
  tools: []
tags: [${tagsLiteral}]
---
## Instructions

### Purpose
${skill.description}

### Activation
- Activate when task context requires \`${skill.id}\`.
- Prioritize existing project conventions and agent role boundaries.

### Workflow
1. Analyze the user goal and expected output.
2. Produce a concise, structured plan before execution.
3. Execute with clear validation and failure handling.
4. Return actionable output with assumptions explicitly listed.

### Referenced By Agents
${owners}

### Implementation Reference
${refsLiteral}

### Implementation Notes
- If this skill has executable implementation in \`agents/*/skills/*.ts\`, keep behavior aligned with that code path.
- Treat this SKILL.md as the unified instruction source for prompt injection.
`;
}

function isLegacyGeneratedSkillMd(content) {
  return content.includes('Treat this SKILL.md as the unified instruction source for prompt injection.');
}

function ensureSkillMd(rootDir, skill) {
  const skillDir = path.join(rootDir, 'skills', skill.id);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const nextContent = renderSkillMd(skill);

  if (fs.existsSync(skillMdPath)) {
    const current = readText(skillMdPath);
    const managed = current.includes('<!-- sync-skill-md:managed -->');
    const legacyGenerated = isLegacyGeneratedSkillMd(current);

    if (managed || legacyGenerated) {
      if (current !== nextContent) {
        fs.writeFileSync(skillMdPath, nextContent, 'utf-8');
        return { created: false, updated: true, path: skillMdPath };
      }
      return { created: false, updated: false, path: skillMdPath };
    }

    return { created: false, updated: false, path: skillMdPath };
  }
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(skillMdPath, nextContent, 'utf-8');
  return { created: true, updated: false, path: skillMdPath };
}

function main() {
  const rootDir = process.cwd();
  const implRefs = collectImplementationRefs(rootDir);
  const refs = collectSkillRefs(rootDir)
    .map((x) => ({
      ...x,
      implementationRefs: implRefs.get(x.id) || [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const results = [];
  for (const skill of refs) {
    const r = ensureSkillMd(rootDir, skill);
    results.push({
      id: skill.id,
      created: r.created,
      updated: !!r.updated,
      path: r.path,
      sources: skill.sources,
      owners: skill.owners,
      implementationRefs: skill.implementationRefs,
    });
  }

  const created = results.filter((r) => r.created);
  const updated = results.filter((r) => r.updated);
  const existing = results.filter((r) => !r.created);

  const report = {
    generatedAt: new Date().toISOString(),
    totalReferencedSkills: refs.length,
    createdCount: created.length,
    updatedCount: updated.length,
    existingCount: existing.length,
    createdSkills: created.map((r) => r.id),
    updatedSkills: updated.map((r) => r.id),
    existingSkills: existing.map((r) => r.id),
    details: results,
  };

  const reportPath = path.join(rootDir, 'skills', '_skill-md-sync-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`[sync-skill-md] Referenced skills: ${refs.length}`);
  console.log(`[sync-skill-md] Created SKILL.md: ${created.length}`);
  console.log(`[sync-skill-md] Updated SKILL.md: ${updated.length}`);
  console.log(`[sync-skill-md] Existing SKILL.md: ${existing.length}`);
  console.log(`[sync-skill-md] Report: ${reportPath}`);
}

main();
