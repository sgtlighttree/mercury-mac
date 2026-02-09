# Messenger Tauri

A lightweight, secure, and high-performance desktop wrapper for Facebook Messenger built with **Rust** and **Tauri v2**. This application provides a native-like experience with a significantly lower RAM and storage footprint than official Electron-based alternatives.

## Features

- 🚀 **Performance**: Rust-powered backend for minimal resource usage.
- 🔒 **Security**: Strict Content Security Policy (CSP) and zero-trust isolation.
- 🔔 **Native Notifications**: Fully integrated with macOS system notifications.
- 🎨 **Premium UI**: Custom-designed hybrid Rust/Messenger app icon.
- 🤖 **Automation**: One-click deployment script to `/Applications`.

---

## Getting Started

### Prerequisites

This project is optimized for **macOS**. You should have [Homebrew](https://brew.sh/) installed.

### 1. Environment Setup

If you don't have Rust installed, run the following commands to install it via `rustup`:

```bash
# Install rustup-init
brew install rustup-init

# Initialize Rust (select default options)
rustup-init -y

# Source the environment
source "$HOME/.cargo/env"
```

Verify the installation:
```bash
rustc --version
```

### 2. Clone the Repository

By default, we recommend cloning into your home folder to keep things organized:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/messenger-tauri.git
cd messenger-tauri
```

### 3. Install Project Dependencies

```bash
npm install
```

---

## Development & Usage

### Run in Debug Mode
To launch the app for testing:
```bash
npm run tauri dev
```

### Build & Deploy (Recommended)
We've included an automation script that closes any running instances, builds the app, and moves it to your `/Applications` folder.
```bash
npm run deploy
```

---

## Building for macOS

### Standard Build (Current Architecture)
To create a production `.app` bundle for your current machine (e.g., Apple Silicon):
```bash
npm run tauri build
```

### Universal Build (Apple Silicon + Intel)
To create a "Universal" binary that runs on both M-series and Intel-based Macs:

1. **Add the required targets**:
   ```bash
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```

2. **Run the universal build**:
   ```bash
   npm run tauri build -- --target universal-apple-darwin
   ```

The resulting apps/DMGs will be found in `src-tauri/target/universal-apple-darwin/release/bundle/`.

---

## Project Structure

- `src-tauri/`: The Rust backend and configuration.
- `src-tauri/capabilities/`: Security and permission settings.
- `scripts/deploy.sh`: Deployment automation script.
- `hybrid-logo.png`: The source premium icon.

---

## Security & Privacy

This app uses the system's native WebKit engine (Safari). It is configured with a strict User-Agent to ensure compatibility and a CSP that prevents any unauthorized external scripts from running within the webview.

## License

This project is licensed under the [MIT License](LICENSE).
