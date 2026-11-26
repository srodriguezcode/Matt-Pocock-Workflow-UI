import { LEGEND, renderIcon } from './legend';

/** Hands every icon to the `scripts/legend.ts` server that serves this page. Dark, like the README's screenshots. */
async function send(): Promise<void> {
  for (const icon of LEGEND) {
    await fetch(`/png?name=${icon.name}`, { method: 'POST', body: renderIcon(icon, 'dark') });
  }
  await fetch('/done', { method: 'POST' });
}

void send();
