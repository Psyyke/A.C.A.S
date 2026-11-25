import { qwenAdapterPrompt } from './adapter-input.js';
import { coachingSystem } from './coaching-compact.js';

// history is [{ player, pena }] with Pena's replies kept tagged, oldest first.
export function chatPrompt(notes, history, message) {
    return qwenAdapterPrompt([{ role: 'system', content: coachingSystem },
        ...history.flatMap(item => [{ role: 'user', content: item.player }, { role: 'assistant', content: item.pena }]),
        { role: 'user', content: `Verified evidence:\n${notes}\n\nPlayer question: ${message}` }]);
}

export const chatEnd = '<|im_end|>';

// The message the app sends on its own after the player moves, so Pena can comment unprompted.
export const moveEvent = san => `(played ${san})`;
export const isMoveEvent = text => /^\(played \S+\)$/.test(String(text || '').trim());
export const positionEvent = '(position updated)';
export const isBoardEvent = text => isMoveEvent(text) || String(text || '').trim() === positionEvent;

// "Don't give away moves" keeps unprompted comments to the move itself, without the best line.
export const withoutLines = raw => String(raw || '').split(/(?<=[.!?])\s+(?!\[)/).filter(part => !/\[L\d\]/.test(part)).join(' ');

// "Say that again" replays the last answer instead of asking the model for a new one.
export const isRepeatAsk = text => /^\s*(?:(?:can|could) you |pls |please )?(?:(?:say|repeat) (?:that|it) again|repeat(?: that| it)?|come again|what did you (?:just )?say|sorry what|pardon|again)(?: please| pls)?\s*[?.!]*\s*$/i.test(String(text || ''));
