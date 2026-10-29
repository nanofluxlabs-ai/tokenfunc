Each tool speaks one or two API protocols, and the protocol decides how to write the base URL and which models work. Find your tool below, then open its guide.

## At a glance

| Tool                                                         | Kind               | Protocol                      | Base URL                         | Recommended models                                  |
| ------------------------------------------------------------ | ------------------ | ----------------------------- | -------------------------------- | --------------------------------------------------- |
| [Claude Code](/docs/tools-claude-code)                       | CLI                | Anthropic                     | `{{baseUrl}}`                    | Claude family                                       |
| [Codex](/docs/tools-codex)                                   | CLI                | OpenAI Responses              | `{{baseUrl}}/v1`                 | GPT family                                          |
| [Cursor](/docs/tools-cursor)                                 | Editor             | OpenAI-compatible             | `{{baseUrl}}/v1`                 | GPT and others; names must not start with `claude-` |
| [Cline](/docs/tools-cline)                                   | VS Code extension  | OpenAI-compatible / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | Models with tool calling                            |
| [Trae](/docs/tools-trae)                                     | Editor             | OpenAI-compatible / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | Any                                                 |
| [WorkBuddy](/docs/tools-workbuddy)                           | Desktop app        | OpenAI-compatible             | `{{baseUrl}}/v1`                 | Any                                                 |
| [DeepSeek Harness](/docs/tools-deepseek-harness)             | CLI / web UI       | OpenAI-compatible / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | DeepSeek and others                                 |
| [Hermes Agent](/docs/tools-hermes)                           | CLI                | OpenAI-compatible             | `{{baseUrl}}/v1`                 | Models with 64K+ context                            |
| [Pi](/docs/tools-pi)                                         | CLI                | OpenAI-compatible             | `{{baseUrl}}/v1`                 | Any                                                 |
| [OpenClaw](/docs/tools-openclaw)                             | Personal assistant | OpenAI-compatible / Anthropic | `{{baseUrl}}/v1` / `{{baseUrl}}` | Any                                                 |
| [Cherry Studio, Chatbox and more](/docs/tools-openai-client) | Chat clients       | OpenAI-compatible             | See the guide                    | Any                                                 |

Where a cell has two values separated by "/", they match the two protocols: OpenAI-compatible takes `/v1`, Anthropic does not.

## Which protocol to choose

- **Claude models**: use the Anthropic protocol when the tool offers it; reasoning, caching and similar features work best there.
- **GPT, DeepSeek, Gemini, GLM and others**: use the OpenAI-compatible protocol.
- **Codex only speaks the Responses protocol**, so the model must support the Responses endpoint. GPT models are the safe choice.

## What coding tools need from a model

Claude Code, Codex, Cline, Cursor's agent mode and similar tools call tools constantly (reading files, running commands). The model must support tool calling, and longer context helps. Weaker models can loop or break the output format, so prefer each vendor's flagship models.

## Before you start

Every guide needs:

1. The base URL of this site: `{{baseUrl}}`
2. A key: create one on [API Keys](/keys), ideally one per tool.
3. A model name: copy it from the [Model Square](/pricing); it must match exactly.

Once signed in, choose a key and a model under "Sample settings" at the top of the page. The configuration in every guide is then filled in for you, ready to copy.
