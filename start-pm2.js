const { execSync } = require('child_process');

// Localhost mode: disable Secure cookie flag for HTTP access
process.env.LOCALHOST_MODE = '1';

// Fetch secrets from GCP Secret Manager at runtime (no secrets on disk)
// gcloud on Windows is a .ps1 script, must invoke via powershell
const GCLOUD = 'powershell.exe -NoProfile -NonInteractive -Command';
function gcpSecret(name) {
  try {
    return execSync(`${GCLOUD} "& gcloud secrets versions access latest --secret=${name}"`, {
      encoding: 'utf-8', timeout: 20000, windowsHide: true
    }).trim();
  } catch (e) {
    console.warn(`[mission-control] Failed to fetch ${name}:`, e.stderr?.substring(0, 100) || e.message?.substring(0, 100));
    return null;
  }
}

if (!process.env.ADMIN_PASSWORD) {
  const pw = gcpSecret('TENACITOS_ADMIN_PASSWORD');
  if (pw) process.env.ADMIN_PASSWORD = pw;
}
if (!process.env.AUTH_SECRET) {
  const secret = gcpSecret('TENACITOS_AUTH_SECRET');
  if (secret) process.env.AUTH_SECRET = secret;
}

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[mission-control] WARNING: ADMIN_PASSWORD not set. Login will fail.');
}

execSync('npx next start -H 127.0.0.1 -p 3002', { stdio: 'inherit', cwd: __dirname });
