export interface InvoiceLink {
  href: string;
  label: string;
}

const cleanText = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

export const parseInvoiceLinks = (html: string): InvoiceLink[] => {
  try {
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      if (doc) {
        return Array.from(doc.querySelectorAll<HTMLAnchorElement>('a'))
          .map((anchor) => ({
            href: anchor.getAttribute('href') ?? '',
            label: cleanText(anchor.textContent),
          }))
          .filter((link) => Boolean(link.href));
      }
    }
  } catch {
    // fallback below
  }

  const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: InvoiceLink[] = [];
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(html)) !== null) {
    links.push({ href: match[1], label: cleanText(match[2]) });
  }
  return links;
};

export const selectInvoiceLink = (links: InvoiceLink[]): InvoiceLink | null => {
  if (!links.length) {
    return null;
  }
  const normalize = (value: string) => value.toLowerCase();

  const invoicePdf = links.find((link) => normalize(link.href).includes('invoice.pdf'));
  if (invoicePdf) {
    return invoicePdf;
  }

  const invoiceLabel = links.find((link) => normalize(link.label).includes('invoice'));
  if (invoiceLabel) {
    return invoiceLabel;
  }

  const summary = links.find((link) => normalize(link.label).includes('summary'));
  if (summary) {
    return summary;
  }

  return links[0];
};
