// Keep incident drafts created with the original compact codes compatible.
export function normalizeCategoryCode(value) {
  return typeof value === 'string' ? value.trim().replace(/^([FHR])([0-9])$/, '$1 $2') : '';
}

// Preserve selections from drafts using the previous turntable ladder abbreviation.
export function normalizeVehicleCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code === 'DLAK 23/12' ? 'DLA-K 23/12' : code;
}
