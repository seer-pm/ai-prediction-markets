export const LoadingPanel = ({ title, description }: { title: string; description: string }) => {
  return (
    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
        <div>
          <h4 className="text-sm font-medium text-blue-800">{title}</h4>
          <p className="mt-1 text-sm text-blue-700">{description}</p>
        </div>
      </div>
    </div>
  );
};
