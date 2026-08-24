/**
 * The app shell scrolls inside <main class="main-content"> (see Layout.tsx),
 * not the window — window.scrollTo alone does nothing in the shell.
 */
export function getMainScrollContainer(): HTMLElement | null {
  return document.querySelector('main.main-content');
}

export function scrollMainToTop(behavior: ScrollBehavior = 'auto') {
  getMainScrollContainer()?.scrollTo({ top: 0, behavior });
  // Public pages render outside the shell, where the window is the scroller.
  window.scrollTo({ top: 0, behavior });
}
