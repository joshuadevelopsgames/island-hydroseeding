import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { getMainScrollContainer, scrollMainToTop } from '../lib/mainScroll';

/** How far down (px) the user must scroll before the arrow appears. */
const SHOW_AFTER_PX = 400;

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = getMainScrollContainer();
    if (!el) return;
    const onScroll = () => setVisible(el.scrollTop > SHOW_AFTER_PX);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="scroll-top-fab"
      onClick={() => scrollMainToTop('smooth')}
      aria-label="Back to top"
      title="Back to top"
    >
      <ArrowUp size={20} strokeWidth={2.25} aria-hidden />
    </button>
  );
}
