import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

interface NotesPanelProps {
  projectid: string;
}

interface Note {
  noteid: string;
  projectid: string;
  content: string;
  type: 'user' | 'system';
  author: string;
  createdAt: string;
  updatedAt: string;
}

export const NotesPanel: React.FC<NotesPanelProps> = ({ projectid }) => {
  const [newNoteContent, setNewNoteContent] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'user' | 'system'>('all');
  const [editingNoteid, setEditingNoteid] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch notes
  const { data: notesData, isLoading, refetch } = useQuery({
    queryKey: ['projectNotes', projectid, filterType],
    queryFn: async () => {
      const response = await fetch(
        `/api/notes/project/${projectid}?type=${filterType}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
  });

  // Create note mutation
  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ projectid, content }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create note');
      }
      return response.json();
    },
    onSuccess: () => {
      setNewNoteContent('');
      setSuccess('Note created');
      setTimeout(() => setSuccess(''), 3000);
      refetch();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create note');
    },
  });

  // Update note mutation
  const updateMutation = useMutation({
    mutationFn: async (noteid: string) => {
      const response = await fetch(`/api/notes/${noteid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ content: editingContent }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update note');
      }
      return response.json();
    },
    onSuccess: () => {
      setEditingNoteid(null);
      setEditingContent('');
      setSuccess('Note updated');
      setTimeout(() => setSuccess(''), 3000);
      refetch();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to update note');
    },
  });

  // Delete note mutation
  const deleteMutation = useMutation({
    mutationFn: async (noteid: string) => {
      const response = await fetch(`/api/notes/${noteid}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete note');
      }
      return response.json();
    },
    onSuccess: () => {
      setSuccess('Note deleted');
      setTimeout(() => setSuccess(''), 3000);
      refetch();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to delete note');
    },
  });

  const notes = notesData?.notes || [];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Project Notes</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* New Note Input */}
      <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <label htmlFor="newnote" className="block text-sm font-medium text-slate-900 mb-2">
          Add a new note
        </label>
        <textarea
          id="newnote"
          value={newNoteContent}
          onChange={(e) => {
            setNewNoteContent(e.target.value);
            setError('');
          }}
          placeholder="Write a note about this project..."
          maxLength={5000}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">
            {newNoteContent.length}/5000 characters
          </span>
          <button
            onClick={() => createMutation.mutate(newNoteContent)}
            disabled={!newNoteContent.trim() || createMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 font-medium text-sm transition"
          >
            {createMutation.isPending ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterType('all')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
            filterType === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          All Notes
        </button>
        <button
          onClick={() => setFilterType('user')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
            filterType === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Your Notes
        </button>
        <button
          onClick={() => setFilterType('system')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
            filterType === 'system'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          System Updates
        </button>
      </div>

      {/* Notes List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-slate-500 text-sm">No notes yet. Start by adding one above!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((n: Note) => (
            <div
              key={n.noteid}
              className={`p-4 rounded-lg border ${
                n.type === 'system'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {n.author}
                    {n.type === 'system' && (
                      <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-800 text-xs rounded-full">
                        System
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatDate(n.createdAt)}
                    {n.updatedAt !== n.createdAt && ` (edited)`}
                  </p>
                </div>

                {/* Actions - only for user notes */}
                {n.type === 'user' && (
                  <div className="flex gap-2">
                    {editingNoteid !== n.noteid && (
                      <>
                        <button
                          onClick={() => {
                            setEditingNoteid(n.noteid);
                            setEditingContent(n.content);
                            setError('');
                          }}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(n.noteid)}
                          disabled={deleteMutation.isPending}
                          className="text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Note Content */}
              {editingNoteid === n.noteid ? (
                <div className="space-y-2">
                  <textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    maxLength={5000}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingNoteid(null);
                        setEditingContent('');
                      }}
                      className="px-3 py-1 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
                      disabled={updateMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => updateMutation.mutate(n.noteid)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:bg-blue-400"
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-slate-700 text-sm whitespace-pre-wrap">{n.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotesPanel;
