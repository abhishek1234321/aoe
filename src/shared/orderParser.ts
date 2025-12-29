import { formatISO, isValid, parse } from 'date-fns';
import {
  OrderAction,
  OrderItem,
  OrderShipment,
  OrderSummary,
  OrderTotal,
} from './types';

const ORDER_CARD_SELECTOR = '.order-card';
const HEADER_ITEM_SELECTOR = '.order-header__header-list-item';
const LABEL_TEXT_SELECTOR = '.a-text-caps';
const LABEL_VALUE_SELECTOR = '.a-size-base';
const ORDER_ID_SELECTOR = '.yohtmlc-order-id span[dir="ltr"]';
const BUYER_NAME_SELECTOR = '.yohtmlc-recipient a, .yohtmlc-recipient span.a-popover-trigger';
const INVOICE_LINK_TEXT = 'invoice';
const ORDER_DETAILS_TEXT = 'order details';
const DELIVERY_BOX_SELECTOR = '.delivery-box';
const PRIMARY_STATUS_SELECTOR = '.delivery-box__primary-text';
const SECONDARY_STATUS_SELECTOR = '.delivery-box__secondary-text';
const ACTIONS_CONTAINER_SELECTOR = '.yohtmlc-item-level-connections';
const ITEM_BOX_SELECTOR = '.item-box';
const ITEM_TITLE_SELECTOR = '.yohtmlc-product-title a, .a-link-normal:not(.a-popover-trigger)';
const ITEM_IMAGE_SELECTOR = 'img';
const PRODUCT_IMAGE_FALLBACK_SELECTOR = '.product-image';
const DATE_LABELS = ['order placed', 'ordered on'];
const TOTAL_LABEL = 'total';
const DATE_FORMATS = ['d MMMM yyyy', 'dd MMMM yyyy', 'MMMM d, yyyy', 'MMMM dd, yyyy', 'MMM d, yyyy', 'MMM dd, yyyy'];
const ASIN_REGEX = /\/dp\/([A-Z0-9]{10})/i;

export const parseOrdersFromDocument = (doc: Document): OrderSummary[] => {
  const cards = Array.from(doc.querySelectorAll<HTMLDivElement>(ORDER_CARD_SELECTOR));
  return cards
    .map((card) => parseOrderCard(card))
    .filter((order): order is OrderSummary => Boolean(order));
};

const parseOrderCard = (card: Element): OrderSummary | null => {
  const orderId = getTrimmedText(card.querySelector(ORDER_ID_SELECTOR));
  if (!orderId) {
    return null;
  }

  const totalRaw = getLabeledValue(card, TOTAL_LABEL);
  const total = normalizeCurrency(totalRaw);
  const orderDateText = getLabeledValue(card, DATE_LABELS);
  const orderDateISO = normalizeOrderDate(orderDateText);
  const buyerName = getTrimmedText(card.querySelector(BUYER_NAME_SELECTOR));
  const invoiceUrl = extractInvoiceUrl(card);
  const orderDetailsUrl = extractOrderDetailsUrl(card);
  const shipments = extractShipments(card);
  const itemCount = shipments.reduce((sum, shipment) => sum + shipment.items.length, 0);

  return {
    orderId,
    orderDateText: orderDateText || undefined,
    orderDateISO,
    buyerName: buyerName || undefined,
    totalAmount: totalRaw || undefined,
    currency: total.currencySymbol,
    total,
    itemCount,
    invoiceUrl,
    orderDetailsUrl,
    status: shipments[0]?.statusPrimary,
    shipments,
  };
};

const getLabeledValue = (card: Element, labels: string | string[]): string | null => {
  const labelSet = Array.isArray(labels)
    ? new Set(labels.map((label) => label.toLowerCase()))
    : new Set([labels.toLowerCase()]);
  const items = card.querySelectorAll(HEADER_ITEM_SELECTOR);
  for (const item of Array.from(items)) {
    const labelText = getTrimmedText(item.querySelector(LABEL_TEXT_SELECTOR))?.toLowerCase();
    if (labelText && labelSet.has(labelText)) {
      const valueText =
        getTrimmedText(item.querySelector(LABEL_VALUE_SELECTOR)) ||
        getTrimmedText(item);
      if (valueText) {
        return valueText;
      }
    }
  }
  return null;
};

const extractInvoiceUrl = (card: Element): string | undefined => {
  const invoiceLink = Array.from(card.querySelectorAll<HTMLAnchorElement>('a')).find((anchor) =>
    (anchor.textContent || '').trim().toLowerCase().includes(INVOICE_LINK_TEXT),
  );
  return invoiceLink?.getAttribute('href') || undefined;
};

const extractOrderDetailsUrl = (card: Element): string | undefined => {
  const detailsLink = Array.from(card.querySelectorAll<HTMLAnchorElement>('a')).find((anchor) =>
    (anchor.textContent || '').trim().toLowerCase().includes(ORDER_DETAILS_TEXT),
  );
  return detailsLink?.getAttribute('href') || undefined;
};

const extractShipments = (card: Element): OrderShipment[] => {
  const boxes = card.querySelectorAll<HTMLDivElement>(DELIVERY_BOX_SELECTOR);
  if (!boxes.length) {
    return [buildShipment(card)];
  }
  return Array.from(boxes).map((box) => buildShipment(box));
};

const buildShipment = (container: Element): OrderShipment => {
  const statusPrimary = getTrimmedText(container.querySelector(PRIMARY_STATUS_SELECTOR)) || undefined;
  const statusSecondary = getTrimmedText(container.querySelector(SECONDARY_STATUS_SELECTOR)) || undefined;
  const actions = extractActions(container);
  const items = extractItems(container);
  return {
    statusPrimary,
    statusSecondary,
    actions,
    items,
  };
};

const extractActions = (container: Element): OrderAction[] => {
  const actionContainer = container.querySelector(ACTIONS_CONTAINER_SELECTOR);
  if (!actionContainer) {
    return [];
  }
  return Array.from(actionContainer.querySelectorAll<HTMLAnchorElement>('a')).map((anchor) => ({
    label: (anchor.textContent || '').trim(),
    href: anchor.getAttribute('href') || '',
  }));
};

const extractItems = (box: Element): OrderItem[] => {
  const items: OrderItem[] = [];
  const itemBoxes = box.querySelectorAll<HTMLDivElement>(ITEM_BOX_SELECTOR);

  if (itemBoxes.length > 0) {
    itemBoxes.forEach((itemBox) => {
      const item = buildItemFromContainer(itemBox);
      if (item) {
        items.push(item);
      }
    });
    return items;
  }

  // fallback for structures without .item-box wrapper
  const fallbackNodes = box.querySelectorAll<HTMLDivElement>(PRODUCT_IMAGE_FALLBACK_SELECTOR);
  fallbackNodes.forEach((node) => {
    const item = buildItemFromContainer(node);
    if (item) {
      items.push(item);
    }
  });

  return items;
};

const buildItemFromContainer = (element: Element): OrderItem | null => {
  const titleAnchor = element.querySelector<HTMLAnchorElement>(ITEM_TITLE_SELECTOR);
  const imageEl = element.querySelector<HTMLImageElement>(ITEM_IMAGE_SELECTOR);
  const imageAlt = imageEl?.getAttribute('alt')?.trim() || null;
  const title = titleAnchor?.textContent?.trim() || imageAlt || null;
  const imageUrl = imageEl?.getAttribute('src') || undefined;
  const url = titleAnchor?.getAttribute('href') || undefined;
  const asin = extractAsinFromUrl(url);

  if (!title && !imageUrl) {
    return null;
  }

  return {
    title: title || imageUrl || 'Unknown item',
    url,
    asin,
    imageUrl,
  };
};

const extractAsinFromUrl = (url?: string | null): string | undefined => {
  if (!url) {
    return undefined;
  }
  const match = url.match(ASIN_REGEX);
  return match ? match[1].toUpperCase() : undefined;
};

const normalizeCurrency = (raw: string | null): OrderTotal => {
  if (!raw) {
    return { raw: null };
  }
  const trimmed = raw.trim();
  const currencySymbolMatch = trimmed.match(/^[^\d\s]+/);
  const currencySymbol = currencySymbolMatch ? currencySymbolMatch[0] : undefined;
  const numeric = trimmed.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const amount = numeric ? parseFloat(numeric) : undefined;
  return {
    raw: trimmed,
    amount: Number.isFinite(amount) ? amount : undefined,
    currencySymbol,
  };
};

const normalizeOrderDate = (raw?: string | null): string | undefined => {
  if (!raw) {
    return undefined;
  }
  for (const format of DATE_FORMATS) {
    const parsed = parse(raw, format, new Date());
    if (isValid(parsed)) {
      return formatISO(parsed, { representation: 'date' });
    }
  }
  return undefined;
};

const getTrimmedText = (node: Element | null): string | null => {
  if (!node) {
    return null;
  }
  const text = node.textContent;
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed || null;
};
