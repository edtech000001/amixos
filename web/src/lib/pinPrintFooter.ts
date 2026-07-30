// Pin the invoice/estimate footer to the BOTTOM of the last printed page.
//
// Pure print CSS can't do "footer at the bottom of the last page only" across a
// variable page count (min-height stretches in the print engine; a fixed footer
// repeats on every page). So on `beforeprint` we measure the document laid out
// at the exact print content size and insert a spacer that pushes the footer
// down to the bottom of its (last) page. Removed again on `afterprint`.
//
// Assumes US Letter at 96dpi and 100% print scale (the default for Save as PDF).
// One implementation handles every theme — it targets whichever footer element
// exists: the full-width strip (.inv-footerbar) or the closing block
// (.inv-doc-tail).

const DPI = 96;
const PX_PER_MM = DPI / 25.4;

/** Insert the spacer; returns a cleanup that removes it. `marginMm` must match
 *  the print `@page` margin used on the page. */
export function pinPrintFooter(root: HTMLElement | null, marginMm: number): () => void {
  const noop = () => {};
  if (!root) return noop;
  const page = root.querySelector<HTMLElement>('.inv-doc-page');
  if (!page) return noop;
  const footer =
    page.querySelector<HTMLElement>('.inv-footerbar') ??
    page.querySelector<HTMLElement>('.inv-doc-tail');
  if (!footer) return noop;

  // Print content box (Letter minus the @page margins).
  const P = 11 * DPI - 2 * marginMm * PX_PER_MM; // content height, px
  const W = 8.5 * DPI - 2 * marginMm * PX_PER_MM; // content width, px
  if (!(P > 0) || !(W > 0)) return noop;

  // Temporarily lay the page out like the print (block flow, no clip, print
  // width) so the measured content height matches the printout.
  const saved = {
    display: page.style.display,
    overflow: page.style.overflow,
    aspectRatio: page.style.aspectRatio,
    minHeight: page.style.minHeight,
    height: page.style.height,
    width: page.style.width,
  };
  page.style.display = 'block';
  page.style.overflow = 'visible';
  page.style.aspectRatio = 'auto';
  page.style.minHeight = '0';
  page.style.height = 'auto';
  page.style.width = `${W}px`;
  void page.offsetHeight; // force reflow

  const contentBefore = footer.getBoundingClientRect().top - page.getBoundingClientRect().top;
  const footerH = footer.getBoundingClientRect().height;
  const remainder = ((contentBefore % P) + P) % P; // used height on the last page
  let spacer = P - remainder - footerH; // push footer to that page's bottom
  if (spacer < 0) spacer += P; // footer wouldn't fit → bottom of the next page
  if (!isFinite(spacer) || spacer < 0) spacer = 0;

  const spacerEl = document.createElement('div');
  spacerEl.setAttribute('data-print-spacer', '');
  spacerEl.style.height = `${Math.round(spacer)}px`;
  spacerEl.style.flex = '0 0 auto';
  footer.parentElement?.insertBefore(spacerEl, footer);

  // Restore the on-screen layout (the print @media rules reapply at print time).
  page.style.display = saved.display;
  page.style.overflow = saved.overflow;
  page.style.aspectRatio = saved.aspectRatio;
  page.style.minHeight = saved.minHeight;
  page.style.height = saved.height;
  page.style.width = saved.width;

  return () => spacerEl.remove();
}

/** Wire beforeprint/afterprint to pin + unpin. Returns an unsubscribe fn.
 *  `getRoot` is called lazily so it works with refs that populate after mount. */
export function installPrintFooterPin(getRoot: () => HTMLElement | null, marginMm: number): () => void {
  if (typeof window === 'undefined') return () => {};
  let cleanup = () => {};
  const before = () => {
    cleanup();
    cleanup = pinPrintFooter(getRoot(), marginMm);
  };
  const after = () => {
    cleanup();
    cleanup = () => {};
  };
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
  return () => {
    window.removeEventListener('beforeprint', before);
    window.removeEventListener('afterprint', after);
    cleanup();
  };
}
