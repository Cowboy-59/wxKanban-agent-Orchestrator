import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@client/components/ui/Button';
import { Input } from '@client/components/ui/Input';
import { Label } from '@client/components/ui/Label';
import { Textarea } from '@client/components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/components/ui/Select';

import { Loader2, Send, CheckCircle, XCircle } from 'lucide-react';

interface SingleInviteFormProps {
  onSuccess?: () => void;
}

interface InvitationResult {
  successful: Array<{ email: string; invitationId: string }>;
  failed: Array<{ email: string; error: string }>;
}

/**
 * SingleInviteForm Component
 * Form for inviting a single team member by email
 */
export const SingleInviteForm: React.FC<SingleInviteFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [usertype, setUsertype] = useState('TEAM_MEMBER');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<InvitationResult | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async (data: { emails: string[]; usertype: string; message?: string }) => {
      const response = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send invitation');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setResult(data.results);
      if (data.results.successful.length > 0 && onSuccess) {
        onSuccess();
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    inviteMutation.mutate({
      emails: [email],
      usertype,
      message: message || undefined,
    });
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={inviteMutation.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="usertype">Role</Label>
        <Select value={usertype} onValueChange={setUsertype} disabled={inviteMutation.isPending}>
          <SelectTrigger id="usertype">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
            <SelectItem value="TEAM_MANAGER">Team Manager</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {usertype === 'ADMIN' && 'Full access to company settings and user management'}
          {usertype === 'TEAM_MANAGER' && 'Can manage projects and team members'}
          {usertype === 'TEAM_MEMBER' && 'Standard access to tasks and projects'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Personal Message (Optional)</Label>
        <Textarea
          id="message"
          placeholder="Add a personal note to your invitation..."
          value={message}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
          maxLength={500}
          disabled={inviteMutation.isPending}
          className="min-h-[100px]"
        />

        <p className="text-sm text-slate-500 dark:text-slate-400 text-right">
          {message.length}/500
        </p>
      </div>

      {result && (
        <div className="space-y-3">
          {result.successful.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-800 dark:text-green-200">
                Invitation sent to {result.successful[0].email}
              </span>
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-800 dark:text-red-200">
                {result.failed[0].error}
              </span>
            </div>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={!isValidEmail(email) || inviteMutation.isPending}
        className="w-full"
      >
        {inviteMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Send Invitation
          </>
        )}
      </Button>
    </form>
  );
};

export default SingleInviteForm;
