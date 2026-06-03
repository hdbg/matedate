use anyhow::Context as _;
use image::DynamicImage;
use kameo::actor::{ActorRef, Spawn};
use teloxide::{
    Bot,
    dispatching::{MessageFilterExt as _, UpdateFilterExt as _},
    dptree,
    net::Download,
    payloads::SendPhotoSetters as _,
    prelude::{Dispatcher, Requester},
    types::{InputFile, MediaKind, MediaPhoto, Message, MessageKind, ParseMode, PhotoSize, Update},
};
use tracing::info;

use crate::pipeline::{
    llm_classification::LLMAnalysis,
    orchestrator::{PipelineOrchestrator, PipelineOrchestratorArgs},
};

const CONFIG_FILE: &str = "config.toml";
const CONFIG_ENV_PREIFX: &str = "BOT";
const EMPTY_TRANSCRIPT_MESSAGE: &str = "No message bubbles recognized.";
const ANNOTATED_IMAGE_NAME: &str = "annotated_messages.png";

mod pipeline;

#[derive(serde::Deserialize)]
pub struct Config {
    pub token: String,
    pub llm: pipeline::llm_classification::LLMConfig,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    pipeline::ocr::init().await?;

    let settings = config::Config::builder()
        .add_source(config::File::with_name(CONFIG_FILE))
        .add_source(config::Environment::with_prefix(CONFIG_ENV_PREIFX))
        .build()?;

    let settings: Config = settings.try_deserialize()?;
    let bot = Bot::new(settings.token);
    let pipeline_ref = PipelineOrchestrator::spawn(PipelineOrchestratorArgs { llm: settings.llm });
    pipeline_ref.wait_for_startup().await;
    if let Some(error) = pipeline_ref
        .with_startup_result(|result| result.err().map(|error| format!("{error:?}")))
        .flatten()
    {
        anyhow::bail!("pipeline orchestrator failed to start: {error}");
    }

    info!("boot");

    let schema = Update::filter_message()
        .branch(
            dptree::filter_map(|msg: Message| {
                let media = match &msg.kind {
                    MessageKind::Common(common) => match &common.media_kind {
                        MediaKind::Photo(photo) => Some(photo.clone()),

                        _ => None,
                    },

                    _ => None,
                }?;

                Some((msg, media))
            })
            .endpoint(
                async |bot: Bot,
                       pipeline_ref: ActorRef<PipelineOrchestrator>,
                       (message, media): (Message, MediaPhoto)|
                       -> anyhow::Result<()> {
                    handle_transcript_photo(bot, pipeline_ref, message, media).await
                },
            ),
        )
        .branch(Message::filter_document().endpoint(
            async |bot: Bot, message: Message| -> anyhow::Result<()> {
                let Some(sender) = message.from else {
                    return Ok(());
                };
                bot.send_message(
                    sender.id,
                    "Send images 'compressed', instead of 'as document'",
                )
                .await?;

                Ok(())
            },
        ));
    Dispatcher::builder(bot, schema)
        .dependencies(dptree::deps![pipeline_ref])
        .build()
        .dispatch()
        .await;

    unreachable!("Bot should never stop")
}

async fn handle_transcript_photo(
    bot: Bot,
    pipeline_ref: ActorRef<PipelineOrchestrator>,
    message: Message,
    media: MediaPhoto,
) -> anyhow::Result<()> {
    info!(chat_id = %message.chat.id, "photo processing started");

    let photo = media
        .photo
        .into_iter()
        .max_by_key(|photo| u64::from(photo.width) * u64::from(photo.height))
        .context("received photo message without photo sizes")?;
    info!(
        photo_width = photo.width,
        photo_height = photo.height,
        "photo download started"
    );
    let image = download_photo(&bot, photo).await?;
    info!(
        image_width = image.width(),
        image_height = image.height(),
        "photo download finished"
    );
    let images = vec![image];

    let output = pipeline_ref
        .ask(pipeline::orchestrator::Analyze { images })
        .await
        .map_err(|_| anyhow::anyhow!("pipeline orchestrator request failed"))?;
    info!(
        chat_id = %message.chat.id,
        image_bytes = output.annotated_image.len(),
        "sending analysis response"
    );
    bot.send_photo(
        message.chat.id,
        InputFile::memory(output.annotated_image).file_name(ANNOTATED_IMAGE_NAME),
    )
    .caption(format_analysis(&output.analysis))
    .parse_mode(ParseMode::Html)
    .await?;
    info!(chat_id = %message.chat.id, "photo processing finished");

    Ok(())
}

async fn download_photo(bot: &Bot, photo: PhotoSize) -> anyhow::Result<DynamicImage> {
    let mut buf = Vec::new();
    let file = bot.get_file(photo.file.id).await?;
    bot.download_file(&file.path, &mut buf).await?;

    image::load_from_memory(&buf).context("failed to decode Telegram photo")
}

fn format_analysis(analysis: &LLMAnalysis) -> String {
    if analysis.moves.is_empty() {
        return EMPTY_TRANSCRIPT_MESSAGE.to_owned();
    }

    format!(
        r#"
<b>{}</b>

<i>{}</i>

<b>Elo Affected: {:+}</b>
        "#,
        escape_html(&analysis.title),
        escape_html(&analysis.description),
        analysis.elo
    )
    .trim()
    .to_owned()
}

fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());

    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            _ => escaped.push(character),
        }
    }

    escaped
}
