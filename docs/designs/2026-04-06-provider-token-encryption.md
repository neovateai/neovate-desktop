# Provider Token Encryption with `safeStorage`

**Date:** 2026-04-06
**Status:** Approved

## Problem

Provider API keys are stored in plaintext in `~/.neovate-desktop/config.json` via `electron-store`. Anyone with filesystem access can read them.

## Decision

Encrypt the `apiKey` field on providers using Electron's `safeStorage.encryptString()` / `decryptString()`. This uses the OS credential store (macOS Keychain, Windows DPAPI, Linux libsecret).

## Scope

- Only the `apiKey` field on `Provider` objects
- `envOverrides` values are NOT encrypted (can be addressed later)

## Design

### Approach: Encryption at the ConfigStore layer

Encrypt/decrypt in `ConfigStore`'s provider methods. The `Provider` type stays unchanged — all consumers (router, LLM service, renderer) see plaintext `apiKey`. The on-disk format uses `encryptedApiKey` instead. Single point of change.

### Architecture

```
Renderer (Provider type with apiKey)
    |  oRPC IPC
Provider Router (Provider type with apiKey)
    |
ConfigStore  <-- encrypt on write, decrypt on read
    |
config.json  (encryptedApiKey: base64, no apiKey field)
```

### On-disk format change

```jsonc
// Before
{ "id": "anthropic", "apiKey": "sk-ant-abc123", ... }

// After
{ "id": "anthropic", "encryptedApiKey": "base64==", ... }
```

### Key changes

#### 1. ConfigStore (`src/main/features/config/config-store.ts`)

- `addProvider()` / `updateProvider()`: encrypt `apiKey` -> `encryptedApiKey` before `store.set()`
- `getProviders()` / `getProvider()`: decrypt `encryptedApiKey` -> `apiKey` before returning
- Two helper functions: `encryptProvider()` and `decryptProvider()`
- `safeStorage.isEncryptionAvailable()` guard — if encryption unavailable (rare Linux case), fall back to storing plaintext `apiKey` as-is

#### 2. Migration (in ConfigStore constructor)

- On startup: scan providers for plaintext `apiKey` fields
- Encrypt each one and rewrite as `encryptedApiKey`
- Delete the old `apiKey` field
- One-time, idempotent (follows existing `migrateRegistryUrls` pattern)

#### 3. Types — No changes

- `Provider` type keeps `apiKey: string` (in-memory/IPC representation)
- On-disk schema is internal to ConfigStore

#### 4. Contracts — No changes

- oRPC contracts already use `apiKey: string` — unchanged since renderer sends/receives plaintext keys

### What does NOT change

- `Provider` type in `src/shared/`
- oRPC contracts in `src/shared/`
- Provider router in `src/main/`
- Renderer store / settings panel
- LLM service
- Agent claude-settings

### Renderer key visibility

Full decrypted key is available to the renderer via the existing `provider.list` / `provider.get` IPC calls. No masking.

### Timing: `safeStorage` availability

`ConfigStore` is instantiated at module level (`index.ts:49`), **before `app.whenReady()`**. Electron's `safeStorage` APIs throw or return false before the app is ready.

- **Reads/writes are safe** — they happen via IPC handlers, which only fire after the window exists (post-ready)
- **Migration cannot run in the constructor** — unlike `migrateRegistryUrls` (which doesn't use Electron APIs), API key migration needs `safeStorage`

**Solution:** Add a `migrateApiKeys()` method on ConfigStore, called from `index.ts` after `app.whenReady()`. Do NOT put it in the constructor.

### Decryption failure handling

`safeStorage.decryptString()` throws if the OS keychain changes (machine migration, keychain reset, Linux libsecret removed). The `decryptProvider()` helper must:

- Wrap decryption in try/catch
- On failure: set `apiKey: ""` and log a warning — never crash
- The user sees an empty key in the settings panel and re-enters it

### Empty `apiKey` edge case

Some providers may have an empty `apiKey` (local models, proxy setups with auth in headers). The `encryptProvider()` helper must:

- Skip encryption if `apiKey` is empty string or undefined
- Omit both `apiKey` and `encryptedApiKey` fields in that case

### Fallback behavior

If `safeStorage.isEncryptionAvailable()` returns `false` (rare, some Linux without libsecret):

- Store `apiKey` in plaintext as before
- Log a warning
- On next startup, if encryption becomes available, migrate to encrypted form

### Existing precedent

The messaging feature (`src/main/features/messaging/messaging-service.ts`) already uses this exact pattern for Telegram bot tokens:

- Encrypt with `safeStorage.encryptString()`, store as base64 in `encryptedToken`
- Decrypt with `safeStorage.decryptString(Buffer.from(base64, "base64"))`
- Delete plaintext field before persisting
