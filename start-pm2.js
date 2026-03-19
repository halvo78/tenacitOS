const { execSync } = require('child_process');
execSync('npx next start -H 127.0.0.1 -p 3002', { stdio: 'inherit', cwd: __dirname });
