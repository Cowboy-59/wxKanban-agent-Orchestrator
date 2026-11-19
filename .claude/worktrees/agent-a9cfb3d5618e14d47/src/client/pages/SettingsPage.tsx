import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { TierInfoCard } from '../components/TierInfoCard';
import { useTierInfo } from '../hooks/useTierInfo';
import { useAuth } from '../context/AuthContext';
import { useTranslation, SUPPORTED_LOCALES } from '../i18n'; // [SCOPE 051]
import { Loader2, ArrowLeft, Building2, User, Bell, Shield, AlertCircle, CheckCircle, Save, Lock, Camera, Mail } from 'lucide-react';
import { CompanyAgentDevicesPanel, MyAgentDevicesPanel } from "../components/Settings/AgentDevicesPanel"; // [SCOPE 152 / T009]
import { TeamChatPanel } from "../components/company/TeamChatPanel"; // [SCOPE 144 / T012]

interface CompanySettings {
  name: string;
  billingEmail: string;
  // Spec 037 / T061 — separate from billingEmail (legacy → contactemail).
  // This one routes B2B engagement invoices per FR-017.
  invoiceBillingEmail: string;
  billingAddress: string;
  billingPhone: string;
  vatNumber: string; // [SCOPE 002 / T075] FR-012b
}

interface ProfileForm {
  fullname: string;
  timezone: string;
  language: string;
  tracktime: boolean;
  // [profile self-service]
  responsibility: string;
  startchat: boolean;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, setUser } = useAuth();
  const { setLocale, t } = useTranslation(); // [SCOPE 051/052]

  // Only ADMIN sees Company / Notifications / Security. Everyone else
  // (TEAM_MANAGER, TEAM_MEMBER) sees their own Profile tab only.
  const isAdmin = user?.usertype === 'ADMIN';

  // Get initial tab from URL or default to 'company' for admins, 'profile' for everyone else
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || (isAdmin ? 'company' : 'profile'));

  
  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };


  const { tierInfo, loading: tierLoading, refetch } = useTierInfo();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({
    name: '',
    billingEmail: '',
    invoiceBillingEmail: '',
    billingAddress: '',
    billingPhone: '',
    vatNumber: '', // [SCOPE 002 / T075] FR-012b
  });
  const [message, setMessage] = useState('');

  // Profile form state
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    fullname: '',
    timezone: 'UTC',
    language: 'en-US',
    tracktime: true,
    responsibility: '',
    startchat: true,
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // [SCOPE 051] When checked, the chosen language is saved as the account default
  // (userprofiles.language) so wxKanban follows it across devices. Unchecked = the
  // selector only previews the locale for this session and the saved default stays put.
  const [applyLanguageDefault, setApplyLanguageDefault] = useState(true);
  // [profile self-service] avatar upload + email-change state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // Password form state
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // [SCOPE 064 / T010] Amendment A — newsletter opt-in toggles (true = subscribed).
  const [newsletterForm, setNewsletterForm] = useState({ newsletterupdates: true, newsletterpromos: true });
  const [newsletterSaving, setNewsletterSaving] = useState(false);
  const [newsletterMessage, setNewsletterMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);


  useEffect(() => {
    fetchSettings();
    // Initialize profile form from user data
    if (user) {
      setProfileForm({
        fullname: user.fullname || '',
        timezone: user.timezone || 'UTC',
        language: user.language || 'en-US',
        tracktime: user.tracktime ?? true,
        responsibility: user.responsibility || '',
        startchat: user.startchat ?? true,
      });
      setNewsletterForm({
        newsletterupdates: user.newsletterupdates ?? true,
        newsletterpromos: user.newsletterpromos ?? true,
      });
    }
  }, [user]);


  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          navigate('/login');
          return;
        }
        throw new Error('Failed to load settings');
      }

      const data = await response.json();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage('Settings saved successfully');
        refetch();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleProfileUpdate = async () => {
    setProfileLoading(true);
    setProfileMessage(null);

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          fullname: profileForm.fullname,
          timezone: profileForm.timezone,
          // [SCOPE 051] Only persist language as the account default when opted in.
          ...(applyLanguageDefault ? { language: profileForm.language } : {}),
          tracktime: profileForm.tracktime,
          // [profile self-service]
          responsibility: profileForm.responsibility,
          startchat: profileForm.startchat,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
        // Update user context with new data
        if (data.user && setUser) {
          setUser(data.user);
        }
      } else {
        throw new Error(data.error || 'Failed to update profile');
      }
    } catch (err) {
      setProfileMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to update profile' 
      });
    } finally {
      setProfileLoading(false);
    }
  };

  // [profile self-service] Upload a new profile photo: presign → PUT straight to S3
  // → persist the public URL. Bytes never transit the API.
  const handleAvatarSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setProfileMessage({ type: 'error', text: 'Please choose an image file.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage({ type: 'error', text: 'Image must be 5 MB or smaller.' });
      return;
    }
    setAvatarUploading(true);
    setProfileMessage(null);
    try {
      const pres = await fetch('/api/auth/profile/avatar/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename: file.name, contentType: file.type, contentLength: file.size }),
      });
      const pdata = await pres.json();
      if (!pres.ok) throw new Error(pdata.error || 'Could not start upload');
      const put = await fetch(pdata.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Upload to storage failed');
      const save = await fetch('/api/auth/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ avatarurl: pdata.publicUrl }),
      });
      const sdata = await save.json();
      if (!save.ok) throw new Error(sdata.error || 'Could not save photo');
      if (sdata.user && setUser) setUser(sdata.user);
      setProfileMessage({ type: 'success', text: 'Profile photo updated.' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err instanceof Error ? err.message : 'Photo upload failed' });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ avatarurl: null }),
      });
      const data = await res.json();
      if (res.ok && data.user && setUser) setUser(data.user);
    } finally {
      setAvatarUploading(false);
    }
  };

  // [profile self-service] Start an email change — sends a verification link to the
  // NEW address; the login email only switches once that link is confirmed.
  const handleEmailChange = async () => {
    const email = newEmail.trim();
    if (!email) return;
    setEmailBusy(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/auth/profile/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start email change');
      setProfileMessage({
        type: 'success',
        text: `Verification sent to ${email}. Click the link in that email to switch your login address.`,
      });
      setNewEmail('');
      if (user && setUser) setUser({ ...user, pendingemail: email });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err instanceof Error ? err.message : 'Email change failed' });
    } finally {
      setEmailBusy(false);
    }
  };

  // [SCOPE 064 / T010] Amendment A — persist newsletter opt-in via PATCH /auth/profile.
  const handleNewsletterUpdate = async (next: { newsletterupdates: boolean; newsletterpromos: boolean }) => {
    setNewsletterForm(next);
    setNewsletterSaving(true);
    setNewsletterMessage(null);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (response.ok) {
        setNewsletterMessage({ type: 'success', text: 'Email preferences updated' });
        if (data.user && setUser) setUser(data.user);
      } else {
        throw new Error(data.error || 'Failed to update preferences');
      }
    } catch (err) {
      setNewsletterMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update preferences',
      });
    } finally {
      setNewsletterSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    // Validation
    if (passwordForm.newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setPasswordMessage({ type: 'error', text: 'New password must be different from current password' });
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to change password' 
      });
    } finally {
      setPasswordLoading(false);
    }
  };


  if (loading || tierLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => navigate('/dashboard')}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">{t("settingsPage.title")}</h1>
            <p className="text-slate-400 mt-1">
              {t("settingsPage.subtitle")}
            </p>
          </div>
        </div>

        {/* Tier Info Card */}
        {tierInfo && (
          <TierInfoCard
            tierInfo={tierInfo}
            onUpgrade={() => navigate('/upgrade')}
          />
        )}

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">



          <TabsList className={`grid w-full bg-slate-800/50 ${isAdmin ? 'grid-cols-4' : 'grid-cols-1'}`}>
            {isAdmin && (
              <TabsTrigger value="company" className="data-[state=active]:bg-slate-700 text-slate-300">
                <Building2 className="mr-2 h-4 w-4" />
                {t("settingsPage.tabCompany")}
              </TabsTrigger>
            )}
            <TabsTrigger value="profile" className="data-[state=active]:bg-slate-700 text-slate-300">
              <User className="mr-2 h-4 w-4" />
              {t("settingsPage.tabProfile")}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="notifications" className="data-[state=active]:bg-slate-700 text-slate-300">
                <Bell className="mr-2 h-4 w-4" />
                {t("settingsPage.tabNotifications")}
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="security" className="data-[state=active]:bg-slate-700 text-slate-300">
                <Shield className="mr-2 h-4 w-4" />
                {t("settingsPage.tabSecurity")}
              </TabsTrigger>
            )}
          </TabsList>


          {isAdmin && (
            <TabsContent value="company" className="mt-6">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">{t("settingsPage.companyInfo")}</CardTitle>
                  <CardDescription className="text-slate-400">
                    {t("settingsPage.companyInfoDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {message && (
                    <div className={`p-3 rounded-lg ${message.includes('success') ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                      {message}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Company Name</label>
                    <Input
                      value={settings.name}
                      onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Billing Email</label>
                    <Input
                      type="email"
                      value={settings.billingEmail}
                      onChange={(e) => setSettings({ ...settings, billingEmail: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                    <p className="text-xs text-slate-500">General contact email for the company.</p>
                  </div>

                  {/* Spec 037 / T061 — separate B2B invoice delivery email (FR-017) */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">
                      Consultant Invoice Email
                    </label>
                    <Input
                      type="email"
                      value={settings.invoiceBillingEmail}
                      onChange={(e) => setSettings({ ...settings, invoiceBillingEmail: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                      placeholder="ap@yourcompany.com"
                    />
                    <p className="text-xs text-slate-500">
                      Where B2B invoices from engaged Consulting Companies are delivered.
                      If empty, invoice generation will fail.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Billing Address</label>
                    <Input
                      value={settings.billingAddress}
                      onChange={(e) => setSettings({ ...settings, billingAddress: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Billing Phone</label>
                    <Input
                      value={settings.billingPhone}
                      onChange={(e) => setSettings({ ...settings, billingPhone: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                  </div>

                  {/* [SCOPE 002 / T075] FR-012b — VAT registration number, as entered */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">VAT Number</label>
                    <Input
                      value={settings.vatNumber}
                      onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white"
                      maxLength={50}
                      placeholder="DE123456789"
                    />
                    <p className="text-xs text-slate-500">Optional. Include the country prefix.</p>
                  </div>

                  <div className="pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        t("settingsPage.saveChanges")
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* [SCOPE 152 / T008] Company Access Tokens retired: K.A.I.N. signs in as the person (FR-069). */}
              {/* [SCOPE 152 / T009] Every member's K.A.I.N. devices, for the ADMIN (FR-071). */}
              <div className="mt-6">
                <CompanyAgentDevicesPanel />
              </div>

              {/* [SCOPE 144 / T012] Team chat (YappChatt) — the company account. Button is ADMIN-gated server-side (canManage). */}
              <div className="mt-6">
                <TeamChatPanel />
              </div>
            </TabsContent>
          )}

          <TabsContent value="profile" className="mt-6 space-y-6">
            {/* [SCOPE 152 / T009] The signed-in person's own K.A.I.N. devices (FR-071). */}
            <MyAgentDevicesPanel />

            {/* Profile Information Card */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <User className="h-5 w-5 text-indigo-400" />
                  {t("settingsPage.profileInfo")}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {t("settingsPage.profileInfoDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profileMessage && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    profileMessage.type === 'success' 
                      ? 'bg-green-900/50 text-green-200' 
                      : 'bg-red-900/50 text-red-200'
                  }`}>
                    {profileMessage.type === 'success' ? (
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    {profileMessage.text}
                  </div>
                )}

                {/* [profile self-service] Profile photo */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-900/50 flex items-center justify-center text-indigo-300 text-xl font-bold flex-shrink-0">
                    {user?.avatarurl ? (
                      <img src={user.avatarurl} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      (user?.fullname || user?.email || '?').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer ${avatarUploading ? 'bg-slate-700 text-slate-400' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
                      {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {avatarUploading ? 'Uploading…' : 'Change photo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        disabled={avatarUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleAvatarSelect(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {user?.avatarurl && (
                      <button
                        type="button"
                        onClick={() => void handleRemoveAvatar()}
                        disabled={avatarUploading}
                        className="block text-xs text-slate-400 hover:text-rose-300"
                      >
                        Remove photo
                      </button>
                    )}
                    <p className="text-xs text-slate-500">PNG, JPG, WEBP or GIF, up to 5 MB.</p>
                  </div>
                </div>

                {/* [profile self-service] Email — editable with verify-new-address flow */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Email Address</label>
                  <Input
                    value={user?.email || ''}
                    disabled
                    className="bg-slate-700/30 border-slate-600 text-slate-400 cursor-not-allowed"
                  />
                  {user?.pendingemail ? (
                    <p className="text-xs text-amber-300">
                      Pending change to <span className="font-medium">{user.pendingemail}</span> — check that inbox for the confirmation link.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Changing this sends a verification link to the new address; your login only switches once you confirm it.</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new.email@example.com"
                      className="bg-slate-700/50 border-slate-600 text-white"
                    />
                    <Button
                      onClick={() => void handleEmailChange()}
                      disabled={emailBusy || !newEmail.trim()}
                      variant="outline"
                      className="border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 whitespace-nowrap"
                    >
                      {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                      Verify &amp; change
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Full Name</label>
                  <Input
                    value={profileForm.fullname}
                    onChange={(e) => setProfileForm({ ...profileForm, fullname: e.target.value })}
                    placeholder="Enter your full name"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>

                {/* [profile self-service] Job title / role */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Responsibility / job title</label>
                  <Input
                    value={profileForm.responsibility}
                    onChange={(e) => setProfileForm({ ...profileForm, responsibility: e.target.value })}
                    placeholder="e.g. Developer, Project Manager"
                    className="bg-slate-700/50 border-slate-600 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Timezone</label>
                  <select
                    value={profileForm.timezone}
                    onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-md bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="Europe/Paris">Paris (CET)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                    <option value="Asia/Shanghai">Shanghai (CST)</option>
                    <option value="Australia/Sydney">Sydney (AEST)</option>
                  </select>
                </div>

                {/* [SCOPE 051] Language preference */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">{t("settingsPage.language")}</label>
                  <select
                    value={profileForm.language}
                    onChange={(e) => {
                      setProfileForm({ ...profileForm, language: e.target.value });
                      setLocale(e.target.value); // live-apply
                    }}
                    className="w-full px-3 py-2 rounded-md bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {SUPPORTED_LOCALES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                        {l.authored ? '' : ' — falls back to English'}
                      </option>
                    ))}
                  </select>
                  {/* [SCOPE 051] Opt in to persist this language as the account default. */}
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyLanguageDefault}
                      onChange={(e) => setApplyLanguageDefault(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700/50 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-400">
                      Set my default language to wxKanban — keep this checked to have wxKanban follow
                      this choice on every device. All newsletter emails will come in the selected language.
                    </span>
                  </label>
                  <p className="text-xs text-slate-500">
                    Untranslated languages fall back to English until their strings are authored.
                  </p>
                </div>

                <div className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    id="tracktime"
                    checked={profileForm.tracktime}
                    onChange={(e) => setProfileForm({ ...profileForm, tracktime: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-indigo-500 focus:ring-indigo-500"
                  />
                  <label htmlFor="tracktime" className="text-sm text-slate-300 cursor-pointer">
                    Enable time tracking
                  </label>
                </div>

                {/* [profile self-service] Start chat on login */}
                <div className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    id="startchat"
                    checked={profileForm.startchat}
                    onChange={(e) => setProfileForm({ ...profileForm, startchat: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-indigo-500 focus:ring-indigo-500"
                  />
                  <label htmlFor="startchat" className="text-sm text-slate-300 cursor-pointer">
                    Start chat on login
                  </label>
                </div>

                <div className="pt-4">
                  <Button
                    onClick={handleProfileUpdate}
                    disabled={profileLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {profileLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {t("settingsPage.saveProfile")}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Change Password Card */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Lock className="h-5 w-5 text-amber-400" />
                  {t("settingsPage.changePassword")}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Update your password. You will need to enter your current password for security.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  {passwordMessage && (
                    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                      passwordMessage.type === 'success' 
                        ? 'bg-green-900/50 text-green-200' 
                        : 'bg-red-900/50 text-red-200'
                    }`}>
                      {passwordMessage.type === 'success' ? (
                        <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      )}
                      {passwordMessage.text}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Current Password</label>
                    <Input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      placeholder="Enter your current password"
                      className="bg-slate-700/50 border-slate-600 text-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">New Password</label>
                    <Input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      placeholder="Enter new password (min 8 characters)"
                      className="bg-slate-700/50 border-slate-600 text-white"
                      required
                      minLength={8}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Confirm New Password</label>
                    <Input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      placeholder="Confirm your new password"
                      className="bg-slate-700/50 border-slate-600 text-white"
                      required
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={passwordLoading}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {passwordLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Changing...
                        </>
                      ) : (
                        t("settingsPage.changePassword")
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>


          {isAdmin && (
          <TabsContent value="notifications" className="mt-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">{t("settingsPage.notificationPrefs")}</CardTitle>
                <CardDescription className="text-slate-400">
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              {/* [SCOPE 064 / T010] Amendment A — newsletter email opt-in (saves on toggle). */}
              <CardContent className="space-y-4">
                {newsletterMessage && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    newsletterMessage.type === 'success'
                      ? 'bg-green-900/50 text-green-200'
                      : 'bg-red-900/50 text-red-200'
                  }`}>
                    {newsletterMessage.type === 'success' ? (
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    )}
                    {newsletterMessage.text}
                  </div>
                )}

                <div className="text-xs uppercase text-slate-500">Email from wxKanban</div>

                <label className="flex items-start gap-3 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newsletterForm.newsletterupdates}
                    disabled={newsletterSaving}
                    onChange={(e) =>
                      void handleNewsletterUpdate({ ...newsletterForm, newsletterupdates: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 rounded border-slate-600 bg-slate-700/50 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm text-slate-200">Product updates &amp; announcements</span>
                    <span className="block text-xs text-slate-500">Release notes, new features, and important changes to wxKanban.</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newsletterForm.newsletterpromos}
                    disabled={newsletterSaving}
                    onChange={(e) =>
                      void handleNewsletterUpdate({ ...newsletterForm, newsletterpromos: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 rounded border-slate-600 bg-slate-700/50 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span>
                    <span className="block text-sm text-slate-200">Offers &amp; promotions</span>
                    <span className="block text-xs text-slate-500">Occasional marketing, tips, and special offers.</span>
                  </span>
                </label>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {isAdmin && (
          <TabsContent value="security" className="mt-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">{t("settingsPage.securitySettings")}</CardTitle>
                <CardDescription className="text-slate-400">
                  Manage your security preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-slate-400 text-sm">
                  Password management is now available in the Profile tab. Click on the Profile tab above to change your password.
                </p>
                
                <div className="pt-4 border-t border-slate-700">
                  <h4 className="text-sm font-medium text-red-400 mb-2">Danger Zone</h4>
                  <Button
                    variant="outline"
                    className="border-red-600 text-red-400 hover:bg-red-900/20"
                  >
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}

        </Tabs>
      </div>
    </div>
  );
}
