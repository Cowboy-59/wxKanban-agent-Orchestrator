/**
 * ProjectSetupWizard.tsx
 * 
 * 8-step wizard for setting up local project directory
 * Spec 011: New Project — AI-Ready Project Provisioning
 */

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Progress } from '../ui/Progress';
import { 
  FolderOpen, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw,
  ChevronRight,
  Folder,
  FileText,
  Terminal,
  Settings,
  BookOpen,
  Shield,
  CheckSquare
} from 'lucide-react';

interface ProjectSetupWizardProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

interface SetupStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

const STEPS: Omit<SetupStep, 'status' | 'error'>[] = [
  {
    id: 'verify-directory',
    label: 'Verify Directory',
    description: 'Check target directory exists and is writable',
    icon: <Folder className="w-5 h-5" />,
  },
  {
    id: 'create-structure',
    label: 'Create Structure',
    description: 'Create _wxAI/commands/, mcp-server/, specs/, src/, docs/',
    icon: <FolderOpen className="w-5 h-5" />,
  },
  {
    id: 'copy-commands',
    label: 'Copy AI Commands',
    description: 'Copy 7 command templates (using project.* MCP tools) to _wxAI/commands/',
    icon: <Terminal className="w-5 h-5" />,
  },
  {
    id: 'create-mcp',
    label: 'Create MCP Server',
    description: 'Create 017 MCP Project Hub server in mcp-server/',
    icon: <Settings className="w-5 h-5" />,
  },
  {
    id: 'create-config',
    label: 'Create Config',
    description: 'Create .wxkanban-project.json with MCP server config',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    id: 'create-context',
    label: 'Create Context',
    description: 'Create AI.md with 017 MCP tool references',
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    id: 'create-env',
    label: 'Create Environment',
    description: 'Create .env with encrypted DATABASE_URL and API_KEY',
    icon: <Shield className="w-5 h-5" />,
  },
  {
    id: 'verify-setup',
    label: 'Verify Setup',
    description: 'Verify all files created and MCP server ready',
    icon: <CheckSquare className="w-5 h-5" />,
  },
];


// File System Access API types
interface FileSystemDirectoryHandle {
  name: string;
  kind: 'directory';
}

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

export const ProjectSetupWizard: React.FC<ProjectSetupWizardProps> = ({
  projectId,
  projectName,
  isOpen,
  onClose,
  onComplete,
}) => {
  const [targetDir, setTargetDir] = useState('');
  const [steps, setSteps] = useState<SetupStep[]>(
    STEPS.map(s => ({ ...s, status: 'pending' }))
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);

  const API_BASE = '/api/kit';

  const getToken = () => localStorage.getItem('wxkanban_token') || '';


  const runStep = async (index: number, dir: string): Promise<boolean> => {
    const step = STEPS[index];
    setCurrentStepIndex(index);
    
    setSteps(prev => prev.map((s, idx) => 
      idx === index ? { ...s, status: 'running' } : s
    ));

    try {
      const response = await fetch(`${API_BASE}/${step.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          targetDir: dir,
          projectId,
          projectName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Step ${step.id} failed`);
      }

      setSteps(prev => prev.map((s, idx) => 
        idx === index ? { ...s, status: 'completed' } : s
      ));
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setSteps(prev => prev.map((s, idx) => 
        idx === index ? { ...s, status: 'error', error: errorMessage } : s
      ));
      setHasError(true);
      return false;
    }
  };

  const startSetup = useCallback(async (dir: string) => {
    if (!dir.trim()) {
      return;
    }

    setIsRunning(true);
    setHasError(false);
    setIsComplete(false);
    setSteps(STEPS.map(s => ({ ...s, status: 'pending' })));

    for (let i = 0; i < STEPS.length; i++) {
      const success = await runStep(i, dir);
      if (!success) {
        setIsRunning(false);
        return;
      }
    }

    setIsComplete(true);
    setIsRunning(false);
    onComplete?.();
  }, [projectId, projectName, onComplete]);

  const handleBrowseClick = async () => {
    // Browsers cannot access full file system paths for security reasons
    // This button is just to help users identify the folder name
    // They must manually enter the full path in the input field
    
    if (window.showDirectoryPicker) {
      let dirHandle: FileSystemDirectoryHandle | null = null;
      try {
        setIsPickingDirectory(true);
        dirHandle = await window.showDirectoryPicker();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Directory picker error:', err);
        }
        setIsPickingDirectory(false);
        return;
      }
      
      if (dirHandle) {
        // Note: Browser only provides the folder name, NOT the full path
        // We don't auto-fill because it would be misleading (just the name, not full path)
        // User must manually type the full path like: C:/Users/username/projects/my-project
        setIsPickingDirectory(false);
        // Focus the input so user can type the full path
        const inputEl = document.getElementById('targetDir') as HTMLInputElement;
        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        }
      }

    } else {
      // Fallback for browsers without File System Access API
      alert('Please manually enter the full directory path (e.g., C:/Users/username/projects/my-project)');
    }
  };


  const retryFromError = async () => {
    const errorIndex = steps.findIndex(s => s.status === 'error');
    if (errorIndex === -1) return;

    setHasError(false);
    setIsRunning(true);

    for (let i = errorIndex; i < STEPS.length; i++) {
      const success = await runStep(i, targetDir);
      if (!success) {
        setIsRunning(false);
        return;
      }
    }

    setIsComplete(true);
    setIsRunning(false);
    onComplete?.();
  };

  const getStepIcon = (step: SetupStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <span className="text-gray-400 dark:text-gray-500">{step.icon}</span>;
    }
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const progress = ((completedCount / STEPS.length) * 100);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
            <FolderOpen className="w-6 h-6 text-blue-500" />
            Setup Local Project Directory
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Configure your local development environment for <strong className="text-gray-900 dark:text-white">{projectName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="targetDir" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Target Directory
            </Label>
            <div className="flex gap-2">
              <Input
                id="targetDir"
                value={targetDir}
                onChange={(e) => setTargetDir(e.target.value)}
                placeholder="e.g., C:/Users/username/projects/my-project"
                className="flex-1 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                disabled={isRunning}
              />
              <Button
                variant="outline"
                onClick={handleBrowseClick}
                disabled={isRunning || isPickingDirectory}
                className="flex items-center gap-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {isPickingDirectory ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FolderOpen className="w-4 h-4" />
                )}
                Browse...
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter the full directory path where you want to create the project
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Note: Browsers cannot access full file system paths for security reasons. 
              Please type the complete path manually (e.g., C:/Users/username/projects/my-project).
              The Browse button only helps identify the folder name.
            </p>


          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Progress</span>
              <span className="font-medium text-gray-900 dark:text-white">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2 dark:bg-gray-700" />
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  currentStepIndex === index ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 
                  step.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20' :
                  step.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-800'
                }`}
              >
                <div className="mt-0.5">{getStepIcon(step)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{step.label}</span>
                    {currentStepIndex === index && isRunning && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Running...</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{step.description}</p>
                  {step.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-medium">
                      Error: {step.error}
                    </p>
                  )}
                </div>
                {index < steps.length - 1 && step.status === 'completed' && (
                  <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4 border-t dark:border-gray-700">
            <div>
              {hasError && (
                <Button
                  variant="outline"
                  onClick={retryFromError}
                  disabled={isRunning}
                  className="flex items-center gap-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry from Error
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={isRunning}
                className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {isComplete ? 'Close' : 'Cancel'}
              </Button>
              {!isComplete && !isRunning && (
                <Button
                  onClick={() => startSetup(targetDir)}
                  disabled={!targetDir.trim()}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Start Setup
                </Button>
              )}
              {isRunning && (
                <Button
                  disabled
                  className="flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up...
                </Button>
              )}
              {isComplete && (
                <Button
                  onClick={onClose}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Done
                </Button>
              )}
            </div>
          </div>

          {isComplete && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-green-800 dark:text-green-300 font-medium">Setup Complete!</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Your project is ready at <code className="bg-green-100 dark:bg-green-900/40 px-1 rounded">{targetDir}</code>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
