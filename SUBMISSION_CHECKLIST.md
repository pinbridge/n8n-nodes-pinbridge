# n8n Verified Community Node — Submission Checklist

Use this before submitting through the [n8n Creator Portal](https://www.n8n.io/creator-hub/).

---

## Automated (handled in this repo)

- [x] `package.json` has `n8n-community-node-package` keyword
- [x] `n8n-workflow` declared in `peerDependencies` only (removed from `dependencies`)
- [x] `n8n-workflow` added to `devDependencies` for local TypeScript compilation
- [x] `homepage`, `author`, `repository`, `bugs`, `engines` fields populated
- [x] `n8n.nodes` and `n8n.credentials` entries point to compiled `dist/` paths
- [x] `n8nNodesApiVersion: 1` set in `n8n` section
- [x] `files: ["dist"]` — only compiled output is published
- [x] `prepublishOnly` script runs build automatically before `npm publish`
- [x] `documentationUrl` in credentials points to the GitHub README
- [x] MIT license present
- [x] README covers: what it does, installation, credentials, operations, examples, limitations, support
- [x] GitHub Actions CI runs install + lint + test + build on Node 18 and 20
- [x] SVG icon present at `nodes/PinBridge/pinbridge.svg` and copied to `dist/nodes/PinBridge/`
- [x] Credential type declares `icon = 'file:../nodes/PinBridge/pinbridge.svg'`, which resolves from both source and `dist/`
- [x] `inputs`/`outputs` use `NodeConnectionType.Main` (not deprecated string literals)
- [x] Resource dropdown labels are singular and alphabetically ordered
- [x] All output items include `pairedItem` metadata for item linking
- [x] `getBinaryDataBuffer()` called with property name string (not `IBinaryData` object)
- [x] All list/single-call operations wrapped with `continueOnFail()` try/catch
- [x] Node codex file (`PinBridge.node.json`) present with `node`, `nodeVersion`, `codexVersion`, `categories`
- [x] `usableAsTool: true` so the node works as an AI Agent tool
- [x] No `.d.ts` files in the package (the scanner's credential filename rule rejects them)
- [x] `npm test` runs the node against a mocked API (CI and publish workflows)
- [x] Source and `npm pack` output pass `@n8n/scan-community-package` rules (only the themed-icon warning remains)

---

## Manual steps required before submission

### 1. Publish to npm
```bash
cd n8n-nodes-pinbridge
npm run build        # sanity check
npm publish --access public
```
Confirm the package is live at: `https://www.npmjs.com/package/n8n-nodes-pinbridge`

### 2. Verify the npm page looks correct
- Package description is accurate
- README renders correctly
- No stray files in the published tarball (`npm pack --dry-run` to check)

### 3. Test in a real n8n instance
Install in a self-hosted n8n instance and verify:
- [ ] Credential type `PinBridge API` appears
- [ ] Credential test (GET /v1/pinterest/accounts) succeeds with a valid key
- [ ] PinBridge node loads and all resources/operations are selectable
- [ ] Board dropdown (`loadOptions`) populates correctly
- [ ] At least one end-to-end workflow runs (e.g. Publish a pin)

### 4. Confirm GitHub repository is public
`https://github.com/pinbridge/n8n-nodes-pinbridge` must be publicly accessible.

### 5. Submit via n8n Creator Portal
URL: https://www.n8n.io/creator-hub/

Required information you will need:
- npm package name: `n8n-nodes-pinbridge`
- GitHub repo URL: `https://github.com/pinbridge/n8n-nodes-pinbridge`
- Short description of what the node does
- Contact email: contact@pinbridge.io

### 6. Review n8n verified node criteria
Before submitting, review the current requirements at:
https://docs.n8n.io/integrations/community-nodes/verified-nodes/

Key criteria typically checked during manual review:
- No security issues in code
- Credentials use n8n's standard auth mechanism (this node uses `authenticate` + `test` — correct)
- No obfuscated or minified source
- Node icon is an SVG
- No hardcoded secrets

---

## Notes

- The package has no runtime dependencies: multipart uploads use Node's native `FormData` and `Blob`.
- The `src/transport/PinBridgeClient.ts` layer is intentionally decoupled from n8n internals. This is good practice.
- `AGENTS.md` is not published to npm (not in `files`). No action needed.
