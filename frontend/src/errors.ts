export function flattenErrors(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') {
    return [prefix ? `${prefix}: ${value}` : value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenErrors(item, prefix));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, val]) =>
      flattenErrors(val, key === 'non_field_errors' ? prefix : key),
    );
  }
  return [];
}
