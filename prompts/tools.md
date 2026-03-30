# Meri Behen Tool Registry

This document defines the conceptual tool contracts for the WhatsApp assistant. The goal is to keep tool behavior consistent enough that each tool can later be turned into a real function or service interface without changing its purpose.

## Tooling Principles

- Call tools only when they are needed to answer the user's request.
- Limit business-tool usage to a maximum of 2-3 tools per user turn.
- Ask a short clarification question before calling tools when the request is too vague.
- Translate every final user-facing response into the language the user used.
- Return simple, action-oriented results instead of long, technical explanations.

## Shared Output Expectation for Business Tools

Every business-answer tool should return:

- A concise result summary.
- Three to five actionable items, matches, or findings when available.
- A source or source type for each important result.
- A freshness or confidence hint when the data may change over time.

## `market_intelligence`

- **Purpose:** Identify where demand exists for a product category and what market signals matter right now.
- **When to Call:** Use when the user asks where to sell, what is trending, which region has demand, or what is likely to sell this month or season.
- **Required Inputs:** Product category, target geography or current location.
- **Optional Inputs:** Season, language, price band, production scale, preferred channel.
- **Returns:** Demand summary, top geographies or channels, seasonal signals, and 3-5 practical recommendations for where to focus.
- **Primary Data Sources:** E-commerce trend sources, open market datasets, procurement trend datasets, and government or public commerce data.
- **Failure / Fallback Behavior:** If live demand data is weak or unavailable, return broader category guidance and clearly say that granular regional signals were not found.
- **Notes / Guardrails:** Do not present guesses as verified demand. Prefer recent and local signals over broad national trends when possible.

## `buyer_matcher`

- **Purpose:** Surface likely buyers or buyer channels for a specific product and supply capability.
- **When to Call:** Use when the user asks who may buy her product, where to find bulk buyers, or how to reach procurement opportunities.
- **Required Inputs:** Product category, approximate quantity or supply capacity, target geography.
- **Optional Inputs:** Price range, packaging format, certifications, preferred buyer type.
- **Returns:** A ranked list of 3-5 buyer leads or buyer channels with short rationale, contact or registration pathway when available, and next-step guidance.
- **Primary Data Sources:** Government procurement listings, marketplace programs for small sellers, business directories, and verified buyer databases.
- **Failure / Fallback Behavior:** If direct buyer matches are limited, return channel-level guidance such as relevant procurement portals, marketplace programs, or local distributor categories.
- **Notes / Guardrails:** Prioritize buyers that are relevant to the user's product, geography, and supply scale. Do not imply a guaranteed sale or partnership.

## `material_tracker`

- **Purpose:** Help the user understand raw material prices and sourcing options in or near her region.
- **When to Call:** Use when the user asks about current prices, price changes, or where to buy a material more affordably.
- **Required Inputs:** Material name, target geography.
- **Optional Inputs:** Quantity needed, quality grade, time window, preferred supplier type.
- **Returns:** Current price snapshot, nearby sourcing options when available, price movement hints, and 3-5 actions such as compare now, buy early, or check alternative suppliers.
- **Primary Data Sources:** Market price feeds, mandi or commodity references, local supplier directories, and public pricing datasets.
- **Failure / Fallback Behavior:** If real-time local pricing is unavailable, return the nearest available reference price and clearly mark it as an estimate or proxy.
- **Notes / Guardrails:** Always label freshness when price data may be volatile. Avoid precise claims without a traceable source type.

## `schemes_finder`

- **Purpose:** Match the user with relevant government schemes, subsidies, loans, or training opportunities.
- **When to Call:** Use when the user asks what support she qualifies for, what loans exist, or whether there is help for packaging, machinery, or business growth.
- **Required Inputs:** User type or SHG profile, geography.
- **Optional Inputs:** Product category, business stage, women-led status, income bracket, documentation already available.
- **Returns:** A shortlist of 3-5 relevant schemes or program types, why they may fit, likely eligibility signals, and next steps such as documents to check or offices to contact.
- **Primary Data Sources:** Central government portals, state government portals, SHG-related development programs, and public scheme directories.
- **Failure / Fallback Behavior:** If exact matching is not possible, return broader scheme categories and say which details are still needed to confirm eligibility.
- **Notes / Guardrails:** Do not state final eligibility unless the source explicitly supports it. Highlight when rules may change or require manual verification.

## `platform_onboarding`

- **Purpose:** Explain how the user can register and list products on relevant selling or procurement platforms.
- **When to Call:** Use when the user asks how to start selling online, register on a portal, or prepare documents for onboarding.
- **Required Inputs:** Target platform or channel type.
- **Optional Inputs:** Product category, current business documents, language, existing seller status.
- **Returns:** Step-by-step guidance, required documents, common blockers, and the next 3-5 actions the user should take.
- **Primary Data Sources:** Official platform help documentation, procurement onboarding pages, and structured onboarding checklists.
- **Failure / Fallback Behavior:** If the exact platform flow cannot be confirmed, return a generic onboarding checklist and clearly flag which platform-specific details need verification.
- **Notes / Guardrails:** Break instructions into small, plain-language steps. Avoid dumping full legal or policy text into the response.

## `product_cataloger`

- **Purpose:** Convert a product image or rough description into a usable listing draft.
- **When to Call:** Use when the user sends a product photo, asks how to describe a product, or needs help preparing a product listing.
- **Required Inputs:** Product image or product description.
- **Optional Inputs:** Brand or SHG name, product category guess, quantity, unit size, target selling channel.
- **Returns:** Suggested product title, short description, category tags, pricing guidance, and any missing details the user should add before publishing.
- **Primary Data Sources:** User-provided product image or description, category heuristics, marketplace listing conventions, and pricing references when available.
- **Failure / Fallback Behavior:** If the image is unclear or insufficient, ask for a clearer photo or basic product facts before generating a draft.
- **Notes / Guardrails:** Do not invent claims such as certifications, ingredients, or material quality. Mark any inferred category or pricing suggestion as provisional.

## `speech_processor`

- **Purpose:** Convert incoming voice to text and final text to voice for WhatsApp delivery.
- **When to Call:** Use when the user sends audio or when the assistant needs to deliver a voice-note response.
- **Required Inputs:** Audio input for transcription or text input for speech generation.
- **Optional Inputs:** Preferred language, speaker style, output format.
- **Returns:** Transcribed text with language hints, or synthesized audio output in the requested language.
- **Primary Data Sources:** Speech-to-text and text-to-speech providers that support Indian languages.
- **Failure / Fallback Behavior:** If transcription confidence is low, ask the user to repeat the message or confirm the interpreted meaning before proceeding.
- **Notes / Guardrails:** This is a support tool, not a business-answer tool. Preserve meaning rather than producing polished but inaccurate transcription.

## `translator`

- **Purpose:** Ensure the final response is delivered in the same language the user used.
- **When to Call:** Use when tool outputs or internal reasoning need to be converted into the user's language for final delivery.
- **Required Inputs:** Source text, target language.
- **Optional Inputs:** Formality preference, script preference, domain hints such as commerce or government language.
- **Returns:** Translated user-facing text that preserves meaning, tone, and action steps.
- **Primary Data Sources:** Translation models or services with strong support for Indian languages.
- **Failure / Fallback Behavior:** If high-confidence translation is not available, return the simplest possible wording and avoid complex phrasing.
- **Notes / Guardrails:** This is a support tool, not a business-answer tool. The translated message must stay faithful to the original guidance and avoid adding meaning.

## Cross-Tool Orchestration Rules

- `speech_processor` and `translator` are support tools. They should not be treated as business-answer tools.
- Business tools should return structured facts and recommendations, not long prose.
- The assistant should synthesize the final answer after tool outputs are collected.
- Buyer, scheme, and platform guidance should be ranked by relevance and actionability for the specific user context.
- If no reliable data is found, the assistant should say so clearly and suggest the next best step.
- If the user request spans too many domains, the assistant should answer the highest-priority part first and ask a follow-up for the rest.
- Tool output should be compressed before final delivery so the WhatsApp response stays easy to understand.
