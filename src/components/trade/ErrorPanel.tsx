export const ErrorPanel = ({ title, description, onDismiss }: { title: string, description: string; onDismiss?: () => void }) => {
  return (
    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start">
        <svg
          className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h4 className="text-sm font-medium text-red-800">{title}</h4>
          <p className="mt-1 text-sm text-red-700">
            {description}
          </p>
          {onDismiss && <button
            onClick={() => onDismiss()}
            className="cursor-pointer mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>}
        </div>
      </div>
    </div>
  );
};
