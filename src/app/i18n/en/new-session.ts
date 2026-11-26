export const newSession = {
  tooltip:
    'Opens Claude in the main checkout of this repo, with no ticket. Use it to talk through a new idea or to make tickets.',
  promptLabel: 'First message',
  promptPlaceholder: 'Type your idea. Leave this empty to open Claude with no message.',
  skillLabel: 'Skill',
  noSkill: 'No skill',
  listLabel: (count: number) => (count === 1 ? '1 new session' : `${count} new sessions`),
  listHeading: 'New sessions',
  noMessage: 'No first message',
};
