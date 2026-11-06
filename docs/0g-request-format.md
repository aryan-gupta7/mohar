# The 0G request, frozen (0G-1 T8)

What the device sends, and the only answers it accepts. Source of truth in code: `firmware/mohar/src/zerog.cpp`. Evaluated in
`signer/tools/0g-eval.ts` (19 of 19 scenarios at 5 of 5).

**Endpoint:** `POST https://router-api.0g.ai/v1/chat/completions` (mainnet; the testnet router does not negotiate TLS 1.2, which the ESP8266 needs).
**Header:** `Authorization: Bearer <key>`. The key sits in the git-ignored `secrets.h`; flash is readable, so it must be a low-limit key.

```json
{
  "model": "qwen3.8-flash",
  "temperature": 0,
  "max_tokens": 16,
  "enable_thinking": false,
  "messages": [
    {"role": "system", "content": "<the owner's policy: see SYSTEM in zerog.cpp>"},
    {"role": "user", "content": "Electricity meter, last 60 s. Sanctioned load 5000 W, meter limit 13800 W. Valid pulses N, average A W, peak P W, longest gap between pulses G s. Pulse-line glitches X, stuck-low events Y. [Previous window averaged B W.]"}
  ]
}
```

`enable_thinking: false` matters: with reasoning on, calls took 6 to 20 s and about 1 in 10 timed out; with it off, about 2 s.

**Accepted answer:** `choices[0].message.content` equal to exactly `RUN` or `INSPECT` (spaces and full stops trimmed), **and** a request ID present at
`x_0g_trace.request_id`. **Everything else is "no decision" and the device goes to `SAFE_STOP`:** any other text, a missing request ID,
HTTP 400/401/402/404/429/5xx, a connection failure, or no answer within 20 s. Model text never reaches a pin. There is no confidence value.

| Check | Result |
|---|---|
| `verify_tee: true` | Accepted, but `qwen3.8-flash` returns no TEE attestation (it is not a TEE-attested model; `laya` and `vela-2.0-9b` are). We make **no** "TEE-verified" claim |
| 401 bad key, 404 unknown model, 400 empty or non-JSON body | Clean JSON errors (tested); the device treats them as no decision |
| 402, 429, 503 | Not triggerable on demand; same handling (any non-200) |
| Request ID | `x_0g_trace.request_id` equals the UUID in the `X-Request-Id` response header (95 of 95) |
