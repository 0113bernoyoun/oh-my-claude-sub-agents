/**
 * Keyword Detector
 *
 * Detects activation keywords in user prompts for ultrawork, ralph, and cancel modes.
 * Called by the UserPromptSubmit hook.
 */

import { DetectedMode, KeywordsConfig, DEFAULT_CONFIG } from '../core/types.js';

/**
 * Remove code blocks from text to prevent false keyword matches.
 */
export function removeCodeBlocks(text: string): string {
  let result = text.replace(/```[\s\S]*?```/g, '');
  result = result.replace(/~~~[\s\S]*?~~~/g, '');
  result = result.replace(/`[^`]+`/g, '');
  return result;
}

/**
 * Build regex patterns from keyword arrays.
 */
function buildPatterns(keywords: KeywordsConfig): Record<string, RegExp> {
  const config = {
    ultrawork: keywords.ultrawork || DEFAULT_CONFIG.keywords!.ultrawork!,
    ralph: keywords.ralph || DEFAULT_CONFIG.keywords!.ralph!,
    cancel: keywords.cancel || DEFAULT_CONFIG.keywords!.cancel!,
  };

  const patterns: Record<string, RegExp> = {};

  for (const [mode, words] of Object.entries(config)) {
    const escaped = words.map(w =>
      w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    patterns[mode] = new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
  }

  return patterns;
}

/**
 * Detect which mode keyword is present in the prompt.
 * Priority: cancel > ralph > ultrawork
 */
export function detectKeyword(prompt: string, keywords?: KeywordsConfig): DetectedMode {
  const cleaned = removeCodeBlocks(prompt);
  const patterns = buildPatterns(keywords || DEFAULT_CONFIG.keywords!);

  // Cancel has highest priority
  if (patterns['cancel'].test(cleaned)) return 'cancel';

  // Ralph has second priority
  if (patterns['ralph'].test(cleaned)) return 'ralph';

  // Ultrawork has third priority
  if (patterns['ultrawork'].test(cleaned)) return 'ultrawork';

  return null;
}

/**
 * Check if a prompt starts with a keyword prefix (e.g., "ultrawork: do something").
 */
export function extractPrefixedPrompt(prompt: string): { mode: DetectedMode; cleanPrompt: string } {
  const trimmed = prompt.trim();

  // Check for "keyword: rest of prompt" pattern
  const prefixMatch = trimmed.match(/^(ultrawork|ulw|ralph)\s*:\s*([\s\S]+)$/i);
  if (prefixMatch) {
    const keyword = prefixMatch[1].toLowerCase();
    const cleanPrompt = prefixMatch[2].trim();

    if (keyword === 'ultrawork' || keyword === 'ulw') {
      return { mode: 'ultrawork', cleanPrompt };
    }
    if (keyword === 'ralph') {
      return { mode: 'ralph', cleanPrompt };
    }
  }

  return { mode: null, cleanPrompt: trimmed };
}
