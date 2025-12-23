import browser from 'webextension-polyfill';

const bannerId = '__aoe-dev-banner';

const injectDevBanner = () => {
  if (document.getElementById(bannerId)) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = bannerId;
  banner.textContent = 'Amazon Order Extractor active';
  banner.style.position = 'fixed';
  banner.style.bottom = '16px';
  banner.style.right = '16px';
  banner.style.padding = '4px 8px';
  banner.style.fontSize = '12px';
  banner.style.background = '#232f3e';
  banner.style.color = '#fff';
  banner.style.borderRadius = '4px';
  banner.style.zIndex = '2147483647';
  banner.style.boxShadow = '0 0 8px rgba(0, 0, 0, 0.3)';
  banner.style.pointerEvents = 'none';
  document.body.appendChild(banner);
};

const init = () => {
  injectDevBanner();
};

init();

browser.runtime.onMessage.addListener((_message: unknown) => {
  // Reserved for future scraper coordination.
  return undefined;
});
