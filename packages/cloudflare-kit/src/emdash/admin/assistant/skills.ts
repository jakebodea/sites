/**
 * The assistant's skills: Agent Skills (`SKILL.md`) it loads only when a request
 * needs them, through `@tanstack/ai-skills`. The system prompt lists each skill's
 * name and description; `load_skill` pulls the full instructions in. So EmDash
 * know-how and copy craft cost nothing on turns that do not use them.
 *
 * The shared skills live in `skills/` and are bundled as text (the Worker has no
 * filesystem). A site adds its own (guidance its pages do not hold) in `cms.config.ts`.
 */
import {
  aggregate,
  dedupe,
  inlineSkill,
  parseSkill,
} from "@tanstack/ai-skills";
import type { SkillSource } from "@tanstack/ai-skills";

import type { SiteSkill } from "../options.ts";
import copyEditing from "./skills/copy-editing/SKILL.md?raw";
import editingEntries from "./skills/editing-entries/SKILL.md?raw";
import metaDescription from "./skills/meta-description/SKILL.md?raw";
import pageSections from "./skills/page-sections/SKILL.md?raw";
import photosAndAltText from "./skills/photos-and-alt-text/SKILL.md?raw";

const SHARED_SKILLS = [
  copyEditing,
  editingEntries,
  metaDescription,
  pageSections,
  photosAndAltText,
];

/** A bundled `SKILL.md` as a source; `strict` turns a malformed name into a build-time failure in tests. */
const bundled = (raw: string): SkillSource => {
  const { metadata, body } = parseSkill(raw, { strict: true });
  return inlineSkill({
    description: metadata.description,
    instructions: body,
    name: metadata.name,
  });
};

/** Every skill the assistant may load; a site skill with a shared skill's name replaces it. */
export const assistantSkills = (
  siteSkills: readonly SiteSkill[] = []
): SkillSource =>
  dedupe(
    aggregate([
      ...siteSkills.map((skill) => inlineSkill({ ...skill })),
      ...SHARED_SKILLS.map(bundled),
    ])
  );
