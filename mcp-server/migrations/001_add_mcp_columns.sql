-- Migration: Add MCP-specific columns to support 017 MCP Project Hub
-- Date: 2025-01-XX
-- Description: Adds sourceEventId, taskIds, tags, documentIds, assignee columns

-- Add columns to projectdocuments table
ALTER TABLE projectdocuments 
ADD COLUMN IF NOT EXISTS sourceeventid UUID,
ADD COLUMN IF NOT EXISTS taskids JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

-- Add columns to projecttasks table
ALTER TABLE projecttasks 
ADD COLUMN IF NOT EXISTS sourceeventid UUID,
ADD COLUMN IF NOT EXISTS documentids JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS assignee VARCHAR(255);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_projectdocuments_sourceeventid ON projectdocuments(sourceeventid);
CREATE INDEX IF NOT EXISTS idx_projecttasks_sourceeventid ON projecttasks(sourceeventid);
CREATE INDEX IF NOT EXISTS idx_projecttasks_assignee ON projecttasks(assignee);
