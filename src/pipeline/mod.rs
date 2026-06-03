use include_dir::{Dir, include_dir};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub mod bubble_analysis;
mod image_utils;
pub mod llm_classification;
pub mod ocr;
pub mod transcript_processing;

static MOVE_IMAGES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/assets");

#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
pub enum MoveKind {
    Best,
    Excellent,
    Good,
    Inaccuracy,
    Miss,
    Mistake,
    Blunder,
    SuperRisky,
    Risky,
    Book,
}

#[derive(Clone, Serialize, Copy, Debug, PartialEq, Eq, JsonSchema)]
pub enum Side {
    They,
    Us,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, JsonSchema)]
pub struct BoundingBox {
    pub top_left: (i32, i32),
    pub top_right: (i32, i32),
}

#[derive(Clone, Debug)]
pub struct Message {
    pub side: Side,
    pub bbox: BoundingBox,
    pub crop: image::DynamicImage,
}

#[derive(Clone, Debug)]
pub struct AnnotatedMessage {
    pub reply: Message,
    pub transcript: String,
}

#[derive(Clone, Debug)]
pub struct MarkedMessage {
    pub annotated: AnnotatedMessage,
    pub kind: MoveKind,
}
