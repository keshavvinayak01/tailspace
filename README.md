# Tailspace

A self-hosted storage server designed to be accessible only via your private **Tailscale** network. It automatically sorts uploaded files and folders into categories (images, videos, documents, etc.) and provides a modern, responsive web UI.

## Features

- **Tailscale Authentication**: No passwords needed. Uses `tailscale whois` to verify identities.
- **Auto-Sorting**: Files are automatically organized by type into sub-folders.
- **Path Navigation**: Browse through folder structures with breadcrumb support.
- **Real-time Progress**: Visual upload progress bar for files and large folders.
- **Delete Mode**: Securely delete multiple files at once with confirmation.
- **Image Preview**: Toggle between list view and a 3-column thumbnail grid.
- **Disk Usage**: Real-time display of used and total storage space.

## Installation

Install Tailspace globally via npm:

```bash
npm install -g tailspace
```

## Getting Started

### 1. Authorize Users
Add the Tailscale email addresses that are authorized to access your storage:
```bash
tailspace auth add your-email@gmail.com
tailspace auth add friend-email@gmail.com
```

### 2. Manage Access
You can list, remove, or clear authorized users:
```bash
tailspace auth list
tailspace auth remove friend-email@gmail.com
tailspace auth clear
```

### 3. Start the Server
Point Tailspace to the directory you want to expose:
```bash
tailspace start --dir /path/to/your/storage --port 3000
```

## Usage

- **Upload**: Drag and drop or use the buttons to upload files and entire folders.
- **Browse**: Click on folders to navigate deeper into your storage.
- **Delete**: Click the "Delete Mode" button to select and remove files.
- **Preview**: Click the "Preview" button in the Images section to see thumbnails.

## License

ISC
