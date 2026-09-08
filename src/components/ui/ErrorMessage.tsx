interface ErrorMessageProps {
  message: string
  onRetry?: () => void
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start justify-between gap-4">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="whitespace-nowrap px-3 py-1 bg-white border border-red-200 rounded hover:bg-red-100"
        >
          Retry
        </button>
      )}
    </div>
  )
}
