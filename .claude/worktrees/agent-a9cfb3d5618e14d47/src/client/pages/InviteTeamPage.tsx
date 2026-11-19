import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { SingleInviteForm } from '../components/SingleInviteForm';
import { BulkInviteUpload } from '../components/BulkInviteUpload';
import { InvitationProgress } from '../components/InvitationProgress';
import { useInvitationProgress } from '../hooks/useInvitationProgress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { Mail, Upload, Users, ArrowLeft } from 'lucide-react';
import { useTranslation } from "~/client/i18n";

export default function InviteTeamPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('single');
  const [batchId, setBatchId] = useState<string | null>(null);

  // Use the hook only when we have a batchId
  const progressState = useInvitationProgress(batchId);

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
            <h1 className="text-3xl font-bold text-white">{t("inviteTeam.title")}</h1>
            <p className="text-slate-400 mt-1">
              {t("inviteTeam.subtitle")}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">{t("inviteTeam.sendInvitations")}</CardTitle>
            <CardDescription className="text-slate-400">
              {t("inviteTeam.sendInvitationsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-700/50">
                <TabsTrigger
                  value="single"
                  className="data-[state=active]:bg-slate-600 text-slate-300"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {t("inviteTeam.singleInvite")}
                </TabsTrigger>
                <TabsTrigger
                  value="bulk"
                  className="data-[state=active]:bg-slate-600 text-slate-300"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {t("inviteTeam.bulkUpload")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="single" className="mt-6">
                <SingleInviteForm onSuccess={() => navigate('/admin/team')} />
              </TabsContent>

              <TabsContent value="bulk" className="mt-6">
                {!batchId ? (
                  <BulkInviteUpload onSuccess={(newBatchId) => setBatchId(newBatchId)} />
                ) : (
                  <div className="space-y-4">
                    <InvitationProgress
                      batchId={batchId}
                      total={progressState.complete?.total ?? progressState.progress?.total ?? 0}
                      sent={progressState.complete?.successful ?? progressState.progress?.sent ?? 0}
                      failed={progressState.complete?.failed ?? progressState.progress?.failed ?? 0}
                      status={
                        progressState.complete
                          ? 'completed'
                          : ((progressState.progress?.status as 'queued' | 'processing' | 'completed' | 'failed' | undefined) ?? 'queued')
                      }
                      failedEmails={progressState.complete?.failedEmails}
                      isRealTime={progressState.isConnected}
                    />
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setBatchId(null)}
                        variant="outline"
                        className="border-slate-600 text-slate-300 hover:bg-slate-800"
                      >
                        {t("inviteTeam.sendMore")}
                      </Button>
                      <Button
                        onClick={() => navigate('/admin/team')}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Users className="mr-2 h-4 w-4" />
                        {t("inviteTeam.viewTeam")}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Tips Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-lg">{t("inviteTeam.tipsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>{t("inviteTeam.tipEmails")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>{t("inviteTeam.tipRoles")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>{t("inviteTeam.tipCsv")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>{t("inviteTeam.tipExpiry")}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
