// Keep incident drafts created with the original compact codes compatible.
export function normalizeCategoryCode(value) {
  return typeof value === 'string' ? value.trim().replace(/^([FHR])([0-9])$/, '$1 $2') : '';
}
