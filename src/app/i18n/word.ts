import type { CodeWording } from './translation-name-groups.model';

export function word<U extends { code: string }>(wording: CodeWording<U>, value: U): string {
  const entry = wording[value.code as U['code']] as (params: U) => string;
  return entry(value);
}
