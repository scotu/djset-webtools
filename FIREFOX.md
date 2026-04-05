# Build 

**Operating system:** macOS, Linux, or Windows.

**Node.js 18 or later**

**pnpm 8 or later**

```bash
# via npm (cross-platform, after installing Node.js)
npm install -g pnpm

# macOS via Homebrew
brew install pnpm
```

## Setup

```bash
pnpm install
```

---

## Reproducing the Firefox build (AMO reviewers)

These instructions produce a byte-equivalent copy of the Firefox package submitted to addons.mozilla.org.

**Requirements:** Node.js 18+ and pnpm 8+ — see [installation instructions above](#requirements).

```bash
# 1. Install dependencies
pnpm install

# 2. Build and package the Firefox extension
pnpm zip:firefox
```

The packaged extension is written to `.output/djset-webtools-<version>-firefox.zip`.

All source files in this repository are unminified TypeScript. The build step (`wxt zip`) transpiles them to JavaScript and packages the result — no pre-built or machine-generated source files are included in this repository.