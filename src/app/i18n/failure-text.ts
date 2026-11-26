import { ApiFailure } from '@app/api/api';
import { apiFailureText } from './api-failure';
import type { CodesBundle } from './translation-bundle.model';

export function failureText(error: unknown, codes: CodesBundle): string {
  return error instanceof ApiFailure ? apiFailureText(error.body, codes) : String(error);
}
