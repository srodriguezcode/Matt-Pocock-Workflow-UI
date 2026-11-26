import { Component, inject, model } from '@angular/core';
import type { Delivery } from '@contract/session';
import { I18nService } from '@app/i18n/i18n.service';

@Component({
  selector: 'app-delivery-toggle',
  templateUrl: './delivery-toggle.html',
  styleUrl: './delivery-toggle.scss',
})
export class DeliveryToggle {
  protected readonly i18n = inject(I18nService);
  readonly delivery = model.required<Delivery>();

  protected flip(): void {
    this.delivery.set(this.delivery() === 'typed' ? 'hook' : 'typed');
  }
}
