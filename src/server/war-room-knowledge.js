/**
 * WAR ROOM KNOWLEDGE
 *
 * Persistent learning system. After platform actions, Claude extracts
 * observations about Luma's behavior, prompt patterns, failure modes.
 * Knowledge accumulates across sessions and injects into future prompts.
 */

import fs from 'fs';
import path from 'path';

const DATA_ROOT = path.resolve(process.cwd(), 'data', 'war-room');

function knowledgePath(projectId) {
  return path.join(DATA_ROOT, projectId, 'knowledge.json');
}

export function loadKnowledge(projectId) {
  const p = knowledgePath(projectId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

export function saveKnowledge(projectId, entries) {
  const dir = path.dirname(knowledgePath(projectId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(knowledgePath(projectId), JSON.stringify(entries, null, 2));
}

export function addKnowledgeEntry(projectId, entry) {
  const entries = loadKnowledge(projectId);
  entries.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  saveKnowledge(projectId, entries);
  return entries;
}

/**
 * Format knowledge for injection into Claude/Gemini context prompts.
 */
export function formatKnowledgeForPrompt(entries) {
  if (!entries.length) return '';

  const grouped = {};
  for (const e of entries) {
    const cat = e.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(e);
  }

  let text = '\n\nACCUMULATED KNOWLEDGE FROM THIS SESSION:\n';
  for (const [cat, items] of Object.entries(grouped)) {
    text += `\n[${cat.toUpperCase()}]\n`;
    for (const item of items.slice(-10)) { // Last 10 per category
      const conf = item.confidence ? ` (${item.confidence})` : '';
      text += `- ${item.observation}${conf}\n`;
    }
  }
  return text;
}
