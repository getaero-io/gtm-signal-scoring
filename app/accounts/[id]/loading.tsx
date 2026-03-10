export default function AccountLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="h-3 w-32 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="flex items-center justify-between">
            <div>
              <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mt-2" />
            </div>
            <div className="h-10 w-14 bg-gray-200 rounded-full animate-pulse" />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-64 animate-pulse" />
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-40 animate-pulse" />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-48 animate-pulse" />
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-32 animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  );
}
