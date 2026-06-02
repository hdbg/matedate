use teloxide::{
    Bot,
    dispatching::{MessageFilterExt as _, UpdateFilterExt as _},
    dptree,
    prelude::{Dispatcher, Requester},
    types::{MediaKind, MediaPhoto, Message, MessageKind, Update, User},
};
use tracing::info;

#[derive(serde::Deserialize)]
pub struct Config {
    pub token: String,
}

const CONFIG_FILE: &str = "config.toml";
const CONFIG_ENV_PREIFX: &str = "BOT";

mod image_processing;

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
            .endpoint(async |bot: Bot, photo: MediaPhoto| -> anyhow::Result<()> {
                info!("Received photo!");

                // process `photo` here

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
