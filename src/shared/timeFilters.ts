export interface TimeFilterOption {
  value: string;
  label: string;
  year?: number;
}

export interface TimeFilterExtractResult {
  filters: TimeFilterOption[];
  selectedValue: string | null;
}

export interface TimeFilterApplyResult {
  changed: boolean;
  matched: boolean;
}

const YEAR_OPTION_PREFIX = 'year-';
const YEAR_REGEX = /year-(\d{4})/i;

const trimLabel = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

export const extractTimeFilters = (doc: Document): TimeFilterOption[] => {
  return extractTimeFiltersWithSelection(doc).filters;
};

export const extractTimeFiltersWithSelection = (doc: Document): TimeFilterExtractResult => {
  const select = doc.querySelector<HTMLSelectElement>('#time-filter');
  if (!select) {
    return { filters: [], selectedValue: null };
  }

  const filters: TimeFilterOption[] = [];
  select.querySelectorAll('option').forEach((option) => {
    const value = option.value ?? option.getAttribute('value') ?? '';
    if (!value) {
      return;
    }
    const label = trimLabel(option.textContent);
    const match = value.match(YEAR_REGEX);
    filters.push({
      value,
      label: label || value,
      year: match ? Number(match[1]) : undefined,
    });
  });

  const selectedValue = select.value || null;

  return { filters, selectedValue };
};

export const applyTimeFilter = (
  doc: Document,
  filterValue?: string | null,
  fallbackYear?: number,
): TimeFilterApplyResult => {
  const select = doc.querySelector<HTMLSelectElement>('#time-filter');
  if (!select) {
    return { changed: false, matched: false };
  }

  const targetValue =
    filterValue ?? (fallbackYear ? `${YEAR_OPTION_PREFIX}${fallbackYear}` : undefined);
  if (!targetValue) {
    return { changed: false, matched: false };
  }

  const hasOption = Array.from(select.options).some(
    (option) => (option.value ?? option.getAttribute('value')) === targetValue,
  );
  if (!hasOption) {
    return { changed: false, matched: false };
  }

  if (select.value === targetValue) {
    return { changed: false, matched: true };
  }

  select.value = targetValue;

  // Dispatch change event for Amazon's JS, then submit form as fallback
  const EventCtor = (doc.defaultView?.Event ?? Event) as typeof Event;
  const event = new EventCtor('change', { bubbles: true });
  select.dispatchEvent(event);

  // Submit the form directly to ensure navigation happens
  // Amazon's JS might handle it, but this ensures the form submits
  const form = select.closest('form');
  if (form) {
    form.submit();
  }

  return { changed: true, matched: true };
};
