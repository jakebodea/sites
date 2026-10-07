import { Schema } from "effect";

export const decodeContentBindings = Schema.decodeUnknownSync(
  Schema.Struct({
    CMS_BOOTSTRAP_TOKEN: Schema.optionalKey(Schema.String),
    CMS_OWNER_SITE: Schema.optionalKey(Schema.String),
    PUBLISHED_CONTENT_EXPORT_TOKEN: Schema.optionalKey(Schema.String),
    STAGE: Schema.optionalKey(Schema.String),
  })
);
