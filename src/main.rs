use teloxide::{
    Bot,
    dispatching::{MessageFilterExt as _, UpdateFilterExt as _},
    dptree,
    net::Download,
    prelude::{Dispatcher, Requester},
    types::{MediaKind, MediaPhoto, Message, MessageKind, Update},
};
use tracing::info;

#[derive(serde::Deserialize)]
pub struct Config {
    pub token: String,
}

const CONFIG_FILE: &str = "config.toml";
const CONFIG_ENV_PREIFX: &str = "BOT";

mod bubble_analysis;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    let settings = config::Config::builder()
        .add_source(config::File::with_name(CONFIG_FILE))
        .add_source(config::Environment::with_prefix(CONFIG_ENV_PREIFX))
        .build()?;

    let settings: Config = settings.try_deserialize()?;

    let bot = Bot::new(settings.token);

    let schema = Update::filter_message()
        .branch(
            dptree::filter_map(|msg: Message| match msg.kind {
                MessageKind::Common(common) => match common.media_kind {
                    MediaKind::Photo(photo) => Some(photo),

                    _ => None,
                },

                _ => None,
            })
            .endpoint(async |bot: Bot, media: MediaPhoto| -> anyhow::Result<()> {
                info!("Received photo!");

                let mut images = Vec::new();
                for photo_id in media.photo.into_iter().map(|p| p.file.id) {
                    let mut buf = Vec::new();
                    let file = bot.get_file(photo_id).await?;
                    bot.download_file(&file.path, &mut buf).await?;

                    let image = image::load_from_memory(&buf)?;
                    images.push(image);
                }

                let replies = bubble_analysis::analyze(&images)?;
                let sent_count = replies
                    .iter()
                    .filter(|reply| matches!(reply.side, bubble_analysis::Side::Us))
                    .count();
                let received_count = replies.len() - sent_count;
                let total_bbox_area: i64 = replies
                    .iter()
                    .map(|reply| {
                        i64::from(reply.bbox.top_right.0 - reply.bbox.top_left.0)
                            * i64::from(reply.bbox.top_right.1 - reply.bbox.top_left.1)
                    })
                    .sum();
                let total_crop_pixels: u64 = replies
                    .iter()
                    .map(|reply| u64::from(reply.crop.width()) * u64::from(reply.crop.height()))
                    .sum();
                info!(
                    message_count = replies.len(),
                    sent_count,
                    received_count,
                    total_bbox_area,
                    total_crop_pixels,
                    "processed all images"
                );

                Ok(())
            }),
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
    Dispatcher::builder(bot, schema).build().dispatch().await;

    unreachable!("Bot should never stop")
}
