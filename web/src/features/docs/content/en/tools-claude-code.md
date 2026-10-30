Claude Code is Anthropic's official command-line coding agent and speaks the Anthropic protocol. It only needs two things: the address of this site and your key.

- Protocol: Anthropic Messages
- Base URL: `{{baseUrl}}` (**without** `/v1`; Claude Code appends `/v1/messages` itself)
- Models: the Claude family, for example `{{model}}`

## Option 1: one-click setup script (recommended)

Run the command below in a terminal, paste your key and pick a default model when asked. The script:

- Checks the key against the model list endpoint (free of charge)
- Installs Claude Code the official way if it is missing
- Merges the base URL, key and model into `~/.claude/settings.json`, keeping your other settings and backing up the original file

:::tabs
@tab macOS / Linux

```bash
curl -fsSL {{baseUrl}}/install/claude-code.sh | bash
```

@tab Windows

```powershell
# Run in PowerShell (not Command Prompt)
irm {{baseUrl}}/install/claude-code.ps1 | iex
```
:::

:::tip
You type the key while the script runs, so it never ends up in your shell history. To read the script first, open it directly: [macOS / Linux]({{baseUrl}}/install/claude-code.sh), [Windows]({{baseUrl}}/install/claude-code.ps1).
:::

When it finishes, jump to the "Start and verify" step below.

## Option 2: one-click import with CC Switch

[CC Switch](https://github.com/farion1231/cc-switch) is a small desktop app that manages Claude Code and Codex settings. With it installed, the button below writes the address, key and model for you; no files to edit.

:::cc-switch{app="claude"}
:::

![The CC Switch import confirmation showing this site's address and the model](todo:tools/claude-code-ccswitch.png)

Enable the imported provider in CC Switch, then skip to the verify step below.

## Option 3: manual setup

:::steps
### Install Claude Code

:::tabs
@tab macOS / Linux

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

@tab Windows

```powershell
irm https://claude.ai/install.ps1 | iex
```

@tab npm

```bash
# Requires Node.js 22 or later
npm install -g @anthropic-ai/claude-code
```
:::

On Windows, install [Git for Windows](https://git-scm.com/download/win) first; Claude Code uses Bash to run commands.

### Write the settings file

Open Claude Code's global settings file and add the content below. Create the file if it does not exist; if it already has content, merge these three entries into the existing `env` block.

:::tabs
@tab macOS / Linux

```json title="~/.claude/settings.json"
{
  "env": {
    "ANTHROPIC_BASE_URL": "{{baseUrl}}",
    "ANTHROPIC_AUTH_TOKEN": "{{apiKey}}",
    "ANTHROPIC_MODEL": "{{model}}"
  }
}
```

@tab Windows

```json title="%USERPROFILE%.claude\\settings.json"
{
  "env": {
    "ANTHROPIC_BASE_URL": "{{baseUrl}}",
    "ANTHROPIC_AUTH_TOKEN": "{{apiKey}}",
    "ANTHROPIC_MODEL": "{{model}}"
  }
}
```
:::

:::note
You can also set environment variables for the current terminal only. The settings file takes precedence; if both are set, the file wins.

:::tabs
@tab macOS / Linux

```bash
export ANTHROPIC_BASE_URL="{{baseUrl}}"
export ANTHROPIC_AUTH_TOKEN="{{apiKey}}"
```

@tab Windows

```powershell
$env:ANTHROPIC_BASE_URL = "{{baseUrl}}"
$env:ANTHROPIC_AUTH_TOKEN = "{{apiKey}}"
```
:::

:::

### Start and verify

Run `claude` in any project folder and type `/status`. If the "Anthropic base URL" line shows `{{baseUrl}}` and the "Auth token" line says it comes from `ANTHROPIC_AUTH_TOKEN`, the settings are in effect. Ask it anything to confirm you get a reply.

![The /status output in Claude Code with the Anthropic base URL and Auth token lines highlighted](todo:tools/claude-code-status.png)
:::

## Choosing and switching models

- The default model comes from `ANTHROPIC_MODEL` in the settings.
- To switch once, start with `claude --model {{model}}`.
- Claude Code runs small background tasks (titles, summaries) on a fast model. Set it with `ANTHROPIC_DEFAULT_HAIKU_MODEL`, for example a Haiku model from this site; the default is used otherwise.

Model names must match the [Model Square](/pricing) exactly.

## Using the VS Code extension

VS Code started from a desktop icon does not see variables you `export` in a terminal. Put the settings in `~/.claude/settings.json` as above; the extension and the CLI share that file.

## Troubleshooting

| Symptom                                                          | Cause and fix                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Still asks you to sign in to Anthropic                           | The settings are only in the project's `.claude/settings.json`. Put them in the global file in your home folder |
| "auth conflict" warning                                          | A claude.ai login is still stored on this machine. Run `/logout` in Claude Code                                 |
| 404                                                              | `ANTHROPIC_BASE_URL` ends with `/v1`. Remove it                                                                 |
| 401                                                              | Wrong key, or the key is out of quota. Check it on [API Keys](/keys)                                            |
| Model not found / no available channel                           | Misspelled model name, or the key's group does not include the model                                            |
| `400 ... context_management` or `Extra inputs are not permitted` | Add `"CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"` to `env`                                                    |
| `400 ... adaptive`                                               | The model does not support adaptive thinking. Add `"CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "1"` to `env`       |

Other errors: see [FAQ and troubleshooting](/docs/faq).
