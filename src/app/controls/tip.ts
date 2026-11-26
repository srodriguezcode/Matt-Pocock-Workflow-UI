import { Component, input } from '@angular/core';

@Component({
  selector: 'app-tip',
  template: `<span class="mark" [title]="text()"><ng-content /></span>`,
  styles: `
    :host {
      display: inline;
    }
    .mark {
      cursor: help;
    }
  `,
})
export class Tip {
  readonly text = input.required<string>();
}
