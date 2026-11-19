import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Mail,
  UserX,
  RefreshCw,
  Shield,
  Users,
  User,
} from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  fullname?: string;
  usertype: 'ADMIN' | 'TEAM_MANAGER' | 'TEAM_MEMBER';
  status: 'active' | 'pending' | 'invited';
  joinedAt?: string;
  invitedAt?: string;
}

interface TeamMemberTableProps {
  members: TeamMember[];
  onResendInvite?: (id: string) => void;
  onRemove?: (id: string) => void;
  onChangeRole?: (id: string, role: string) => void;
  loading?: boolean;
}

type SortField = 'email' | 'usertype' | 'status' | 'joinedAt';
type SortOrder = 'asc' | 'desc';

/**
 * TeamMemberTable Component
 * Sortable table of team members with action dropdowns
 */
export const TeamMemberTable: React.FC<TeamMemberTableProps> = ({
  members,
  onResendInvite,
  onRemove,
  onChangeRole,
  loading = false,
}) => {
  const [sortField, setSortField] = useState<SortField>('email');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedMembers = [...members].sort((a, b) => {
    let aValue: string | undefined;
    let bValue: string | undefined;

    switch (sortField) {
      case 'email':
        aValue = a.email;
        bValue = b.email;
        break;
      case 'usertype':
        aValue = a.usertype;
        bValue = b.usertype;
        break;
      case 'status':
        aValue = a.status;
        bValue = b.status;
        break;
      case 'joinedAt':
        aValue = a.joinedAt || a.invitedAt;
        bValue = b.joinedAt || b.invitedAt;
        break;
    }

    if (aValue === undefined) aValue = '';
    if (bValue === undefined) bValue = '';

    const comparison = aValue.localeCompare(bValue);
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const getRoleIcon = (usertype: string) => {
    switch (usertype) {
      case 'ADMIN':
        return <Shield className="w-4 h-4 text-red-500" />;
      case 'TEAM_MANAGER':
        return <Users className="w-4 h-4 text-blue-500" />;
      default:
        return <User className="w-4 h-4 text-slate-400" />;
    }
  };

  const getRoleLabel = (usertype: string) => {
    switch (usertype) {
      case 'ADMIN':
        return 'Admin';
      case 'TEAM_MANAGER':
        return 'Manager';
      default:
        return 'Member';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full">
            Active
          </span>
        );
      case 'pending':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded-full">
            Pending
          </span>
        );
      case 'invited':
        return (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
            Invited
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300 rounded-full">
            {status}
          </span>
        );
    }
  };

  const SortHeader: React.FC<{ field: SortField; label: string }> = ({
    field,
    label,
  }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-700 dark:hover:text-slate-200"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field &&
          (sortOrder === 'asc' ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          ))}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded mb-2"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <tr>
            <SortHeader field="email" label="Email / Name" />
            <SortHeader field="usertype" label="Role" />
            <SortHeader field="status" label="Status" />
            <SortHeader field="joinedAt" label="Joined / Invited" />
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {sortedMembers.map((member) => (
            <tr
              key={member.id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <td className="px-4 py-4">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {member.fullname || member.email}
                  </p>
                  {member.fullname && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {member.email}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  {getRoleIcon(member.usertype)}
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {getRoleLabel(member.usertype)}
                  </span>
                </div>
              </td>
              <td className="px-4 py-4">{getStatusBadge(member.status)}</td>
              <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                {member.joinedAt
                  ? new Date(member.joinedAt).toLocaleDateString()
                  : member.invitedAt
                  ? new Date(member.invitedAt).toLocaleDateString()
                  : '-'}
              </td>
              <td className="px-4 py-4 text-right relative">
                <button
                  onClick={() =>
                    setActionMenuOpen(
                      actionMenuOpen === member.id ? null : member.id
                    )
                  }
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-slate-500" />
                </button>

                {actionMenuOpen === member.id && (
                  <div className="absolute right-4 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10">
                    {member.status === 'pending' && onResendInvite && (
                      <button
                        onClick={() => {
                          onResendInvite(member.id);
                          setActionMenuOpen(null);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 first:rounded-t-lg"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Resend Invite
                      </button>
                    )}
                    {onChangeRole && (
                      <button
                        onClick={() => {
                          // Show role change modal or dropdown
                          setActionMenuOpen(null);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <Shield className="w-4 h-4" />
                        Change Role
                      </button>
                    )}
                    {onRemove && (
                      <button
                        onClick={() => {
                          onRemove(member.id);
                          setActionMenuOpen(null);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 last:rounded-b-lg"
                      >
                        <UserX className="w-4 h-4" />
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sortedMembers.length === 0 && (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">No team members found</p>
        </div>
      )}
    </div>
  );
};

export default TeamMemberTable;
