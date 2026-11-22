import type { AnswerRecord } from '../types/game';
import { PASS_EMOJI, tierById } from '../data/rarityTiers';

/**
 * Wordle-style share text. It shows tiers and points but never card names,
 * so it can't spoil answers for anyone still playing.
 */

export function answerEmoji(answer: AnswerRecord): string {
  return answer.tierId ? tierById(answer.tierId).emoji : PASS_EMOJI;
}

export function buildDailyShareText(options: {
  puzzleNumber: number;
  answers: AnswerRecord[];
  streak: number;
  url: string;
}): string {
  const { puzzleNumber, answers, streak, url } = options;
  const total = answers.reduce((sum, a) => sum + a.points, 0);
  const grid = answers.map(answerEmoji).join('');
  const best = answers.reduce<AnswerRecord | null>((top, a) => (a.points > (top?.points ?? -1) ? a : top), null);
  const lines = [
    `Magillion #${puzzleNumber}: ${total.toLocaleString('en-US')} pts`,
    grid,
    answers.map((a) => a.points.toLocaleString('en-US')).join(' + '),
  ];
  if (best?.tierId) lines.push(`Best: ${tierById(best.tierId).name}`);
  if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
  lines.push(url);
  return lines.join('\n');
}

export function buildPracticeShareText(options: { answers: AnswerRecord[]; url: string }): string {
  const total = options.answers.reduce((sum, a) => sum + a.points, 0);
  return [
    `Magillion practice: ${total.toLocaleString('en-US')} pts in ${options.answers.length} rounds`,
    options.answers.map(answerEmoji).join(''),
    options.url,
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure contexts.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
