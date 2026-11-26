import { Component, InjectionToken, inject } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';

/** True only in the Demo. Start's last step, Add repo and Settings then show the install note. */
export const INSTALL_NOTE = new InjectionToken<boolean>('INSTALL_NOTE', {
  providedIn: 'root',
  factory: () => false,
});

export const INSTALL_URL =
  'https://github.com/srodriguezcode/Matt-Pocock-Workflow-UI#install-and-run';

@Component({
  selector: 'app-install-note',
  template: `
    @let m = i18n.messages().board.demo;
    <p class="install-note">
      {{ m.note }} <a [href]="url" target="_blank" rel="noopener">{{ m.link }}</a>
    </p>
  `,
  styles: `
    .install-note {
      margin: 4px 0;
      font-size: 12px;
      color: var(--reason);
    }
    a {
      color: inherit;
      text-decoration: underline;
    }
  `,
})
export class InstallNote {
  protected readonly i18n = inject(I18nService);
  protected readonly url = INSTALL_URL;
}
