export default function NoOrganizationPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md text-center">
        <h1 className="text-xl font-bold mb-4">No Organization</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You are not a member of any organization yet. Please contact your administrator to get an invitation link.
        </p>
      </div>
    </div>
  );
}
