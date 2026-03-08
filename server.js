const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');
const net = require('net');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
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
    description: 'The Tailscale email authorized to access this server',
    demandOption: true,
  })
  .argv;

const app = express();
const uploadDir = argv.dir;
const authorizedOwner = argv.owner;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware to check Tailscale Identity
app.use((req, res, next) => {
  let clientIp = req.socket.remoteAddress;
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.split('::ffff:')[1];
  }

  if (!net.isIP(clientIp)) {
    return res.status(400).send('Invalid IP address');
  }

  if (clientIp === '127.0.0.1' || clientIp === '::1') {
    return next();
  }

  execFile('tailscale', ['whois', '--json', clientIp], (error, stdout, stderr) => {
    if (error) {
      return res.status(401).send('Unauthorized: Not a valid tailscale device.');
    }
    try {
      const data = JSON.parse(stdout);
      const email = data.UserProfile?.LoginName;
      if (email === authorizedOwner) {
        next();
      } else {
        console.warn(`Access denied for user: ${email}. Authorized owner is: ${authorizedOwner}`);
        return res.status(403).send('Forbidden: Unauthorized Tailscale user.');
      }
    } catch (e) {
      return res.status(500).send('Error verifying identity.');
    }
  });
});

const categories = ['images', 'videos', 'documents', 'audio', 'hidden', 'others'];

function getCategoryForFile(filename, mime = '') {
    const fn = filename.toLowerCase();
    if (fn.startsWith('.') || 
        ['desktop.ini', 'thumbs.db', 'autorun.inf', '$recycle.bin'].some(sys => fn.includes(sys))) {
        return 'hidden';
    }
    if (fn.endsWith('.zip') || fn.endsWith('.tar') || fn.endsWith('.gz') || fn.endsWith('.7z') || fn.endsWith('.rar')) {
        return 'others';
    }
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|svg|webp|bmp)$/i.test(fn)) return 'images';
    if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|wmv|flv|webm)$/i.test(fn)) return 'videos';
    if (mime.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(fn)) return 'audio';
    if (mime.startsWith('text/') || mime === 'application/pdf' || mime.includes('document') || /\.(pdf|doc|docx|txt|rtf|odt|xls|xlsx|ppt|pptx)$/i.test(fn)) return 'documents';
    return 'others';
}

// Dynamic Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const relativePath = req.query.path || '';
    const subfolder = getCategoryForFile(file.originalname, file.mimetype);

    let finalPath = path.join(uploadDir, relativePath);
    if (req.body.folderName) {
        finalPath = path.join(finalPath, req.body.folderName);
    }

    const targetDir = path.join(finalPath, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const upload = multer({ storage: storage });

app.use(express.json());

// Upload Endpoint
app.post('/upload', upload.array('files'), (req, res) => {
  res.json({ message: 'Files uploaded successfully!' });
});

// Delete Endpoint
app.post('/api/delete', (req, res) => {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
        return res.status(400).send('Invalid request: No files provided.');
    }

    const errors = [];
    files.forEach(fileRelPath => {
        const fullPath = path.join(uploadDir, fileRelPath);
        if (!fullPath.startsWith(uploadDir) || fileRelPath.includes('..')) {
            errors.push(`Access denied: ${fileRelPath}`);
            return;
        }

        try {
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            } else {
                errors.push(`File not found: ${fileRelPath}`);
            }
        } catch (e) {
            errors.push(`Error deleting ${fileRelPath}: ${e.message}`);
        }
    });

    if (errors.length > 0) {
        res.status(207).json({ message: 'Deletion completed with some errors', errors });
    } else {
        res.json({ message: 'All selected files deleted successfully!' });
    }
});

// List Files Endpoint
app.get('/api/files', (req, res) => {
    const relativePath = req.query.path || '';
    const targetDir = path.join(uploadDir, relativePath);

    if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Directory not found' });
    }

    const result = {
        folders: [],
        images: [],
        videos: [],
        documents: [],
        audio: [],
        hidden: [],
        others: []
    };

    try {
        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        
        items.forEach(item => {
            if (item.isDirectory()) {
                if (!categories.includes(item.name)) {
                    result.folders.push({ name: item.name, path: path.join(relativePath, item.name) });
                }
            } else if (item.isFile()) {
                const cat = getCategoryForFile(item.name);
                result[cat].push({
                    name: item.name,
                    url: `/files/${path.join(relativePath, item.name)}`,
                    path: path.join(relativePath, item.name)
                });
            }
        });

        categories.forEach(cat => {
            const catPath = path.join(targetDir, cat);
            if (fs.existsSync(catPath) && fs.statSync(catPath).isDirectory()) {
                const files = fs.readdirSync(catPath);
                files.forEach(file => {
                    const filePath = path.join(catPath, file);
                    if (fs.statSync(filePath).isFile()) {
                        result[cat].push({
                            name: file,
                            url: `/files/${path.join(relativePath, cat, file)}`,
                            path: path.join(relativePath, cat, file)
                        });
                    }
                });
            }
        });

        res.json(result);
    } catch (e) {
        res.status(500).send('Error reading directory');
    }
});

// API Endpoint for Usage Stats
app.get('/api/usage', (req, res) => {
    exec(`df -B1 "${uploadDir}"`, (error, stdout) => {
        if (error) return res.status(500).send('Error getting disk usage');
        const lines = stdout.trim().split('\n');
        const dataLine = lines[lines.length - 1];
        const stats = dataLine.replace(/\s+/g, ' ').split(' ');
        const totalSpace = parseInt(stats[1]);
        
        exec(`du -sb "${uploadDir}"`, (duError, duStdout) => {
            if (duError) return res.status(500).send('Error calculating folder size');
            const usedSpace = parseInt(duStdout.trim().split('\t')[0]);
            res.json({
                used: usedSpace,
                total: totalSpace,
                percent: ((usedSpace / totalSpace) * 100).toFixed(2)
            });
        });
    });
});

// --- STATIC ROUTES LAST ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(uploadDir));

app.listen(argv.port, () => {
  console.log(`Tailspace running on port ${argv.port}`);
  console.log(`Authorized owner: ${authorizedOwner}`);
});
