# VMWare MCP

An [MCP](https://modelcontextprotocol.io/) server that gives AI agents direct access to your VMware vSphere infrastructure. Built on top of [`govc`](https://github.com/vmware/govmomi/tree/main/govc), it exposes **55 typed tools** covering VM lifecycle, snapshots, datastores, networking, and more — with additional tools being added over time.

Tool output is formatted in [TOON](https://github.com/toon-format/spec) for token-efficient LLM consumption, with automatic JSON fallback.

## Available Tools

| Category                  | Tools                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Navigation**            | `about`, `ls`, `find`, `tree`, `events`, `tasks`, `logs`, `logs.ls`                                                                                                                                                          |
| **VM Lifecycle**          | `vm.create`, `vm.clone`, `vm.instantclone`, `vm.destroy`, `vm.register`, `vm.unregister`, `vm.upgrade`                                                                                                                       |
| **VM Configuration**      | `vm.change`, `vm.customize`, `vm.info`, `vm.ip`, `vm.power`, `vm.migrate`, `vm.vnc`, `vm.question`                                                                                                                           |
| **VM Disks**              | `vm.disk.create`, `vm.disk.attach`, `vm.disk.change`, `vm.disk.promote`                                                                                                                                                      |
| **VM Networking**         | `vm.network.add`, `vm.network.change`                                                                                                                                                                                        |
| **VM Options & Policies** | `vm.option.info`, `vm.option.ls`, `vm.policy.ls`, `vm.target.info`, `vm.target.cap.ls`, `vm.guest.tools`                                                                                                                     |
| **Snapshots**             | `snapshot.create`, `snapshot.remove`, `snapshot.export`, `snapshot.tree`                                                                                                                                                     |
| **Datastore**             | `datastore.info`, `datastore.ls`, `datastore.cp`, `datastore.mv`, `datastore.tail`, `datastore.disk.info`, `datastore.cluster.info`, `datastore.cluster.change`, `datastore.maintenance.enter`, `datastore.maintenance.exit` |
| **Session**               | `session.login`, `session.logout`, `session.ls`, `session.rm`                                                                                                                                                                |
| **vSAN**                  | `vsan.info`                                                                                                                                                                                                                  |
| **Task**                  | `task.cancel`                                                                                                                                                                                                                |

Plus **3 meta tools**: `govc_search` (fuzzy search across all commands), `govc_help` (get help for any command), and `govc_run` (escape hatch for any govc command).

First, copy and fill in your credentials:

```bash
cp .env.docker.example .env.docker   # edit with your vCenter URL, username & password
```

## Quick Start — Ephemeral

A fresh container per connection, removed when done.

```bash
# Docker
docker run --rm -i --env-file .env.docker ghcr.io/2501-ai/vmware-mcp

# Claude Code
claude mcp add vmware-mcp -- docker run --rm -i --env-file .env.docker ghcr.io/2501-ai/vmware-mcp
```

## Quick Start — Persistent

The container runs as a long-lived service. Clients connect via `docker exec`.

```bash
# Docker (once)
docker run -d --name vmware-mcp --restart unless-stopped \
  --env-file .env.docker -e MCP_KEEP_ALIVE=true ghcr.io/2501-ai/vmware-mcp

# Claude Code
claude mcp add vmware-mcp -- docker exec -i vmware-mcp vmware-mcp
```

> Restart Claude Code after running `claude mcp add`. Tools appear as `mcp__vmware-mcp__*`. Check status with `/mcp`.

## Quick Start — From Source

```bash
git clone https://github.com/2501-ai/vmware-mcp.git
cd vmware-mcp
bun install
cp .env.example .env  # fill in your credentials
bun run start          # run the MCP server over stdio
```

To explore and test tools interactively, you can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) instead:

```bash
bun run ui
```

## Configuration

| Variable          | Required | Description                                                     |
| ----------------- | -------- | --------------------------------------------------------------- |
| `GOVC_URL`        | ✅       | vCenter / ESXi SDK URL (e.g. `https://vcenter.example.com/sdk`) |
| `GOVC_USERNAME`   | ✅       | vSphere username                                                |
| `GOVC_PASSWORD`   | ✅       | vSphere password                                                |
| `GOVC_INSECURE`   |          | Set `1` to skip TLS verification                                |
| `GOVC_BIN`        |          | Path to `govc` binary (default: `govc`)                         |
| `GOVC_TIMEOUT_MS` |          | Subprocess timeout in ms (default: `120000`)                    |
| `MCP_KEEP_ALIVE`  |          | Set `true` for persistent container mode (see above)            |

Every variable above is also read under a `VMWARE_` prefix (`VMWARE_GOVC_URL`,
`VMWARE_GOVC_PASSWORD`, ...). A host that spawns this server as a container and
namespaces the env it injects - the 2501 engine does - can pass credentials
through unchanged. The unprefixed name wins when both are set.

## SSH Tunnel

If vCenter is only reachable through an internal network:

```bash
ssh [-J jump_user@jump_host] -L 8443:vcenter_host:443 user@internal_host -N
```

Then use `GOVC_URL=https://localhost:8443/sdk` with `GOVC_INSECURE=1`.

---

## Development

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0
- [govc](https://github.com/vmware/govmomi/tree/main/govc) in `PATH`

### Scripts

| Script                    | Description                      |
| ------------------------- | -------------------------------- |
| `bun run start`           | Run MCP server (stdio)           |
| `bun run dev`             | Run with `--watch`               |
| `bun run ui`              | Launch MCP Inspector (web UI)    |
| `bun run check`           | Biome + tsc (CI gate)            |
| `bun run docker:build`    | Build Docker image (native arch) |
| `bun run docker:build:ci` | Build Docker image (linux/amd64) |

### Adding a Command

1. Add entry to `GOVC_COMMAND_INDEX` in `src/commands.ts`.
2. Add `GovcToolDef` to `GOVC_TOOL_DEFS` with typed flags.
3. Generator wires it automatically.
4. `bun run check`.

## License

MIT
