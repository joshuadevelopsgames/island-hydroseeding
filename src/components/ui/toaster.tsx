import { forwardRef, useImperativeHandle } from 'react';
import { motion } from 'motion/react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'error' | 'warning';
type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface ActionButton {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
}

export interface ToasterProps {
  title?: string;
  message: string;
  variant?: Variant;
  duration?: number;
  position?: Position;
  actions?: ActionButton;
  onDismiss?: () => void;
  highlightTitle?: boolean;
}

export interface ToasterRef {
  show: (props: ToasterProps) => void;
}

const variantStyles: Record<Variant, string> = {
  default: 'bg-card border-border text-foreground',
  success: 'bg-card border-green-600/50',
  error: 'bg-card border-destructive/50',
  warning: 'bg-card border-amber-600/50',
};

const titleColor: Record<Variant, string> = {
  default: 'text-foreground',
  success: 'text-green-600',
  error: 'text-destructive',
  warning: 'text-amber-600',
};

const iconColor: Record<Variant, string> = {
  default: 'text-muted-foreground',
  success: 'text-green-600',
  error: 'text-destructive',
  warning: 'text-amber-600',
};

const variantIcons: Record<Variant, LucideIcon> = {
  default: Info,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
};

const toastAnimation = {
  initial: { opacity: 0, y: 50, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 50, scale: 0.95 },
};

function mapActionVariant(v?: ActionButton['variant']): 'default' | 'secondary' | 'ghost' {
  if (v === 'outline') return 'secondary';
  if (v === 'ghost') return 'ghost';
  return 'default';
}

type ToastViewProps = ToasterProps & { toastId: string | number };

function ToastView({
  toastId,
  title,
  message,
  variant = 'default',
  actions,
  onDismiss,
  highlightTitle,
}: ToastViewProps) {
  const Icon = variantIcons[variant];

  return (
    <motion.div
      variants={toastAnimation}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'flex w-full max-w-xs items-center justify-between rounded-xl border p-3 shadow-md',
        variantStyles[variant]
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', iconColor[variant])} />
        <div className="space-y-0.5">
          {title ? (
            <h3
              className={cn(
                'text-xs font-medium leading-none',
                titleColor[variant],
                highlightTitle && 'font-semibold text-primary'
              )}
            >
              {title}
            </h3>
          ) : null}
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {actions?.label ? (
          <Button
            variant={mapActionVariant(actions.variant)}
            size="sm"
            onClick={() => {
              actions.onClick();
              sonnerToast.dismiss(toastId);
            }}
            className={cn(
              'cursor-pointer',
              variant === 'success'
                ? 'border-green-600 text-green-700 hover:bg-green-600/10'
                : variant === 'error'
                  ? 'border-destructive text-destructive hover:bg-destructive/10'
                  : variant === 'warning'
                    ? 'border-amber-600 text-amber-700 hover:bg-amber-600/10'
                    : 'border-border text-foreground hover:bg-muted/50'
            )}
          >
            {actions.label}
          </Button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            sonnerToast.dismiss(toastId);
            onDismiss?.();
          }}
          className="rounded-full p-1 transition-colors hover:bg-muted/50 focus:ring-2 focus:ring-ring focus:outline-none"
          aria-label="Dismiss notification"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}

/** Show a toast anywhere; requires `<Toaster />` mounted once near the app root. */
export function showToast(props: ToasterProps) {
  const duration = props.duration ?? 4000;
  const position = props.position ?? 'bottom-right';
  sonnerToast.custom((id) => <ToastView toastId={id} {...props} duration={duration} position={position} />, {
    duration,
    position,
  });
}

const Toaster = forwardRef<ToasterRef, { defaultPosition?: Position }>(function Toaster(
  { defaultPosition = 'bottom-right' },
  ref
) {
  useImperativeHandle(ref, () => ({
    show(props) {
      showToast({ ...props, position: props.position ?? defaultPosition });
    },
  }));

  return (
    <SonnerToaster
      position={defaultPosition}
      toastOptions={{ unstyled: true, className: 'flex justify-end' }}
    />
  );
});

export default Toaster;
