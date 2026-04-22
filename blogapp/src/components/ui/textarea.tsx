import * as React from 'react'
import { cn } from './cn'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-slate-500 min-h-16 w-full rounded-md border bg-white px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-slate-300',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
