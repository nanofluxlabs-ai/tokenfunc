Set up a tool but it will not connect? Pick the tool, paste the address you entered in it and click "Run check". Each step tells you where it fails and how to fix it.

:::self-check
:::

## What each step checks

| Step                  | What it checks                                                                    | Common problems                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Address format     | Whether the address matches what the tool expects; no request is sent             | One `/v1` too many or too few, the full endpoint path instead of the base address, an address that is not this site                          |
| 2. Connection and key | Lists models with your key                                                        | Network or proxy blocked; key invalid, expired or out of its own quota                                                                       |
| 3. Model access       | Whether the chosen model is available to the key                                  | Misspelled model name; the key's group lacks the model; the key limits its models                                                            |
| 4. Test request       | Sends one real request that generates almost no tokens, using the tool's protocol | Not enough balance; no available channel for the model; the model does not support the protocol (such as the Responses endpoint Codex needs) |

## Notes

- The check uses your key named `default` (or your most recently created key). If the tool uses a different key, a passing result only shows this site and the model are fine; check that key's status and quota on [API Keys](/keys).
- Step 4 makes one real call that costs a negligible amount of balance; it appears in Usage Logs in the console.
- Step 1 only checks how the address is written. The later steps call this site's standard address, so they still check the key and model even if the address is wrong.
- If everything passes but the tool still fails, match the tool's error message against [FAQ and troubleshooting](/docs/faq), or recheck the settings in the tool's guide.
