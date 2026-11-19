import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface ProjectSettingsProps {
  projectid: string;
  onSaved?: () => void;
}

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({
  projectid,
  onSaved,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    projectname: '',
    clientname: '',
    description: '',
    hourlyrate: 50,
    allocatedhours: 0,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch project details
  const { data: projectData, isLoading } = useQuery({
    queryKey: ['project', projectid],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectid}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch project');
      return response.json();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch(`/api/projects/${projectid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update project');
      }
      return response.json();
    },
    onSuccess: () => {
      setSuccess('Project updated successfully');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
      onSaved?.();
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update project');
    },
  });

  // Initialize form with project data
  useEffect(() => {
    if (projectData?.project) {
      setFormData({
        projectname: projectData.project.projectname,
        clientname: projectData.project.clientname,
        description: projectData.project.description || '',
        hourlyrate: projectData.project.hourlyrate,
        allocatedhours: projectData.project.allocatedhours,
      });
    }
  }, [projectData]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Project Settings</h2>
        {!isEditing && (
          <button
            onClick={() => {
              setIsEditing(true);
              setError('');
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Edit Project
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {!isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-600">Project Name</label>
            <p className="text-lg text-slate-900 mt-1">{formData.projectname}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Client Name</label>
            <p className="text-lg text-slate-900 mt-1">{formData.clientname}</p>
          </div>
          {formData.description && (
            <div>
              <label className="text-sm font-medium text-slate-600">Description</label>
              <p className="text-slate-700 mt-1">{formData.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <label className="text-sm font-medium text-slate-600">Hourly Rate</label>
              <p className="text-lg text-slate-900 mt-1">${formData.hourlyrate}/hour</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Allocated Hours</label>
              <p className="text-lg text-slate-900 mt-1">{formData.allocatedhours} hours</p>
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate(formData);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="projectname" className="block text-sm font-medium text-slate-900 mb-1">
              Project Name
            </label>
            <input
              id="projectname"
              type="text"
              value={formData.projectname}
              onChange={(e) => setFormData({ ...formData, projectname: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="clientname" className="block text-sm font-medium text-slate-900 mb-1">
              Client Name
            </label>
            <input
              id="clientname"
              type="text"
              value={formData.clientname}
              onChange={(e) => setFormData({ ...formData, clientname: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-900 mb-1">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="hourlyrate" className="block text-sm font-medium text-slate-900 mb-1">
                Hourly Rate ($)
              </label>
              <input
                id="hourlyrate"
                type="number"
                min="0"
                step="0.01"
                value={formData.hourlyrate}
                onChange={(e) => setFormData({ ...formData, hourlyrate: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="allocatedhours" className="block text-sm font-medium text-slate-900 mb-1">
                Allocated Hours
              </label>
              <input
                id="allocatedhours"
                type="number"
                min="0"
                step="0.5"
                value={formData.allocatedhours}
                onChange={(e) => setFormData({ ...formData, allocatedhours: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-900 hover:bg-slate-50 font-medium transition"
              disabled={updateMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition disabled:bg-blue-400"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ProjectSettings;
