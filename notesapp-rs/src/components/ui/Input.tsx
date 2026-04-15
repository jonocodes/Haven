import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

type InputVariant = 'default' | 'title'

const variantClasses: Record<InputVariant, string> = {
  default: 'px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 placeholder-gray-300',
  title: 'text-xl font-semibold border-0 focus:outline-none text-gray-900 placeholder-gray-300',
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
}

export function Input({ className, variant = 'default', ...props }: InputProps) {
  return <input className={cn(variantClasses[variant], className)} {...props} />
}
