#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE = path.join(os.homedir(), '.tailspace.json');

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            return { authorized: [] };
        }
    }
    return { authorized: [] };
}

const argv = yargs(hideBin(process.argv))
  .command('auth <action> [email]', 'Manage authorized Tailscale users', (y) => {
    return y
      .positional('action', {
        choices: ['add', 'remove', 'list', 'clear'],
        describe: 'Action to perform'
      })
      .positional('email', {
        describe: 'Email to add or remove',
        type: 'string'
      });
  })
  .command('start', 'Start the tailspace server', (y) => {
    return y
      .option('dir', {
        alias: 'd',
        type: 'string',
        description: 'The folder to expose',
        demandOption: true,
      })
      .option('port', {
        alias: 'p',
        type: 'number',
        description: 'Port to run the server on',
        default: 3000,
      })
      .option('authorized', {
        alias: 'a',
        type: 'string',
        description: 'Override authorized users (comma-separated)',
      });
  })
  .help()
  .argv;

const command = argv._[0];

if (command === 'auth') {
    const config = loadConfig();
    if (!config.authorized) config.authorized = [];
    
    const action = argv.action;
    const email = argv.email;

    if (action === 'add') {
        if (!email) { console.error('Error: Email required.'); process.exit(1); }
        if (!config.authorized.includes(email)) {
            config.authorized.push(email);
            saveConfig(config);
            console.log(`Added ${email} to authorized users.`);
        } else {
            console.log(`${email} is already authorized.`);
        }
    } else if (action === 'remove') {
        if (!email) { console.error('Error: Email required.'); process.exit(1); }
        config.authorized = config.authorized.filter(e => e !== email);
        saveConfig(config);
        console.log(`Removed ${email} from authorized users.`);
    } else if (action === 'list') {
        console.log('Authorized Users:');
        if (config.authorized.length === 0) console.log('  (None)');
        else config.authorized.forEach(e => console.log(`  - ${e}`));
    } else if (action === 'clear') {
        saveConfig({ authorized: [] });
        console.log('Cleared all authorized users.');
    }
    process.exit(0);
}

if (command === 'start') {
  const config = loadConfig();
  const authorized = argv.authorized || config.authorized?.join(',');

  if (!authorized || authorized.length === 0) {
      console.error('Error: No authorized users set. Run "tailspace auth add <email>" first.');
      process.exit(1);
  }

  const serverPath = path.join(__dirname, '../server.js');
  const args = [serverPath, '--dir', argv.dir, '--port', argv.port, '--authorized', authorized];
  
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
