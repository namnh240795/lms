import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Children, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function Modal({
  title,
  onClose,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children);
  const close = items.find(
    (child) =>
      isValidElement<{ className?: string }>(child) &&
      child.props.className?.split(' ').includes('modal-close'),
  );
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop">
          <DialogPrimitive.Content className={cn('modal', className)} aria-describedby={undefined}>
            {close}
            <div className="modal-body">
              <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
              {items.filter((child) => child !== close)}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
