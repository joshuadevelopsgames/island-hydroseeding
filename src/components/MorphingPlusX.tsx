import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface MorphingPlusXProps {
  isOpen: boolean;
  className?: string;
  size?: number;
}

/**
 * Animated icon that morphs between + and × with a 45° rotation.
 * Used for toggle buttons (e.g., "New work order" / "Close form").
 */
export function MorphingPlusX({ isOpen, className, size = 16 }: MorphingPlusXProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('inline-block', className)}
      aria-hidden
      animate={{
        rotate: isOpen ? 45 : 0,
      }}
      transition={{
        duration: 0.3,
        ease: [0.33, 1, 0.68, 1],
      }}
    >
      <motion.path
        d="M8 2 L8 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: 1,
          opacity: 1,
        }}
        transition={{
          duration: 0.2,
          ease: 'easeInOut',
        }}
      />
      <motion.path
        d="M2 8 L14 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: 1,
          opacity: 1,
        }}
        transition={{
          duration: 0.2,
          ease: 'easeInOut',
        }}
      />
    </motion.svg>
  );
}
