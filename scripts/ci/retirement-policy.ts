/** Deliberately limited to the two manually deployed previews approved for retirement. */
export const retirementSite = (site: string, stage: string): void => {
  const allowed =
    (site === "access-electric" && stage === "ae-preview") ||
    (site === "ms-custom-homes" && stage === "preview");
  if (!allowed) {
    throw new Error(`Refusing retirement of ${site}/${stage}`);
  }
};
