import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

interface NotificationSettings {
  settingid: string;
  emailfrequency: string;
  emailtime: string;
  includeprojectupdate: boolean;
  includeteamactivity: boolean;
  includefinancials: boolean;
}

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/company/notifications', {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch notification settings');
        }

        const data = await response.json();
        setSettings(data.data || data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch settings:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load settings'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      const response = await fetch('/api/company/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          emailfrequency: settings.emailfrequency,
          emailtime: settings.emailtime,
          includeprojectupdate: settings.includeprojectupdate,
          includeteamactivity: settings.includeteamactivity,
          includefinancials: settings.includefinancials,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setError(null);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.usertype !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600">
            You must be an admin to manage notification settings
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Notification Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Configure how you receive daily email summaries
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700">Settings saved successfully!</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading settings...</p>
          </div>
        ) : settings ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="space-y-6">
              {/* Email Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email Frequency
                </label>
                <select
                  value={settings.emailfrequency}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      emailfrequency: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="never">Never</option>
                </select>
                <p className="text-sm text-gray-600 mt-1">
                  How often you want to receive email summaries
                </p>
              </div>

              {/* Email Time */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email Time (HH:MM:SS)
                </label>
                <input
                  type="text"
                  value={settings.emailtime}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      emailtime: e.target.value,
                    })
                  }
                  placeholder="09:00:00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Time of day to send the summary email
                </p>
              </div>

              {/* Content Options */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Email Content
                </h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.includeprojectupdate}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          includeprojectupdate: e.target.checked,
                        })
                      }
                      className="w-4 h-4 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-gray-900">
                      Include project updates
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.includeteamactivity}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          includeteamactivity: e.target.checked,
                        })
                      }
                      className="w-4 h-4 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-gray-900">
                      Include team activity
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={settings.includefinancials}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          includefinancials: e.target.checked,
                        })
                      }
                      className="w-4 h-4 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-gray-900">
                      Include financial summary
                    </span>
                  </label>
                </div>
              </div>

              {/* Save Button */}
              <div className="border-t pt-6 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
