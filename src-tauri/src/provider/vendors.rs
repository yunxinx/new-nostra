//! Vendor catalog: one profile per vendor, consumed by preset prefill
//! (`list_provider_presets`) and by the resolve auto layer, so vendor knowledge
//! exists once. Model metadata is a snapshot of the vendors' published catalogs;
//! compat specialisations are the fields the reference implementation's vendor
//! detection rewrites relative to the family defaults.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use serde_json::{json, Value};

use crate::provider::compat_defaults::{ANTHROPIC_MESSAGES, OPENAI_COMPLETIONS, OPENAI_RESPONSES};
use crate::types::{
    InputModality, ModelCost, ModelCostTier, ModelEntry, PeakPricing, Protocol, TimeWindow, Weekday,
};

/// One vendor: stable preset identity, form prefill values, detection knowledge
/// and the compat specialisation both consumers share.
// Reason: the preset projection feeds these fields into the preset DTO; revoke
// with its first production reader.
#[allow(dead_code)]
#[derive(Debug)]
pub struct VendorProfile {
    /// Stable slug; the preset DTO carries it.
    pub preset_id: &'static str,
    pub name: &'static str,
    /// Prefill base URL; endpoint paths are derived per protocol.
    pub base_url: &'static str,
    /// Prefill for the provider's default protocol.
    pub api: Protocol,
    /// Detection input: base URL host suffixes of the vendor.
    pub host_suffixes: &'static [&'static str],
    /// Detection fallback: prefixes of the vendor's model request names.
    pub model_prefixes: &'static [&'static str],
    /// Compat specialisation relative to the family defaults, keyed by family.
    pub compat: BTreeMap<Protocol, Value>,
    /// Prefill provider headers (attribution and similar).
    pub headers: BTreeMap<String, String>,
    /// Prefill model catalog.
    pub models: Vec<ModelEntry>,
}

static VENDORS: LazyLock<Vec<VendorProfile>> = LazyLock::new(build_vendors);

/// The vendor catalog, in detection priority order.
pub fn vendors() -> &'static [VendorProfile] {
    &VENDORS
}

/// Detects the vendor of a request target. A host suffix match wins over any
/// model-name prefix, so a provider on a vendor's own host stays that vendor
/// even when a model name looks like another vendor's; `None` means the pure
/// family defaults apply.
pub fn detect_vendor(base_url: &str, model_id: &str) -> Option<&'static VendorProfile> {
    if let Some(host) = crate::provider::config::url_host(base_url) {
        let by_host = vendors().iter().find(|vendor| {
            vendor.host_suffixes.iter().any(|suffix| host_suffix_matches(host, suffix))
        });
        if by_host.is_some() {
            return by_host;
        }
    }
    vendors()
        .iter()
        .find(|vendor| vendor.model_prefixes.iter().any(|prefix| model_id.starts_with(prefix)))
}

/// Dot-boundary host-suffix match after dropping ports from both sides: a `:443`
/// on the URL must not defeat a bare-domain suffix, and the localhost suffixes
/// name the default port of an OpenAI-compatible local server rather than a
/// strict port requirement.
fn host_suffix_matches(host: &str, suffix: &str) -> bool {
    let host = crate::provider::config::strip_port(host).to_ascii_lowercase();
    let suffix = crate::provider::config::strip_port(suffix).to_ascii_lowercase();
    host == suffix || host.ends_with(&format!(".{suffix}"))
}

fn family_compat(family: &str, fragment: Value) -> (Protocol, Value) {
    (Protocol::from(family), fragment)
}

/// Rates-only cost: no usage tiers, no peak windows.
fn cost(input: f64, output: f64, cache_read: f64, cache_write: f64) -> ModelCost {
    ModelCost { input, output, cache_read, cache_write, tiers: None, peak: None }
}

fn tier(
    input_tokens_above: u64,
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
) -> ModelCostTier {
    ModelCostTier { input_tokens_above, input, output, cache_read, cache_write }
}

fn peak(
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
    windows: Vec<TimeWindow>,
) -> PeakPricing {
    PeakPricing { input, output, cache_read, cache_write, windows }
}

fn weekday_window(days: &[Weekday], start: &str, end: &str) -> TimeWindow {
    TimeWindow { days: days.to_vec(), start: start.into(), end: end.into() }
}

fn build_vendors() -> Vec<VendorProfile> {
    vec![openai(), anthropic(), deepseek(), openrouter(), moonshot(), ollama()]
}

fn openai() -> VendorProfile {
    VendorProfile {
        preset_id: "openai",
        name: "OpenAI",
        base_url: "https://api.openai.com/v1",
        api: Protocol::from(OPENAI_RESPONSES),
        host_suffixes: &["api.openai.com"],
        model_prefixes: &["gpt-", "o1-", "o3-", "o4-"],
        // First-party requests follow the family defaults for both families.
        compat: BTreeMap::new(),
        headers: BTreeMap::new(),
        models: vec![
            ModelEntry {
                id: "gpt-6-astra".into(),
                name: Some("GPT-6 Astra".into()),
                apis: vec![Protocol::from(OPENAI_RESPONSES)],
                aliases: vec!["astra".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(ModelCost {
                    input: 10.0,
                    output: 50.0,
                    cache_read: 1.0,
                    cache_write: 12.5,
                    tiers: Some(vec![tier(272_000, 20.0, 75.0, 2.0, 25.0)]),
                    peak: None,
                }),
                context_window: Some(1_050_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "gpt-5.6-sol".into(),
                name: Some("GPT-5.6 Sol".into()),
                apis: vec![Protocol::from(OPENAI_RESPONSES)],
                aliases: vec!["sol".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(ModelCost {
                    input: 4.0,
                    output: 20.0,
                    cache_read: 0.4,
                    cache_write: 5.0,
                    tiers: Some(vec![tier(272_000, 8.0, 30.0, 0.8, 10.0)]),
                    peak: None,
                }),
                context_window: Some(1_050_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "gpt-5.6-terra".into(),
                name: Some("GPT-5.6 Terra".into()),
                apis: vec![Protocol::from(OPENAI_RESPONSES)],
                aliases: vec!["terra".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(ModelCost {
                    input: 2.0,
                    output: 12.0,
                    cache_read: 0.2,
                    cache_write: 2.5,
                    tiers: Some(vec![tier(272_000, 4.0, 18.0, 0.4, 5.0)]),
                    peak: None,
                }),
                context_window: Some(1_050_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "gpt-5.6-luna".into(),
                name: Some("GPT-5.6 Luna".into()),
                apis: vec![Protocol::from(OPENAI_RESPONSES)],
                aliases: vec!["luna".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(ModelCost {
                    input: 0.2,
                    output: 1.2,
                    cache_read: 0.02,
                    cache_write: 0.25,
                    tiers: Some(vec![tier(272_000, 0.4, 1.8, 0.04, 0.5)]),
                    peak: None,
                }),
                context_window: Some(1_050_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
        ],
    }
}

fn anthropic() -> VendorProfile {
    VendorProfile {
        preset_id: "anthropic",
        name: "Anthropic",
        base_url: "https://api.anthropic.com",
        api: Protocol::from(ANTHROPIC_MESSAGES),
        host_suffixes: &["api.anthropic.com"],
        model_prefixes: &["claude-"],
        compat: BTreeMap::from([family_compat(
            ANTHROPIC_MESSAGES,
            // Tool references exist from Claude 4.5 on; every catalog row is newer.
            json!({ "supportsToolReferences": true }),
        )]),
        headers: BTreeMap::new(),
        models: vec![
            ModelEntry {
                id: "claude-fable-5-1".into(),
                name: Some("Claude Fable 5.1".into()),
                apis: vec![Protocol::from(ANTHROPIC_MESSAGES)],
                aliases: vec!["fable".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(10.0, 50.0, 0.25, 12.5)),
                context_window: Some(1_000_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "claude-opus-5".into(),
                name: Some("Claude Opus 5".into()),
                apis: vec![Protocol::from(ANTHROPIC_MESSAGES)],
                aliases: vec!["opus".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(5.0, 25.0, 0.5, 6.25)),
                context_window: Some(1_000_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "claude-sonnet-5".into(),
                name: Some("Claude Sonnet 5".into()),
                apis: vec![Protocol::from(ANTHROPIC_MESSAGES)],
                aliases: vec!["sonnet".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(3.0, 15.0, 0.3, 3.75)),
                context_window: Some(1_000_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "claude-haiku-4-5".into(),
                name: Some("Claude Haiku 4.5".into()),
                apis: vec![Protocol::from(ANTHROPIC_MESSAGES)],
                aliases: vec!["haiku".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(1.0, 5.0, 0.1, 1.25)),
                context_window: Some(200_000),
                max_tokens: Some(64_000),
                sampling_params: None,
                headers: None,
                // Haiku rejects client-side `tool_reference` blocks, so it opts
                // out of the vendor specialisation above.
                compat: Some(BTreeMap::from([family_compat(
                    ANTHROPIC_MESSAGES,
                    json!({ "supportsToolReferences": false }),
                )])),
            },
        ],
    }
}

fn deepseek() -> VendorProfile {
    VendorProfile {
        preset_id: "deepseek",
        name: "DeepSeek",
        base_url: "https://api.deepseek.com",
        api: Protocol::from(OPENAI_COMPLETIONS),
        host_suffixes: &["deepseek.com"],
        model_prefixes: &["deepseek-"],
        compat: BTreeMap::from([family_compat(
            OPENAI_COMPLETIONS,
            json!({
                "supportsStore": false,
                "supportsDeveloperRole": false,
                "maxTokensField": "max_tokens",
                "requiresReasoningContentOnAssistantMessages": true,
                "thinkingFormat": "deepseek"
            }),
        )]),
        headers: BTreeMap::new(),
        models: vec![
            ModelEntry {
                id: "deepseek-flash".into(),
                name: Some("DeepSeek Flash".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["flash".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text],
                cost: Some(ModelCost {
                    input: 0.15,
                    output: 0.6,
                    cache_read: 0.003,
                    cache_write: 0.0,
                    tiers: None,
                    peak: Some(peak(0.3, 1.2, 0.006, 0.0, deepseek_peak_windows())),
                }),
                context_window: Some(1_000_000),
                max_tokens: Some(384_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "deepseek-v4-pro".into(),
                name: Some("DeepSeek V4 Pro".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["pro".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text],
                cost: Some(ModelCost {
                    input: 0.66,
                    output: 1.98,
                    cache_read: 0.022,
                    cache_write: 0.0,
                    tiers: None,
                    peak: Some(peak(1.32, 3.96, 0.044, 0.0, deepseek_peak_windows())),
                }),
                context_window: Some(1_000_000),
                max_tokens: Some(384_000),
                sampling_params: None,
                headers: None,
                compat: None,
            },
        ],
    }
}

/// DeepSeek charges its peak rates on weekdays 01:00-04:00 and 06:00-10:00 UTC;
/// the base rates are the off-peak half.
fn deepseek_peak_windows() -> Vec<TimeWindow> {
    let weekdays = [Weekday::Mon, Weekday::Tue, Weekday::Wed, Weekday::Thu, Weekday::Fri];
    vec![weekday_window(&weekdays, "01:00", "04:00"), weekday_window(&weekdays, "06:00", "10:00")]
}

fn openrouter() -> VendorProfile {
    VendorProfile {
        preset_id: "openrouter",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        api: Protocol::from(OPENAI_COMPLETIONS),
        host_suffixes: &["openrouter.ai"],
        // Request names are `vendor/model`, so name-prefix detection does not apply.
        model_prefixes: &[],
        compat: BTreeMap::from([family_compat(
            OPENAI_COMPLETIONS,
            json!({
                "supportsDeveloperRole": false,
                "thinkingFormat": "openrouter",
                "sessionAffinityFormat": "openrouter"
            }),
        )]),
        headers: BTreeMap::from([("X-OpenRouter-Title".to_owned(), "Nostra".to_owned())]),
        models: vec![
            ModelEntry {
                id: "anthropic/claude-sonnet-5".into(),
                name: Some("Claude Sonnet 5".into()),
                apis: vec![Protocol::from(ANTHROPIC_MESSAGES), Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["sonnet-5".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(3.0, 15.0, 0.3, 3.75)),
                context_window: Some(1_000_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                // Upstream models named `anthropic/...` keep the developer role and
                // take Anthropic-style cache markers.
                compat: Some(BTreeMap::from([family_compat(
                    OPENAI_COMPLETIONS,
                    json!({ "supportsDeveloperRole": true, "cacheControlFormat": "anthropic" }),
                )])),
            },
            ModelEntry {
                id: "openai/gpt-6-astra".into(),
                name: Some("GPT-6 Astra".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                // No `astra` alias: the direct OpenAI entry already claims it.
                aliases: vec![],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(ModelCost {
                    input: 10.0,
                    output: 50.0,
                    cache_read: 1.0,
                    cache_write: 12.5,
                    tiers: Some(vec![tier(272_000, 20.0, 75.0, 2.0, 25.0)]),
                    peak: None,
                }),
                context_window: Some(1_050_000),
                max_tokens: Some(128_000),
                sampling_params: None,
                headers: None,
                // OpenRouter keeps the developer role for `openai/` and
                // `anthropic/` rows; the vendor fragment disables it elsewhere.
                compat: Some(BTreeMap::from([family_compat(
                    OPENAI_COMPLETIONS,
                    json!({ "supportsDeveloperRole": true }),
                )])),
            },
            ModelEntry {
                id: "google/gemini-3.8-flash".into(),
                name: Some("Gemini 3.8 Flash".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["gemini-flash".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(0.75, 3.75, 0.075, 0.041667)),
                context_window: Some(1_048_576),
                max_tokens: Some(65_536),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "moonshotai/kimi-k3".into(),
                name: Some("Kimi K3".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["kimi-k3".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(3.0, 15.0, 0.3, 0.0)),
                context_window: Some(1_048_576),
                // The upstream request name serves the same model as the direct
                // Moonshot entry, whose published output cap is 131072.
                max_tokens: Some(131_072),
                sampling_params: None,
                headers: None,
                compat: None,
            },
        ],
    }
}

fn moonshot() -> VendorProfile {
    VendorProfile {
        preset_id: "moonshot",
        name: "Moonshot AI",
        base_url: "https://api.moonshot.cn/v1",
        api: Protocol::from(OPENAI_COMPLETIONS),
        host_suffixes: &["api.moonshot.cn", "api.moonshot.ai"],
        model_prefixes: &["kimi-"],
        compat: BTreeMap::from([family_compat(
            OPENAI_COMPLETIONS,
            json!({
                "supportsStore": false,
                "supportsDeveloperRole": false,
                "supportsReasoningEffort": false,
                "maxTokensField": "max_tokens",
                "supportsStrictMode": false
            }),
        )]),
        headers: BTreeMap::new(),
        models: vec![
            ModelEntry {
                id: "kimi-k3".into(),
                name: Some("Kimi K3".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["k3".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(3.0, 15.0, 0.3, 0.0)),
                context_window: Some(1_048_576),
                max_tokens: Some(131_072),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "kimi-k2.7-code".into(),
                name: Some("Kimi K2.7 Code".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["kimi-code".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(0.95, 4.0, 0.19, 0.0)),
                context_window: Some(262_144),
                max_tokens: Some(262_144),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "kimi-k2.6".into(),
                name: Some("Kimi K2.6".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec!["k2.6".into()],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(0.95, 4.0, 0.16, 0.0)),
                context_window: Some(262_144),
                max_tokens: Some(262_144),
                sampling_params: None,
                headers: None,
                compat: None,
            },
        ],
    }
}

fn ollama() -> VendorProfile {
    VendorProfile {
        preset_id: "ollama",
        name: "Ollama",
        base_url: "http://localhost:11434/v1",
        api: Protocol::from(OPENAI_COMPLETIONS),
        host_suffixes: &["localhost:11434", "127.0.0.1:11434"],
        // Local servers answer to whatever tag the user pulled.
        model_prefixes: &[],
        compat: BTreeMap::from([family_compat(
            OPENAI_COMPLETIONS,
            // Local OpenAI-compatible servers reject the developer role and
            // reasoning_effort, and their examples use `max_tokens`.
            json!({
                "supportsDeveloperRole": false,
                "supportsReasoningEffort": false,
                "maxTokensField": "max_tokens"
            }),
        )]),
        // A local endpoint needs no credentials, so no headers are prefilled.
        headers: BTreeMap::new(),
        models: vec![
            ModelEntry {
                id: "gpt-oss:20b".into(),
                name: Some("gpt-oss 20B".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec![],
                base_url: None,
                reasoning: true,
                thinking_level_map: None,
                input: vec![InputModality::Text],
                cost: Some(cost(0.0, 0.0, 0.0, 0.0)),
                context_window: Some(131_072),
                max_tokens: Some(32_768),
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "gemma4:12b".into(),
                name: Some("Gemma 4 12B".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec![],
                base_url: None,
                // The library page does not state whether the tag reasons.
                reasoning: false,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(0.0, 0.0, 0.0, 0.0)),
                context_window: Some(262_144),
                // The library page lists no output cap.
                max_tokens: None,
                sampling_params: None,
                headers: None,
                compat: None,
            },
            ModelEntry {
                id: "qwen3.5".into(),
                name: Some("Qwen3.5".into()),
                apis: vec![Protocol::from(OPENAI_COMPLETIONS)],
                aliases: vec![],
                base_url: None,
                // The library page does not state whether the tag reasons.
                reasoning: false,
                thinking_level_map: None,
                input: vec![InputModality::Text, InputModality::Image],
                cost: Some(cost(0.0, 0.0, 0.0, 0.0)),
                context_window: Some(262_144),
                // The library page lists no output cap.
                max_tokens: None,
                sampling_params: None,
                headers: None,
                compat: None,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::config::validate_compat_bucket;
    use std::collections::BTreeSet;

    fn vendor(preset_id: &str) -> &'static VendorProfile {
        vendors()
            .iter()
            .find(|vendor| vendor.preset_id == preset_id)
            .unwrap_or_else(|| panic!("unknown vendor {preset_id}"))
    }

    fn completions_fragment(preset_id: &str) -> &'static Value {
        vendor(preset_id)
            .compat
            .get(&Protocol::from(OPENAI_COMPLETIONS))
            .unwrap_or_else(|| panic!("{preset_id} has no openai-completions fragment"))
    }

    #[test]
    fn catalog_holds_the_documented_vendors_and_model_counts() {
        let expected = [
            ("openai", "OpenAI", 4),
            ("anthropic", "Anthropic", 4),
            ("deepseek", "DeepSeek", 2),
            ("openrouter", "OpenRouter", 4),
            ("moonshot", "Moonshot AI", 3),
            ("ollama", "Ollama", 3),
        ];
        assert_eq!(vendors().len(), expected.len());
        for (profile, (preset_id, name, models)) in vendors().iter().zip(expected) {
            assert_eq!(profile.preset_id, preset_id);
            assert_eq!(profile.name, name);
            assert_eq!(profile.models.len(), models, "model count of {preset_id}");
            assert!(compat_defaults_knows(&profile.api), "{preset_id} default protocol");
            assert!(!profile.host_suffixes.is_empty(), "{preset_id} has no host suffixes");
            assert_eq!(
                profile.model_prefixes.is_empty(),
                matches!(preset_id, "openrouter" | "ollama"),
                "{preset_id} request names are not prefixed"
            );
            let mut ids = BTreeSet::new();
            for model in &profile.models {
                assert!(ids.insert(model.id.as_str()), "duplicate id {}", model.id);
                assert!(!model.id.trim().is_empty());
                assert!(!model.apis.is_empty(), "{} has no protocols", model.id);
                assert!(
                    model.input.contains(&InputModality::Text),
                    "{} does not accept text",
                    model.id
                );
                assert!(model.aliases.iter().all(|alias| alias != &model.id));
                assert!(model.cost.is_some(), "{} has no cost", model.id);
                assert!(model.context_window.is_some(), "{} has no context window", model.id);
            }
        }
    }

    fn compat_defaults_knows(protocol: &Protocol) -> bool {
        crate::provider::compat_defaults::is_known_family(protocol)
    }

    #[test]
    fn catalog_lands_on_the_documented_endpoints_and_default_protocols() {
        let expected = [
            ("openai", "https://api.openai.com/v1", OPENAI_RESPONSES),
            ("anthropic", "https://api.anthropic.com", ANTHROPIC_MESSAGES),
            ("deepseek", "https://api.deepseek.com", OPENAI_COMPLETIONS),
            ("openrouter", "https://openrouter.ai/api/v1", OPENAI_COMPLETIONS),
            ("moonshot", "https://api.moonshot.cn/v1", OPENAI_COMPLETIONS),
            ("ollama", "http://localhost:11434/v1", OPENAI_COMPLETIONS),
        ];
        for (preset_id, base_url, api) in expected {
            let profile = vendor(preset_id);
            assert_eq!(profile.base_url, base_url);
            assert_eq!(profile.api, Protocol::from(api));
        }
    }

    #[test]
    fn catalog_aliases_are_distinct_across_vendors() {
        // Aliases of enabled providers may not collide at save time, so the
        // presets must be usable together.
        let mut seen = BTreeMap::new();
        for profile in vendors() {
            for model in &profile.models {
                for alias in &model.aliases {
                    if let Some(owner) = seen.insert(alias.as_str(), profile.preset_id) {
                        panic!("alias {alias} claimed by {owner} and {}", profile.preset_id);
                    }
                }
            }
        }
    }

    #[test]
    fn vendor_compat_fragments_match_their_family_structs() {
        for profile in vendors() {
            let fragments = profile
                .compat
                .iter()
                .chain(profile.models.iter().filter_map(|model| model.compat.as_ref()).flatten());
            for (protocol, fragment) in fragments {
                validate_compat_bucket(protocol, fragment)
                    .unwrap_or_else(|err| panic!("{}: {}", profile.preset_id, err.message));
            }
        }
    }

    #[test]
    fn deepseek_specialisation_matches_the_detected_profile() {
        let fragment = completions_fragment("deepseek");
        assert_eq!(fragment["supportsStore"], json!(false));
        assert_eq!(fragment["supportsDeveloperRole"], json!(false));
        assert_eq!(fragment["maxTokensField"], json!("max_tokens"));
        assert_eq!(fragment["requiresReasoningContentOnAssistantMessages"], json!(true));
        assert_eq!(fragment["thinkingFormat"], json!("deepseek"));
    }

    #[test]
    fn anthropic_specialisation_enables_tool_references() {
        let fragment = vendor("anthropic").compat.get(&Protocol::from(ANTHROPIC_MESSAGES)).unwrap();
        assert_eq!(fragment, &json!({ "supportsToolReferences": true }));
    }

    #[test]
    fn anthropic_catalog_rows_opt_out_of_tool_references_only_for_haiku() {
        // Haiku rejects client-side `tool_reference` blocks; every other catalog
        // row takes the vendor specialisation as it stands.
        let profile = vendor("anthropic");
        let haiku = profile.models.iter().find(|model| model.id == "claude-haiku-4-5").unwrap();
        assert_eq!(
            haiku.compat.as_ref().unwrap().get(&Protocol::from(ANTHROPIC_MESSAGES)),
            Some(&json!({ "supportsToolReferences": false }))
        );
        for model in &profile.models {
            if model.id != "claude-haiku-4-5" {
                assert!(model.compat.is_none(), "{} overrides the vendor fragment", model.id);
            }
        }
    }

    #[test]
    fn openrouter_specialisation_and_attribution_header() {
        let fragment = completions_fragment("openrouter");
        assert_eq!(fragment["supportsDeveloperRole"], json!(false));
        assert_eq!(fragment["thinkingFormat"], json!("openrouter"));
        assert_eq!(fragment["sessionAffinityFormat"], json!("openrouter"));

        let profile = vendor("openrouter");
        assert_eq!(profile.headers.get("X-OpenRouter-Title").map(String::as_str), Some("Nostra"));
        // Attribution URL is a product decision, so it stays unprefilled.
        assert!(!profile.headers.contains_key("HTTP-Referer"));
    }

    #[test]
    fn openrouter_catalog_rows_follow_the_developer_role_rule() {
        // Only `anthropic/` and `openai/` rows keep the developer role, and only
        // the `anthropic/` one takes Anthropic-style cache markers; the vendor
        // fragment disables the role for every other upstream row.
        let profile = vendor("openrouter");
        let fragment = |id: &str| -> Option<Value> {
            profile
                .models
                .iter()
                .find(|model| model.id == id)
                .and_then(|model| model.compat.as_ref())
                .and_then(|buckets| buckets.get(&Protocol::from(OPENAI_COMPLETIONS)))
                .cloned()
        };
        assert_eq!(
            fragment("anthropic/claude-sonnet-5"),
            Some(json!({ "supportsDeveloperRole": true, "cacheControlFormat": "anthropic" }))
        );
        assert_eq!(fragment("openai/gpt-6-astra"), Some(json!({ "supportsDeveloperRole": true })));
        assert_eq!(fragment("google/gemini-3.8-flash"), None);
        assert_eq!(fragment("moonshotai/kimi-k3"), None);
    }

    #[test]
    fn moonshot_specialisation_disables_store_developer_role_and_reasoning_effort() {
        let fragment = completions_fragment("moonshot");
        assert_eq!(fragment["supportsStore"], json!(false));
        assert_eq!(fragment["supportsDeveloperRole"], json!(false));
        assert_eq!(fragment["supportsReasoningEffort"], json!(false));
        assert_eq!(fragment["maxTokensField"], json!("max_tokens"));
        assert_eq!(fragment["supportsStrictMode"], json!(false));
    }

    #[test]
    fn ollama_specialisation_targets_local_openai_compatible_servers() {
        let fragment = completions_fragment("ollama");
        assert_eq!(fragment["supportsDeveloperRole"], json!(false));
        assert_eq!(fragment["supportsReasoningEffort"], json!(false));
        assert_eq!(fragment["maxTokensField"], json!("max_tokens"));

        let profile = vendor("ollama");
        assert!(profile.headers.is_empty());
        // The catalog never carries credentials: a provider's key is its own field.
        for other in vendors() {
            assert!(
                !other.headers.keys().any(|name| name.eq_ignore_ascii_case("authorization")),
                "{} prefills an authorization header",
                other.preset_id
            );
        }
    }

    #[test]
    fn deepseek_catalog_prices_peak_hours_against_off_peak_rates() {
        let profile = vendor("deepseek");
        let flash = profile.models.iter().find(|model| model.id == "deepseek-flash").unwrap();
        let cost = flash.cost.as_ref().unwrap();
        assert_eq!(
            (cost.input, cost.output, cost.cache_read, cost.cache_write),
            (0.15, 0.6, 0.003, 0.0)
        );
        assert_eq!(flash.context_window, Some(1_000_000));
        assert_eq!(flash.max_tokens, Some(384_000));

        let peak = cost.peak.as_ref().unwrap();
        assert_eq!(
            (peak.input, peak.output, peak.cache_read, peak.cache_write),
            (0.3, 1.2, 0.006, 0.0)
        );
        let weekdays = vec![Weekday::Mon, Weekday::Tue, Weekday::Wed, Weekday::Thu, Weekday::Fri];
        assert_eq!(peak.windows.len(), 2);
        assert_eq!(peak.windows[0].days, weekdays);
        assert_eq!(peak.windows[0].start, "01:00");
        assert_eq!(peak.windows[0].end, "04:00");
        assert_eq!(peak.windows[1].start, "06:00");
        assert_eq!(peak.windows[1].end, "10:00");

        let pro = profile.models.iter().find(|model| model.id == "deepseek-v4-pro").unwrap();
        let pro_cost = pro.cost.as_ref().unwrap();
        assert_eq!(
            (pro_cost.input, pro_cost.output, pro_cost.cache_read, pro_cost.cache_write),
            (0.66, 1.98, 0.022, 0.0)
        );
        let pro_peak = pro_cost.peak.as_ref().unwrap();
        assert_eq!(
            (pro_peak.input, pro_peak.output, pro_peak.cache_read, pro_peak.cache_write),
            (1.32, 3.96, 0.044, 0.0)
        );
    }

    #[test]
    fn catalog_rows_keep_the_reviewed_prices_and_limits() {
        // These values depart from the raw upstream catalogs (announced rate
        // changes, a disagreeing max-token field across two rows of one model),
        // so re-syncing the catalog must not silently revert them.
        let model = |preset_id: &str, id: &str| {
            let profile = vendor(preset_id);
            let model = profile.models.iter().find(|model| model.id == id).unwrap();
            (model.cost.clone().unwrap(), model.context_window, model.max_tokens)
        };

        let (sonnet, _, _) = model("anthropic", "claude-sonnet-5");
        assert_eq!(
            (sonnet.input, sonnet.output, sonnet.cache_read, sonnet.cache_write),
            (3.0, 15.0, 0.3, 3.75)
        );
        let (sonnet_via_openrouter, _, _) = model("openrouter", "anthropic/claude-sonnet-5");
        assert_eq!(
            (
                sonnet_via_openrouter.input,
                sonnet_via_openrouter.output,
                sonnet_via_openrouter.cache_read,
                sonnet_via_openrouter.cache_write
            ),
            (3.0, 15.0, 0.3, 3.75)
        );

        for id in ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] {
            let (cost, context_window, max_tokens) = model("openai", id);
            assert_eq!(context_window, Some(1_050_000), "{id}");
            assert_eq!(max_tokens, Some(128_000), "{id}");
            let tier = cost.tiers.as_ref().unwrap();
            assert_eq!(tier[0].input_tokens_above, 272_000, "{id}");
        }

        assert_eq!(model("moonshot", "kimi-k3").2, Some(131_072));
        assert_eq!(model("openrouter", "moonshotai/kimi-k3").2, Some(131_072));
    }

    #[test]
    fn catalog_rows_without_published_numbers_stay_unset() {
        // Ollama's library pages do not list an output cap for these tags.
        let ollama = vendor("ollama");
        for model in &ollama.models {
            if model.id == "gpt-oss:20b" {
                assert_eq!(model.max_tokens, Some(32_768));
            } else {
                assert_eq!(model.max_tokens, None, "{}", model.id);
            }
            assert_eq!(model.cost.as_ref().unwrap(), &cost(0.0, 0.0, 0.0, 0.0));
        }
    }

    #[test]
    fn detection_prefers_host_suffixes_over_model_prefixes() {
        let detected =
            |url: &str, model: &str| detect_vendor(url, model).map(|profile| profile.preset_id);
        assert_eq!(detected("https://api.deepseek.com/v1", "deepseek-flash"), Some("deepseek"));
        assert_eq!(detected("https://openrouter.ai/api/v1", "vendor/model"), Some("openrouter"));
        assert_eq!(detected("https://api.moonshot.ai/v1", "kimi-k3"), Some("moonshot"));
        // A host match wins even when the model name belongs to another vendor.
        assert_eq!(detected("https://api.openai.com/v1", "claude-opus-5"), Some("openai"));
        // Without a host match the model prefix decides.
        assert_eq!(detected("https://gateway.example/v1", "claude-opus-5"), Some("anthropic"));
        assert_eq!(detected("https://gateway.example/v1", "gpt-5.6-sol"), Some("openai"));
        assert_eq!(detected("https://gateway.example/v1", "o3-mini"), Some("openai"));
        // Suffix matching respects dot boundaries.
        assert_eq!(detected("https://api.deepseek.com.evil.example/v1", "other"), None);
        assert_eq!(detected("https://notdeepseek.example/v1", "other"), None);
        assert_eq!(detected("not a base url", "unknown-model"), None);
    }

    #[test]
    fn detection_drops_ports_on_both_sides() {
        let detected =
            |url: &str, model: &str| detect_vendor(url, model).map(|profile| profile.preset_id);
        assert_eq!(detected("http://localhost:11434/v1", "llama4"), Some("ollama"));
        assert_eq!(detected("http://127.0.0.1:11434/v1", "llama4"), Some("ollama"));
        // Other local ports get the same profile: these compat fixes apply to
        // OpenAI-compatible local servers, not to one specific port.
        assert_eq!(detected("http://localhost:8000/v1", "llama4"), Some("ollama"));
        assert_eq!(detected("https://api.deepseek.com:443/v1", "deepseek-flash"), Some("deepseek"));
    }
}
