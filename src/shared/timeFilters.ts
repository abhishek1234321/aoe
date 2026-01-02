export interface TimeFilterOption {
  value: string;
  label: string;
  year?: number;
}

export interface TimeFilterApplyResult {
  changed: boolean;
  matched: boolean;
}

const YEAR_OPTION_PREFIX = 'year-';
const YEAR_REGEX = /year-(\d{4})/i;

const trimLabel = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

export const extractTimeFilters = (doc: Document): TimeFilterOption[] => {
  const select = doc.querySelector<HTMLSelectElement>('#time-filter');
  if (!select) {
    return [];
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

  return filters;
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
  const EventCtor = (doc.defaultView?.Event ?? Event) as typeof Event;
  const event = new EventCtor('change', { bubbles: true });
  select.dispatchEvent(event);
  return { changed: true, matched: true };
};
