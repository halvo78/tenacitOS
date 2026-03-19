const { execSync } = require('child_process');
process.chdir(__dirname);
execSync('npx next start -H 127.0.0.1 -p 3000', { stdio: 'inherit' });
