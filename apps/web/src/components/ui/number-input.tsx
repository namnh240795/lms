import { useRef, type ComponentProps } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Input } from './input';
import { Button } from './button';
import { cn } from '@/lib/utils';
type NumberInputProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & { value: string; onValueChange: (value: string) => void; label: string };
/** Numeric control composed from shadcn Input and Button; native validation and keyboard stepping remain available. */
export function NumberInput({
  value,
  onValueChange,
  label,
  className,
  disabled,
  ref: externalRef,
  ...props
}: NumberInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const numeric = Number(value);
  const minimum = props.min === undefined ? -Infinity : Number(props.min);
  const maximum = props.max === undefined ? Infinity : Number(props.max);
  function step(direction: number) {
    const element = input.current;
    if (!element) return;
    try {
      direction > 0 ? element.stepUp() : element.stepDown();
      onValueChange(element.value);
    } catch {}
    element.focus();
  }
  return (
    <div className={cn('number-input', className)}>
      <Input
        {...props}
        ref={(node) => {
          input.current = node;
          if (typeof externalRef === 'function') externalRef(node);
          else if (externalRef) externalRef.current = node;
        }}
        type="number"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <div className="number-input-actions">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Decrease ${label}`}
          disabled={disabled || (value !== '' && numeric <= minimum)}
          onClick={() => step(-1)}
        >
          <Minus size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Increase ${label}`}
          disabled={disabled || (value !== '' && numeric >= maximum)}
          onClick={() => step(1)}
        >
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}
