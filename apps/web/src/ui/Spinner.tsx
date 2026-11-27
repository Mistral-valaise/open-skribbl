import { LoaderCircle } from 'lucide-react';
import { cx } from './cx.js';

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle aria-hidden className={cx('size-5 animate-spin', className)} strokeWidth={1.75} />
  );
}
