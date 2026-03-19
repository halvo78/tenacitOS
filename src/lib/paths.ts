import path from 'path';

/**
 * Centralized path configuration.
 * Defaults are for Windows (Halvo Empire setup).
 * Override via environment variables for other environments.
 */
export const OPENCLAW_DIR = process.env.OPENCLAW_DIR || 'E:\\.openclaw';
export const OPENCLAW_WORKSPACE = process.env.OPENCLAW_WORKSPACE || 'E:\\workspaces\\main';
export const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, 'openclaw.json');
export const OPENCLAW_MEDIA = path.join(OPENCLAW_DIR, 'media');

export const WORKSPACE_IDENTITY = path.join(OPENCLAW_WORKSPACE, 'IDENTITY.md');
export const WORKSPACE_TOOLS = path.join(OPENCLAW_WORKSPACE, 'TOOLS.md');
export const WORKSPACE_MEMORY = path.join(OPENCLAW_WORKSPACE, 'memory');

export const SYSTEM_SKILLS_PATH = process.env.OPENCLAW_SKILLS_PATH || 'E:\\npm-global\\node_modules\\openclaw\\skills';
export const WORKSPACE_SKILLS_PATH = process.env.WORKSPACE_SKILLS_PATH || path.join(OPENCLAW_WORKSPACE, 'skills');

/** Allowed base paths for media/file serving */
export const ALLOWED_MEDIA_PREFIXES = [
  path.join(OPENCLAW_WORKSPACE, '/'),
  path.join(OPENCLAW_MEDIA, '/'),
];
