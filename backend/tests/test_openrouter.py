import os
from openai import OpenAI


API_KEY = "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"

if not API_KEY:
    raise ValueError("Missing OPENROUTER_API_KEY environment variable")


client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=API_KEY,
)

response = client.chat.completions.create(
    model="stealth/space-bunny-alpha",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful AI assistant."
        },
        {
            "role": "user",
            "content": "Explain how transformers work in simple terms."
        }
    ],
    temperature=0.7,
    max_tokens=500,
    extra_headers={
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "OpenRouter Test"
    }
)

print("\n=== Response ===\n")
print(response.choices[0].message.content)

print("\n=== Usage ===")
print(response.usage)