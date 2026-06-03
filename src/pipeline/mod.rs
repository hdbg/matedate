pub mod bubble_analysis;
mod image_utils;
pub mod ocr;
pub mod transcript_processing;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    They,
    Us,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BoundingBox {
    pub top_left: (i32, i32),
    pub top_right: (i32, i32),
}

#[derive(Clone, Debug)]
pub struct Reply {
    pub side: Side,
    pub bbox: BoundingBox,
    pub crop: image::DynamicImage,
}

#[derive(Clone, Debug)]
pub struct AnnotatedReply {
    pub reply: Reply,
    pub transcript: String,
}
