interface LoadingSpinnerProps {
  label?: string
}

export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-gray-500">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}
