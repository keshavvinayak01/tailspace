#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const CONFIG_FILE = path.join(os.homedir(), '.tailspace.json');

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    return {};
}

const argv = yargs(hideBin(process.argv))
  .command('login [email]', 'Authenticate with your Tailscale email', (y) => {
    return y.positional('email', {
      describe: 'Tailscale email to authorize',
      type: 'string'
    });
  })
  .command('logout', 'Clear your Tailscale identity configuration', () => {})
  .command('start', 'Start the tailspace server', (y) => {
    return y
      .option('dir', {
        alias: 'd',
        type: 'string',
        description: 'The mounted folder to expose',
        demandOption: true,
      })
      .option('port', {
        alias: 'p',
        type: 'number',
        description: 'Port to run the server on',
        default: 3000,
      })
      .option('owner', {
        alias: 'o',
        type: 'string',
        description: 'Override the authorized Tailscale email',
      });
  })
  .help()
  .argv;

const command = argv._[0];

if (command === 'login') {
    const email = argv.email;
    if (!email) {
        console.error('Error: Please provide an email. Usage: tailspace login <email>');
        process.exit(1);
    }
    saveConfig({ owner: email });
    console.log(`Successfully logged in as: ${email}`);
    console.log(`Any device logged into Tailscale with this email will now have access.`);
    process.exit(0);
}

if (command === 'logout') {
    if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
        console.log('Successfully logged out. Identity configuration cleared.');
    } else {
        console.log('No active login found.');
    }
    process.exit(0);
}

if (command === 'start') {
  const config = loadConfig();
  const owner = argv.owner || config.owner;

  if (!owner) {
      console.error('Error: No authorized owner set. Please run "tailspace login <email>" first or use --owner <email>.');
      process.exit(1);
  }

  const serverPath = path.join(__dirname, '../server.js');
  const args = [serverPath, '--dir', argv.dir, '--port', argv.port, '--owner', owner];
  
  const server = spawn('node', args, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  server.on('close', (code) => {
    process.exit(code);
  });
} else if (!command) {
  yargs.showHelp();
}
