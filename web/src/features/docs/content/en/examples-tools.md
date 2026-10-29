Tool calling (function calling) lets the model "call" functions you write: you describe the functions, the model decides when to call one and with which arguments, you run it locally and send the result back, and the model answers with it. Weather lookups, database queries and placing orders all work this way.

Tool calls written in the Chat Completions format are converted for Claude, Gemini and other models automatically; the code stays the same.

## The full loop

```text
1. You: send the question + tool definitions
2. Model: returns tool_calls (which function, which arguments)
3. You: run the function locally and send the result as a role=tool message
4. Model: answers using the result
```

:::tabs
@tab Python

```python
import json
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

def get_weather(city: str) -> dict:
    # In a real project, call a weather API here
    return {"city": city, "weather": "sunny", "temperature": 23}

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "City name, e.g. Paris"}},
            "required": ["city"],
        },
    },
}]

messages = [{"role": "user", "content": "What's the weather in Paris today? Good for a run?"}]

# Step 1: the model decides whether to call a tool
resp = client.chat.completions.create(model="{{model}}", messages=messages, tools=tools)
msg = resp.choices[0].message
messages.append(msg)  # keep the model's reply (with tool_calls) in the history

# Step 2: run every call the model asked for and send the results back
for call in msg.tool_calls or []:
    args = json.loads(call.function.arguments)
    result = get_weather(**args)
    messages.append({
        "role": "tool",
        "tool_call_id": call.id,
        "content": json.dumps(result),
    })

# Step 3: the model answers with the tool results
final = client.chat.completions.create(model="{{model}}", messages=messages, tools=tools)
print(final.choices[0].message.content)
```

@tab Node.js

```javascript
import OpenAI from 'openai'

const client = new OpenAI({ baseURL: '{{baseUrl}}/v1', apiKey: '{{apiKey}}' })

function getWeather({ city }) {
  // In a real project, call a weather API here
  return { city, weather: 'sunny', temperature: 23 }
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name, e.g. Paris' },
        },
        required: ['city'],
      },
    },
  },
]

const messages = [
  {
    role: 'user',
    content: "What's the weather in Paris today? Good for a run?",
  },
]

const resp = await client.chat.completions.create({
  model: '{{model}}',
  messages,
  tools,
})
const msg = resp.choices[0].message
messages.push(msg)

for (const call of msg.tool_calls ?? []) {
  const result = getWeather(JSON.parse(call.function.arguments))
  messages.push({
    role: 'tool',
    tool_call_id: call.id,
    content: JSON.stringify(result),
  })
}

const final = await client.chat.completions.create({
  model: '{{model}}',
  messages,
  tools,
})
console.log(final.choices[0].message.content)
```
:::

The model may return several `tool_calls` at once (two cities, say), so run them all and attach the matching `tool_call_id` to each result.

## Controlling tool use

`tool_choice` decides how the model uses tools:

| Value                                                       | Meaning                           |
| ----------------------------------------------------------- | --------------------------------- |
| `"auto"` (default)                                          | The model decides whether to call |
| `"none"`                                                    | No tool calls, answer directly    |
| `"required"`                                                | Must call at least one tool       |
| `{"type": "function", "function": {"name": "get_weather"}}` | Must call that tool               |

Pass `"parallel_tool_calls": false` to ask for one tool call at a time.

## Writing good tool definitions

- Say in `description` when the tool should be used; that is what the model goes by.
- Constrain arguments with `enum` and mark mandatory ones in `required` so the model guesses less.
- Keep tool results short and return only what the model needs; long results eat input tokens.
- Never run dangerous actions (deleting data, moving money) straight from model arguments. Validate first.

## In the Anthropic format

On the [Messages](/docs/api-messages) endpoint, define tools in Anthropic's format (`name`, `description`, `input_schema`). The model returns `tool_use` blocks and you answer with `tool_result` blocks; the loop is the same.
