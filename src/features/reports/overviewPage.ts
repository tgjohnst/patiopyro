import type { Show } from '../../model/schema';
import type { OverviewOptions } from '../../store/uiStore';

/** Page size, margins and the running footer for printing the overview. */
export function overviewPageCss(show: Show, options: OverviewOptions) {
  const str = (s: string) => `"${s.replace(/[\\"]/g, '\\$&').replace(/\s+/g, ' ')}"`;
  const footer = 'font: 9pt system-ui, sans-serif; color: #52525b;';
  return `@page {
  size: ${options.paper} landscape;
  margin: 12mm 12mm 14mm;
  @bottom-left { content: ${str(`${show.meta.name} · Show overview`)}; ${footer} }
  @bottom-right { content: "Made with PatioPyro · Page " counter(page) " of " counter(pages); ${footer} }
}`;
}
