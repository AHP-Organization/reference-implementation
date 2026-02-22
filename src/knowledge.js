import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

/**
 * In-memory knowledge base. Each entry is:
 * { slug, title, content, url, keywords }
 */
const kb = [];

/**
 * Load all .md and .txt files from the content directory.
 * Recursively traverses subdirectories.
 */
export async function loadKnowledge(contentDir) {
  kb.length = 0;
  walk(contentDir, contentDir);
  console.log(`[knowledge] Loaded ${kb.length} document(s).`);
}

function walk(dir, rootDir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    console.warn(`[knowledge] Content directory not found: ${dir}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, rootDir);
    } else if (['.md', '.txt'].includes(extname(entry))) {
      const raw = readFileSync(fullPath, 'utf8');
      const { title, content } = parseFrontmatter(raw);
      const slug = basename(entry, extname(entry));
      const relPath = fullPath.replace(rootDir, '').replace(/\\/g, '/');
      kb.push({
        slug,
        title: title || slug,
        content,
        url: relPath.replace(/\.(md|txt)$/, ''),
        keywords: extractKeywords(content),
      });
    }
  }
}

function parseFrontmatter(raw) {
  // Strip YAML frontmatter if present
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fm) {
    const titleMatch = fm[1].match(/^title:\s*(.+)$/m);
    return {
      title: titleMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') || null,
      content: fm[2].trim(),
    };
  }
  // Use first H1 as title if no frontmatter
  const h1 = raw.match(/^#\s+(.+)$/m);
  return {
    title: h1?.[1]?.trim() || null,
    content: raw.trim(),
  };
}

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);
}

/**
 * Retrieve the most relevant documents for a query.
 * v0: simple keyword overlap scoring. v1: swap for embeddings.
 */
export function retrieve(query, topK = 5) {
  if (kb.length === 0) return [];

  const qWords = new Set(
    query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3)
  );

  const scored = kb.map(doc => {
    const overlap = doc.keywords.filter(k => qWords.has(k)).length;
    return { ...doc, score: overlap };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(d => d.score > 0 || kb.length <= topK);
}

/** Return all documents (for site_info / full context capabilities). */
export function getAll() {
  return kb;
}

/** Return a document by slug. */
export function getBySlug(slug) {
  return kb.find(d => d.slug === slug) || null;
}

export function getStats() {
  return { documents: kb.length };
}
