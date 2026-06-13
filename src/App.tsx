/**
 * Main page component for this module. Rendered at the module's route
 * (declared in Module.tsx → `route`). The host wraps every module in
 * NKZProvider so all SDK hooks resolve.
 *
 * Uses @nekazari/sdk for platform hooks (canonical pattern).
 */
import './i18n';
import React from 'react';
import { useAuth, useTranslation } from '@nekazari/sdk';
import './index.css';

const App: React.FC = () => {
  const { tenantId, isAuthenticated } = useAuth();
  const { t } = useTranslation('greenhouse-dt');

  return (
    <div className="w-full min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t('module.title')}
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          {isAuthenticated ? `${t('module.tenant')}: ${tenantId ?? '—'}` : t('module.notAuthenticated')}
        </p>
        <p className="text-sm text-gray-700">{t('module.placeholder')}</p>
      </div>
    </div>
  );
};

export default App;
