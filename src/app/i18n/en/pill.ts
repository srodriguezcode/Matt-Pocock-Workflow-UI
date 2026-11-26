export const pill = {
  failed: '✗ failed',
  started: '✓ started',
  step: (n: number, total: number, step: string) => `${n}/${total} ${step}`.trimEnd(),
  yours: 'yours',
  age: (days: number) => ` · ${days} d`,
};
