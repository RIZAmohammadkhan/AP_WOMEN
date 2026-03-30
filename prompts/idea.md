# Meri Behen

**One-line concept:** A WhatsApp-first multilingual AI assistant that helps women-led Self-Help Groups in Andhra Pradesh find demand, buyers, schemes, and clear next steps to sell more confidently.

## Problem Statement

Women in Self-Help Groups across Andhra Pradesh already make real products with market value, including pickles, handicrafts, textiles, and household goods. The constraint is not production alone; it is access. Most groups sell only within their local network because they lack timely visibility into where demand exists, which buyers are relevant, how to compare raw material prices, and how to navigate digital selling channels.

The current ecosystem is fragmented and hard to use. Market data is scattered, government support information is difficult to interpret, onboarding to procurement or e-commerce platforms requires confidence with forms and documents, and most digital tools are not designed around local language or low digital literacy. As a result, capable SHGs remain stuck in low-reach, low-information selling loops.

## Target Users

- **Primary users:** Women-led Self-Help Groups in Andhra Pradesh that produce and sell food products, handicrafts, textiles, and other small-batch goods.
- **Secondary stakeholders:** Institutional buyers, government procurement portals, e-commerce enablement programs, and scheme providers that want to connect with SHGs more effectively.

## Product Vision

Meri Behen is a WhatsApp-native assistant that behaves like a knowledgeable local business guide. A user can send a text message, voice note, or product image in her own language and receive a simple reply that tells her what to do next. The product is built around WhatsApp because it is already familiar, requires no new app install, and reduces the friction that usually blocks adoption for first-time digital sellers.

## Core User Jobs

- Find which products or categories have demand in a specific region or season.
- Identify likely buyers, procurement opportunities, or selling channels for her product.
- Check current raw material prices and nearby sourcing options.
- Discover government schemes, loans, subsidies, or training programs she may qualify for.
- Understand the steps required to register and sell on online or procurement platforms.
- Turn a product photo or rough description into a usable listing draft with title, tags, and suggested pricing.

## User Experience Flow

1. The user sends a WhatsApp message as text, voice, or product image.
2. If the message is audio, the system transcribes it into text.
3. The system detects the user's language and interprets the request intent.
4. The assistant asks a short follow-up question if the request is too vague to answer well.
5. The assistant calls only the minimum relevant tools needed to answer the request.
6. Tool outputs are combined into a short, actionable response.
7. The final answer is returned on WhatsApp as translated text and a voice note in the same language.

## MVP Scope

- WhatsApp-based text and voice interaction.
- Input and output support for Telugu, Hindi, and Urdu.
- Intent handling for market demand, buyer discovery, material pricing, schemes, onboarding guidance, and product listing support.
- Follow-up clarification when the user request is incomplete or ambiguous.
- Maximum of 2-3 tool calls per user turn to keep responses fast and focused.
- Final response delivered as both text and voice.
- Product photo support for catalog generation where helpful.

## Out of Scope for MVP

- Direct payment collection or wallet handling inside the assistant.
- Logistics booking, shipment tracking, or delivery management.
- Fully autonomous account creation on third-party platforms.
- End-to-end buyer negotiation conducted by the system without the user.
- Inventory management, bookkeeping, or ERP-style operations.
- Full CRM workflows for ongoing buyer relationship management.

## Why This Will Work

This approach meets users in a channel they already trust and use regularly. It lowers the barrier created by new apps, English-first interfaces, and complex workflows. Instead of expecting SHG members to learn multiple systems, the assistant translates fragmented market and platform information into a single conversational interface with concrete next steps. The combination of local language, voice support, and action-oriented answers makes the product more likely to be adopted and reused.

## Success Signals

- Users receive useful answers without needing human operator intervention for routine requests.
- Buyer matches or channel suggestions are surfaced for relevant product queries.
- Scheme discovery leads to identifiable next actions, such as checking eligibility or preparing documents.
- Users complete at least part of an onboarding flow after receiving platform guidance.
- Repeat WhatsApp usage increases over time, showing ongoing utility rather than one-time curiosity.

## Key Risks and Dependencies

- Reliable market, buyer, pricing, and scheme data sources must be available and reasonably current.
- Speech-to-text and text-to-speech quality must work well across Telugu, Hindi, and Urdu accents and real-world WhatsApp audio.
- Tool outputs must stay simple enough for low-literacy users while still being specific and actionable.
- Platform requirements and government scheme details may change, so freshness and source tracking matter.
- The assistant must avoid overloading users with too many options in a single message.
