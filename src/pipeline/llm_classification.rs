use std::fmt::Write as _;

use anyhow::bail;
use rig::{
    agent::Agent, client::CompletionClient as _, completion, prelude::TypedPrompt,
    providers::openrouter,
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::pipeline::{AnnotatedMessage, MarkedMessage, MoveKind, Side};

static DEFAULT_MODEL: &str = "openai/gpt-4o";
static PROMPT: &str = include_str!("PROMPT.txt");

#[derive(Deserialize, Debug)]
pub struct LLMConfig {
    pub token: String,
    pub model: Option<String>,
}

pub struct LLMContext {
    model: Agent<openrouter::CompletionModel, ()>,
}

impl LLMContext {
    pub fn new(config: &LLMConfig) -> anyhow::Result<Self> {
        let client = openrouter::Client::new(config.token.clone())?;

        let model = client
            .agent(
                config
                    .model
                    .clone()
                    .unwrap_or_else(|| DEFAULT_MODEL.to_owned()),
            )
            .preamble(PROMPT)
            .build();

        Ok(Self { model })
    }
}

#[derive(Deserialize, Debug, JsonSchema)]
struct LLMAnalysisRaw {
    title: String,
    description: String,
    elo: i32,
    moves_kinds: Vec<MoveKind>,
}

#[derive(Debug, Clone)]
pub struct LLMAnalysis {
    pub title: String,
    pub description: String,
    pub elo: i32,
    pub moves: Vec<MarkedMessage>,
}

#[tracing::instrument(skip_all)]
pub async fn analyze(
    context: &LLMContext,
    conversation: Vec<AnnotatedMessage>,
) -> anyhow::Result<LLMAnalysis> {
    let transcript = format_transcript(&conversation);

    let analysis = context
        .model
        .prompt_typed::<LLMAnalysisRaw>(completion::Message::user(transcript.clone()))
        .await?;

    println!("{:#?}", analysis);
    println!("{}", transcript);

    if analysis.moves_kinds.len() != conversation.len() {
        bail!("LLM returned invalid count of annotated moves");
    }

    let moves = conversation
        .into_iter()
        .zip(analysis.moves_kinds.into_iter())
        .map(|(message, kind)| MarkedMessage {
            annotated: message,
            kind,
        })
        .collect();

    Ok(LLMAnalysis {
        title: analysis.title,
        description: analysis.description,
        elo: analysis.elo,
        moves,
    })
}

fn format_transcript(conversation: &[AnnotatedMessage]) -> String {
    let mut out = String::new();
    for message in conversation {
        let side = match message.reply.side {
            Side::They => "They",
            Side::Us => "Us",
        };
        let _ = writeln!(out, "{}: {}", side, message.transcript.trim());
    }
    out
}
