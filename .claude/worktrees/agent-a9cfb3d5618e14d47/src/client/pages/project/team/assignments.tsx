/**
 * Page: Project Team Duty Assignments
 *
 * Manage duty assignments for a project's team.
 * Features:
 * - Duty assignment form
 * - Team member list with assigned duties
 * - Remove assignments (Team Manager only)
 * - Compliance override history
 *
 * Implements T069-T070
 */

import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { DutyAssignmentForm } from '../../../components/duty-assignment/AssignmentForm';
import { TeamDutyList } from '../../../components/team/TeamDutyList';

interface TeamMember {
  userId: string;
  userName: string;
  email: string;
}

interface ProjectTeamAssignmentsPageProps {
  // Props would come from route/context
}

export const ProjectTeamAssignmentsPage: React.FC<
  ProjectTeamAssignmentsPageProps
> = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mock data - would come from API
  const [teamMembers] = useState<TeamMember[]>([
    {
      userId: '1',
      userName: 'Alice Johnson',
      email: 'alice@example.com',
    },
    {
      userId: '2',
      userName: 'Bob Smith',
      email: 'bob@example.com',
    },
    {
      userId: '3',
      userName: 'Carol Davis',
      email: 'carol@example.com',
    },
  ]);

  const securityStandard = 'SOC2'; // Would come from project settings

  const handleAssignmentSuccess = () => {
    setSuccessMessage('Duty assigned successfully');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleError = (error: string) => {
    setErrorMessage(error);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  if (!projectId) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Project ID not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Team Duty Assignments</h1>
        <p className="mt-2 text-gray-600">
          Manage duty assignments for your project team
        </p>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="rounded-lg bg-green-50 p-4 text-green-700">
          ✓ {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          ✗ {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Assignment Form - Sidebar */}
        <div className="lg:col-span-1">
          <DutyAssignmentForm
            projectId={projectId}
            teamMembers={teamMembers}
            securityStandard={securityStandard}
            onSuccess={handleAssignmentSuccess}
            onError={handleError}
          />
        </div>

        {/* Team Duty List - Main Content */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="mb-6 text-lg font-semibold">Current Assignments</h2>
            <TeamDutyList
              projectId={projectId}
              isTeamManager={true} // Would come from auth context
              onRemoveSuccess={handleAssignmentSuccess}
              onError={handleError}
            />
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">About Duty Assignments</h3>
        <p className="mt-2 text-sm text-blue-800">
          Assign team members to duties in your project's workflow. The system
          will validate assignments against{' '}
          <strong>{securityStandard} compliance rules</strong> to prevent
          conflicts of interest.
        </p>
      </div>
    </div>
  );
};
