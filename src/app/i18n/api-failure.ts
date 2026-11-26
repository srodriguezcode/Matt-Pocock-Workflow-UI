import type { ApiError } from '@contract/api';
import type { CodesBundle } from './translation-bundle.model';
import { word } from './word';

export function apiFailureText(body: ApiError, codes: CodesBundle): string {
  if (body.reason) return word(codes.apiErrors, body.reason);
  if (body.gap) return word(codes.gapTitles, body.gap.problem);
  return body.error;
}
