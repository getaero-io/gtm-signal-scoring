export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-200">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-6">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-40" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                <div className="h-6 w-10 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-8 w-28 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 bg-gray-100 rounded animate-pulse w-16" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
