import type { Provider } from '@angular/core';
import { Api } from '@app/api/api';
import { INSTALL_NOTE } from '@app/install-note/install-note';
import { SessionStream } from '@app/session/session-stream';
import { DemoApi } from './demo-api';
import { DemoSessionStream } from './demo-session-stream';

export const boardProviders: Provider[] = [
  { provide: Api, useExisting: DemoApi },
  { provide: SessionStream, useExisting: DemoSessionStream },
  { provide: INSTALL_NOTE, useValue: true },
];
