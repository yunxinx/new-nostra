//! Family-level compat defaults for the three protocol families.
//!
//! Each default is a fully populated typed fragment: every field of the family
//! struct is set (to `None` where the family has no value), so adding a field to
//! a compat struct fails compilation here and forces a default decision. The
//! four-layer merge in `config.rs` serializes the fragment and overlays the
//! vendor, provider and model fragments on top.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::types::{
    AnthropicMessagesCompat, MaxTokensField, OpenaiCompletionsCompat, OpenaiResponsesCompat,
    Protocol, SessionAffinityFormat, ThinkingFormat,
};

pub(crate) const OPENAI_COMPLETIONS: &str = "openai-completions";
pub(crate) const OPENAI_RESPONSES: &str = "openai-responses";
pub(crate) const ANTHROPIC_MESSAGES: &str = "anthropic-messages";

/// `openai-completions` defaults: the baseline every vendor specialisation and
/// override is applied to.
pub fn openai_completions_defaults() -> OpenaiCompletionsCompat {
    OpenaiCompletionsCompat {
        supports_store: Some(true),
        supports_developer_role: Some(true),
        supports_reasoning_effort: Some(true),
        supports_usage_in_streaming: Some(true),
        supports_finish_reason: Some(true),
        max_tokens_field: Some(MaxTokensField::MaxCompletionTokens),
        requires_tool_result_name: Some(false),
        requires_assistant_after_tool_result: Some(false),
        requires_thinking_as_text: Some(false),
        requires_reasoning_content_on_assistant_messages: Some(false),
        thinking_format: Some(ThinkingFormat::Openai),
        chat_template_kwargs: Some(BTreeMap::new()),
        chat_template_args: Some(BTreeMap::new()),
        thinking_token_budget_field: None,
        supports_thinking_token_budget: Some(false),
        zai_tool_stream: Some(false),
        cache_control_format: None,
        open_router_routing: Some(serde_json::Map::new()),
        vercel_gateway_routing: Some(serde_json::Map::new()),
        supports_open_ai_grammar_tools: Some(false),
        supports_strict_mode: Some(true),
        send_session_affinity_headers: Some(false),
        deferred_tools_mode: None,
        session_affinity_format: Some(SessionAffinityFormat::Openai),
        supports_long_cache_retention: Some(true),
        vllm_priority: None,
    }
}

/// `openai-responses` defaults; strict mode is off here, unlike the
/// completions family.
pub fn openai_responses_defaults() -> OpenaiResponsesCompat {
    OpenaiResponsesCompat {
        supports_developer_role: Some(true),
        session_affinity_format: Some(SessionAffinityFormat::Openai),
        supports_long_cache_retention: Some(true),
        supports_strict_mode: Some(false),
        supports_open_ai_grammar_tools: Some(false),
        supports_additional_tools: Some(false),
        supports_tool_search: Some(false),
        supports_explicit_prompt_cache_mode: Some(false),
        supports_max_output_tokens: Some(true),
    }
}

/// `anthropic-messages` defaults. `allowedFallbackModels` stays unset: without
/// it the request carries no fallback models and no server-side fallback beta
/// header.
pub fn anthropic_messages_defaults() -> AnthropicMessagesCompat {
    AnthropicMessagesCompat {
        supports_eager_tool_input_streaming: Some(true),
        supports_long_cache_retention: Some(true),
        send_session_affinity_headers: Some(false),
        supports_cache_control_on_tools: Some(true),
        supports_temperature: Some(true),
        force_adaptive_thinking: Some(false),
        allow_empty_signature: Some(false),
        supports_strict_tools: Some(false),
        supports_mid_convo_effort: Some(false),
        supports_tool_references: Some(false),
        allowed_fallback_models: None,
    }
}

/// Serialized family defaults for the merge, or `None` when the protocol name
/// has no family (validation rejects such names instead of defaulting them).
pub fn family_defaults(protocol: &Protocol) -> Option<serde_json::Value> {
    match protocol.as_str() {
        OPENAI_COMPLETIONS => Some(defaults_value(openai_completions_defaults())),
        OPENAI_RESPONSES => Some(defaults_value(openai_responses_defaults())),
        ANTHROPIC_MESSAGES => Some(defaults_value(anthropic_messages_defaults())),
        _ => None,
    }
}

/// Whether a protocol name has a compat family. The protocol set is open at the
/// storage layer; this gate is where unknown names are rejected.
pub fn is_known_family(protocol: &Protocol) -> bool {
    matches!(protocol.as_str(), OPENAI_COMPLETIONS | OPENAI_RESPONSES | ANTHROPIC_MESSAGES)
}

// Reason: these defaults serialize to booleans, strings and string-keyed maps,
// so `to_value` has no failure path for this shape. Revoke if a compat field
// gains a field type with a fallible `Serialize` implementation.
#[allow(clippy::expect_used)]
fn defaults_value<T: Serialize>(defaults: T) -> serde_json::Value {
    serde_json::to_value(defaults)
        .expect("compat family defaults only hold booleans, strings and maps")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn protocol(name: &str) -> Protocol {
        Protocol::from(name)
    }

    #[test]
    fn openai_completions_defaults_serialize_the_documented_table() {
        let value = family_defaults(&protocol(OPENAI_COMPLETIONS)).unwrap();
        assert_eq!(
            value,
            json!({
                "supportsStore": true,
                "supportsDeveloperRole": true,
                "supportsReasoningEffort": true,
                "supportsUsageInStreaming": true,
                "supportsFinishReason": true,
                "maxTokensField": "max_completion_tokens",
                "requiresToolResultName": false,
                "requiresAssistantAfterToolResult": false,
                "requiresThinkingAsText": false,
                "requiresReasoningContentOnAssistantMessages": false,
                "thinkingFormat": "openai",
                "chatTemplateKwargs": {},
                "chatTemplateArgs": {},
                "supportsThinkingTokenBudget": false,
                "zaiToolStream": false,
                "openRouterRouting": {},
                "vercelGatewayRouting": {},
                "supportsOpenAIGrammarTools": false,
                "supportsStrictMode": true,
                "sendSessionAffinityHeaders": false,
                "sessionAffinityFormat": "openai",
                "supportsLongCacheRetention": true
            })
        );
    }

    #[test]
    fn openai_responses_defaults_serialize_the_documented_table() {
        let value = family_defaults(&protocol(OPENAI_RESPONSES)).unwrap();
        assert_eq!(
            value,
            json!({
                "supportsDeveloperRole": true,
                "sessionAffinityFormat": "openai",
                "supportsLongCacheRetention": true,
                "supportsStrictMode": false,
                "supportsOpenAIGrammarTools": false,
                "supportsAdditionalTools": false,
                "supportsToolSearch": false,
                "supportsExplicitPromptCacheMode": false,
                "supportsMaxOutputTokens": true
            })
        );
    }

    #[test]
    fn anthropic_messages_defaults_serialize_the_documented_table() {
        let value = family_defaults(&protocol(ANTHROPIC_MESSAGES)).unwrap();
        assert_eq!(
            value,
            json!({
                "supportsEagerToolInputStreaming": true,
                "supportsLongCacheRetention": true,
                "sendSessionAffinityHeaders": false,
                "supportsCacheControlOnTools": true,
                "supportsTemperature": true,
                "forceAdaptiveThinking": false,
                "allowEmptySignature": false,
                "supportsStrictTools": false,
                "supportsMidConvoEffort": false,
                "supportsToolReferences": false
            })
        );
    }

    #[test]
    fn fields_without_a_family_value_stay_absent() {
        let value = family_defaults(&protocol(OPENAI_COMPLETIONS)).unwrap();
        // Unset fields must not become explicit nulls: null cannot override a
        // lower layer, so a present key would misreport provenance.
        for absent in
            ["thinkingTokenBudgetField", "cacheControlFormat", "deferredToolsMode", "vllmPriority"]
        {
            assert!(value.get(absent).is_none(), "unexpected key {absent}");
        }
        let anthropic = family_defaults(&protocol(ANTHROPIC_MESSAGES)).unwrap();
        assert!(anthropic.get("allowedFallbackModels").is_none());
    }

    #[test]
    fn unknown_family_names_have_no_defaults() {
        let gemini = protocol("gemini");
        assert_eq!(family_defaults(&gemini), None);
        assert!(!is_known_family(&gemini));
        assert!(is_known_family(&protocol(OPENAI_COMPLETIONS)));
        assert!(is_known_family(&protocol(OPENAI_RESPONSES)));
        assert!(is_known_family(&protocol(ANTHROPIC_MESSAGES)));
    }
}
