import { routeFromHash } from '../data/navigation.js';

export function listenToRoutes(browser, { confirm, onRoute }) {
  const read = () => routeFromHash(browser.location.hash);
  let current = read();
  if (browser.history.state?.dcRoute !== current) browser.history.replaceState({ ...browser.history.state, dcRoute:current, dcIndex:0 }, '');
  let index = browser.history.state.dcIndex || 0;
  const change = () => {
    const next = read();
    if (next === current) return;
    const known = browser.history.state?.dcRoute === next && Number.isInteger(browser.history.state.dcIndex);
    const nextIndex = known ? browser.history.state.dcIndex : index + 1;
    if (!confirm()) { browser.history.go(known ? index - nextIndex : -1); return; }
    if (!known) browser.history.replaceState({ dcRoute:next, dcIndex:nextIndex, dcPrevious:current }, '');
    current = next; index = nextIndex; onRoute(next);
  };
  browser.addEventListener('hashchange',change);
  // A URL may change between the first render and effect subscription.
  onRoute(current);
  return () => browser.removeEventListener('hashchange',change);
}

// Saving replaces the form entry, so Back returns to the task's entry point.
export function replaceRoute(browser, route) {
  browser.history.replaceState({ ...browser.history.state, dcRoute:route }, '', '#' + route);
  browser.dispatchEvent(new Event('hashchange'));
}
