import { Children, isValidElement, type ReactNode, type MouseEventHandler } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
export function RouteSurface({
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
  const back = items.find(
    (child) =>
      isValidElement<{ className?: string }>(child) &&
      child.props.className?.split(' ').includes('modal-close'),
  );
  const props = isValidElement<{
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }>(back)
    ? back.props
    : {};
  return (
    <section className={cn('workspace route-surface', className)}>
      <div className="route-toolbar">
        <Button variant="ghost" disabled={props.disabled} onClick={props.onClick || onClose}>
          <ArrowLeft size={17} />
          Back
        </Button>
      </div>
      <h1 className="sr-only">{title}</h1>
      {items.filter((item) => item !== back)}
    </section>
  );
}
