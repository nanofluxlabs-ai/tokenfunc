When a program consumes the model's output (extracting fields, classifying, generating config), have the model return strict JSON instead of prose you would have to parse.

| Approach    | Form                                              | Result                                               |
| ----------- | ------------------------------------------------- | ---------------------------------------------------- |
| JSON mode   | `"response_format": {"type": "json_object"}`      | Output is valid JSON; the prompt describes the shape |
| JSON Schema | `"response_format": {"type": "json_schema", ...}` | Output strictly matches your schema                  |

:::warning
`response_format` works with GPT, Gemini and OpenAI-compatible models that support it (such as DeepSeek's JSON mode). **It has no effect when calling Claude through Chat Completions**; for Claude, use the tool-calling approach at the end of this page.
:::

## JSON mode

In JSON mode the prompt must mention "JSON" and list the fields you want:

:::tabs
@tab Python

```python
import json
from openai import OpenAI

client = OpenAI(base_url="{{baseUrl}}/v1", api_key="{{apiKey}}")

resp = client.chat.completions.create(
    model="{{model}}",
    messages=[
        {"role": "system", "content": "Extract details from the user's message and return JSON with the fields name, phone and city. Use null for missing fields."},
        {"role": "user", "content": "I'm Alex Chen, phone 555-0123, flying to Berlin next week"},
    ],
    response_format={"type": "json_object"},
)
data = json.loads(resp.choices[0].message.content)
print(data)
```

@tab cURL

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{apiKey}}" \
  -d '{
    "model": "{{model}}",
    "messages": [
      {"role": "system", "content": "Extract details from the user message and return JSON with the fields name, phone and city. Use null for missing fields."},
      {"role": "user", "content": "I am Alex Chen, phone 555-0123, flying to Berlin next week"}
    ],
    "response_format": {"type": "json_object"}
  }'
```
:::

## JSON Schema

Give the full schema and the output matches it exactly, with no extra or missing fields:

```python
resp = client.chat.completions.create(
    model="{{model}}",
    messages=[{"role": "user", "content": "What is the sentiment of this review? \"Shipping was slow, but the quality is great\""}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "sentiment",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "sentiment": {"type": "string", "enum": ["positive", "negative", "mixed"]},
                    "reasons": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["sentiment", "reasons"],
                "additionalProperties": False,
            },
        },
    },
)
print(resp.choices[0].message.content)
```

The Python OpenAI SDK also accepts a Pydantic class directly:

```python
from pydantic import BaseModel

class Sentiment(BaseModel):
    sentiment: str
    reasons: list[str]

resp = client.beta.chat.completions.parse(
    model="{{model}}",
    messages=[{"role": "user", "content": "What is the sentiment of this review? \"Shipping was slow, but the quality is great\""}],
    response_format=Sentiment,
)
print(resp.choices[0].message.parsed)
```

## What to do with Claude

Claude can produce structured results through [tool calling](/docs/examples-tools): define a tool whose parameters are the JSON you want, force it with `tool_choice`, and read the tool arguments.

```python
resp = client.chat.completions.create(
    model="{{model:claude}}",
    messages=[{"role": "user", "content": "What is the sentiment of this review? \"Shipping was slow, but the quality is great\""}],
    tools=[{
        "type": "function",
        "function": {
            "name": "record_sentiment",
            "description": "Record the sentiment analysis of a review",
            "parameters": {
                "type": "object",
                "properties": {
                    "sentiment": {"type": "string", "enum": ["positive", "negative", "mixed"]},
                    "reasons": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["sentiment", "reasons"],
            },
        },
    }],
    tool_choice={"type": "function", "function": {"name": "record_sentiment"}},
)
print(resp.choices[0].message.tool_calls[0].function.arguments)
```

## Tips

- Even in JSON mode, handle parse failures in code, for example output cut off because `max_tokens` was too low.
- Explaining each field in `description` or the prompt works far better than field names alone.
