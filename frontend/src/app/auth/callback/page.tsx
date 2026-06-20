'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const success = params.get('success');
    const error = params.get('error');
    const added = params.get('added');

    if (success === 'connected') {
      router.replace(`/accounts?success=connected&added=${added}`);
    } else if (error) {
      router.replace(`/accounts?error=${error}`);
    } else {
      router.replace('/accounts');
    }
  }, [router, params]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4" />
      <p className="text-gray-600">Connecting your Facebook account...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
      <CallbackContent />
    </Suspense>
  );
}
