import type { Sky } from '@contract/sky';
import type { TranslationBundle } from '@app/i18n/translation-bundle.model';
import { word } from '@app/i18n/word';
import type { Placed } from '@app/session/place';

export type SessionText = TranslationBundle['board']['session'];

export interface SessionLine {
  line: string | null;
  notes: string[];
  shared: boolean;
}

export function sessionLine(
  placed: Placed,
  sky: Sky,
  now: number,
  gone: boolean,
  text: SessionText,
): SessionLine {
  if (placed.sharedFrom !== null) {
    const system = sky.systems.find((s) => s.id === placed.sharedFrom);
    return {
      line: null,
      notes: [text.sharedSession(system?.handle ?? placed.sharedFrom)],
      shared: true,
    };
  }
  const { state, waiting, since, note } = placed.session;
  const held = text.held(Math.max(0, now - Date.parse(since)));
  const notes: string[] = [];
  if (waiting === 'permission-prompt') notes.push(text.permissionPrompt);
  if (note) notes.push(word(text.notes, note));
  if (state === 'lost') notes.push(text.lostNote);
  if (gone) notes.push(text.alreadyAnswered);
  return { line: text.line(text.states[state], held), notes, shared: false };
}
