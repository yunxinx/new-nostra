//! Cross-domain persisted types shared by repositories and command DTOs.

use serde::{Deserialize, Serialize};

/// Persisted message role. JSON values are `user` and `assistant`; role is read
/// from the stored payload, never inferred from an entry's type or render branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
}

/// Ordered storage and render unit. `tag` names the variant kebab-case and
/// variant fields serialize camelCase; a provider's own JSON keys stay verbatim.
/// Example: { "type": "text", "text": "hi", "providerMetadata": { "vendor": { "k": 1 } } }
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum ContentBlock {
    Text {
        text: String,
        /// Absent when there is no provider metadata; a null input is treated as absent.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        provider_metadata: Option<serde_json::Value>,
    },
}

/// `entries.payload` shape for `message` entries: a role plus ordered content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePayload {
    pub role: MessageRole,
    pub content: Vec<ContentBlock>,
}

/// A session row as returned by the repository.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub title: String,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A message tree node with its decoded payload.
#[derive(Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub parent_id: Option<String>,
    pub role: MessageRole,
    pub content: Vec<ContentBlock>,
    pub created_at: String,
}

/// Result of the atomic first-send: the new session and its first entry.
#[derive(Debug, Clone)]
pub struct CreatedSession {
    pub session: Session,
    pub entry: Entry,
}

/// One keyset page of sessions plus the cursor for the next page, if any.
#[derive(Debug, Clone)]
pub struct SessionPage {
    pub sessions: Vec<Session>,
    pub next_cursor: Option<SessionCursor>,
}

/// Keyset cursor over `(updated_at, id)` for session list pagination.
#[derive(Debug, Clone)]
pub struct SessionCursor {
    pub updated_at: String,
    pub id: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn message_role_serializes_to_lowercase_contract_values() {
        assert_eq!(serde_json::to_value(MessageRole::User).unwrap(), json!("user"));
        assert_eq!(serde_json::to_value(MessageRole::Assistant).unwrap(), json!("assistant"));
        assert_eq!(
            serde_json::from_value::<MessageRole>(json!("user")).unwrap(),
            MessageRole::User
        );
    }

    #[test]
    fn text_block_encodes_type_tag_and_camel_case_metadata_field() {
        let block = ContentBlock::Text {
            text: "hello".into(),
            provider_metadata: Some(json!({ "vendor": { "opaque": "value" } })),
        };
        let value = serde_json::to_value(&block).unwrap();
        assert_eq!(value["type"], json!("text"));
        assert_eq!(value["text"], json!("hello"));
        // Field-name contract: the frontend mirror relies on `providerMetadata`,
        // not the Rust snake_case identifier.
        assert_eq!(value["providerMetadata"], json!({ "vendor": { "opaque": "value" } }));
        assert!(value.get("provider_metadata").is_none());
    }

    #[test]
    fn text_block_omits_metadata_when_absent() {
        let block = ContentBlock::Text { text: "hi".into(), provider_metadata: None };
        let value = serde_json::to_value(&block).unwrap();
        assert!(value.get("providerMetadata").is_none());
        assert_eq!(value, json!({ "type": "text", "text": "hi" }));
    }

    #[test]
    fn text_block_decodes_fixed_json_with_camel_case_metadata() {
        let input = json!({
            "type": "text",
            "text": "hello",
            "providerMetadata": { "vendor": { "opaque": "value" } }
        });
        let block: ContentBlock = serde_json::from_value(input).unwrap();
        let ContentBlock::Text { text, provider_metadata } = block;
        assert_eq!(text, "hello");
        assert_eq!(provider_metadata, Some(json!({ "vendor": { "opaque": "value" } })));
    }

    #[test]
    fn null_metadata_input_decodes_as_absent() {
        let input = json!({ "type": "text", "text": "hi", "providerMetadata": null });
        let block: ContentBlock = serde_json::from_value(input).unwrap();
        let ContentBlock::Text { provider_metadata, .. } = block;
        assert_eq!(provider_metadata, None);
    }

    #[test]
    fn payload_preserves_content_order() {
        let payload = MessagePayload {
            role: MessageRole::User,
            content: vec![
                ContentBlock::Text { text: "first".into(), provider_metadata: None },
                ContentBlock::Text { text: "second".into(), provider_metadata: None },
            ],
        };
        let value = serde_json::to_value(&payload).unwrap();
        let content = value["content"].as_array().unwrap();
        assert_eq!(content[0]["text"], json!("first"));
        assert_eq!(content[1]["text"], json!("second"));

        let decoded: MessagePayload = serde_json::from_value(value).unwrap();
        assert_eq!(decoded.content.len(), 2);
        let ContentBlock::Text { text, .. } = &decoded.content[0];
        assert_eq!(text, "first");
    }
}
