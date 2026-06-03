use std::time::Duration;

use anyhow::Context as _;
use image::DynamicImage;
use kameo::{
    actor::{Actor, ActorRef, Spawn},
    supervision::{RestartPolicy, SupervisionStrategy},
};
use tracing::info;

use super::{
    PipelineOutput, Side, annotation, bubble_analysis, llm_classification, ocr,
    transcript_processing,
};

const CHILD_RESTART_LIMIT: u32 = 10;
const CHILD_RESTART_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone, Debug)]
pub struct PipelineOrchestratorArgs {
    pub llm: llm_classification::LLMConfig,
}

pub struct PipelineOrchestrator {
    bubble_analysis: ActorRef<bubble_analysis::BubbleAnalysisProcessor>,
    ocr: ActorRef<ocr::OcrProcessor>,
    transcript_processing: ActorRef<transcript_processing::TranscriptProcessor>,
    llm: ActorRef<llm_classification::LLMProcessor>,
    annotation: ActorRef<annotation::AnnotationProcessor>,
}

impl Actor for PipelineOrchestrator {
    type Args = PipelineOrchestratorArgs;
    type Error = anyhow::Error;

    fn supervision_strategy() -> SupervisionStrategy {
        SupervisionStrategy::OneForOne
    }

    async fn on_start(args: Self::Args, actor_ref: ActorRef<Self>) -> Result<Self, Self::Error> {
        info!("pipeline orchestrator starting supervised stage actors");

        let bubble_analysis =
            bubble_analysis::BubbleAnalysisProcessor::supervise(&actor_ref, Default::default())
                .restart_policy(RestartPolicy::Permanent)
                .restart_limit(CHILD_RESTART_LIMIT, CHILD_RESTART_WINDOW)
                .spawn_in_thread()
                .await;
        let ocr = ocr::OcrProcessor::supervise(&actor_ref, Default::default())
            .restart_policy(RestartPolicy::Permanent)
            .restart_limit(CHILD_RESTART_LIMIT, CHILD_RESTART_WINDOW)
            .spawn_in_thread()
            .await;
        let transcript_processing =
            transcript_processing::TranscriptProcessor::supervise(&actor_ref, Default::default())
                .restart_policy(RestartPolicy::Permanent)
                .restart_limit(CHILD_RESTART_LIMIT, CHILD_RESTART_WINDOW)
                .spawn_in_thread()
                .await;
        let llm = llm_classification::LLMProcessor::supervise(&actor_ref, args.llm)
            .restart_policy(RestartPolicy::Permanent)
            .restart_limit(CHILD_RESTART_LIMIT, CHILD_RESTART_WINDOW)
            .spawn()
            .await;
        let annotation = annotation::AnnotationProcessor::supervise(&actor_ref, Default::default())
            .restart_policy(RestartPolicy::Permanent)
            .restart_limit(CHILD_RESTART_LIMIT, CHILD_RESTART_WINDOW)
            .spawn_in_thread()
            .await;

        llm.wait_for_startup().await;
        if let Some(error) = llm
            .with_startup_result(|result| result.err().map(|error| format!("{error:?}")))
            .flatten()
        {
            anyhow::bail!("LLM processor failed to start: {error}");
        }
        info!("pipeline orchestrator started supervised stage actors");
        Ok(Self {
            bubble_analysis,
            ocr,
            transcript_processing,
            llm,
            annotation,
        })
    }
}

#[kameo::messages]
impl PipelineOrchestrator {
    #[message]
    pub async fn analyze(&mut self, images: Vec<DynamicImage>) -> anyhow::Result<PipelineOutput> {
        info!(image_count = images.len(), "pipeline orchestration started");

        let primary_image = images
            .first()
            .cloned()
            .context("pipeline received no images")?;
        let messages = self
            .bubble_analysis
            .ask(bubble_analysis::Analyze { images })
            .await
            .map_err(|_| anyhow::anyhow!("bubble analysis actor request failed"))?;

        let sent_count = messages
            .iter()
            .filter(|message| matches!(message.side, Side::Us))
            .count();
        let received_count = messages.len() - sent_count;
        let total_bbox_area: i64 = messages
            .iter()
            .map(|message| {
                i64::from(message.bbox.top_right.0 - message.bbox.top_left.0)
                    * i64::from(message.bbox.top_right.1 - message.bbox.top_left.1)
            })
            .sum();
        let total_crop_pixels: u64 = messages
            .iter()
            .map(|message| u64::from(message.crop.width()) * u64::from(message.crop.height()))
            .sum();
        let message_count = messages.len();

        let annotated_messages = self
            .ocr
            .ask(ocr::Analyze { messages })
            .await
            .map_err(|_| anyhow::anyhow!("OCR actor request failed"))?;
        let annotated_messages = self
            .transcript_processing
            .ask(transcript_processing::Analyze {
                messages: annotated_messages,
            })
            .await
            .map_err(|_| anyhow::anyhow!("transcript processing actor request failed"))?;
        let recognized_char_count: usize = annotated_messages
            .iter()
            .map(|message| message.transcript.chars().count())
            .sum();

        let analysis = self
            .llm
            .ask(llm_classification::Analyze {
                conversation: annotated_messages,
            })
            .await
            .map_err(|_| anyhow::anyhow!("LLM classification actor request failed"))?;
        let annotated_image = self
            .annotation
            .ask(annotation::Analyze {
                image: primary_image,
                marked: analysis.moves.clone(),
            })
            .await
            .map_err(|_| anyhow::anyhow!("annotation actor request failed"))?;

        info!(
            message_count,
            sent_count,
            received_count,
            total_bbox_area,
            total_crop_pixels,
            recognized_message_count = analysis.moves.len(),
            recognized_char_count,
            elo = analysis.elo,
            "pipeline orchestration finished"
        );

        Ok(PipelineOutput {
            analysis,
            annotated_image,
        })
    }
}
