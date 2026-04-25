import { describe, expect, it } from "vitest";

import {
  collectMarkerDelimitedBlockIssues,
  inspectMarkerDelimitedBlock,
} from "../../../src/hosts/shared/marker-instructions.js";

const config = {
  beginMarker: "<!-- tokenjuice:begin -->",
  endMarker: "<!-- tokenjuice:end -->",
  block: "<!-- tokenjuice:begin -->\nbody\n<!-- tokenjuice:end -->",
};

describe("marker instruction helpers", () => {
  it("reports unmatched and duplicate marker blocks", () => {
    const startOnly = inspectMarkerDelimitedBlock("prefix\n<!-- tokenjuice:begin -->\nbody", config);
    expect(collectMarkerDelimitedBlockIssues(startOnly, {
      configuredLabel: "Zed rules",
      repairCommand: "tokenjuice install zed",
    })).toEqual(["configured Zed rules have a tokenjuice start marker without an end marker"]);

    const duplicate = inspectMarkerDelimitedBlock(`${config.block}\n\n${config.block}`, config);
    expect(collectMarkerDelimitedBlockIssues(duplicate, {
      configuredLabel: "Zed rules",
      repairCommand: "tokenjuice install zed",
    })).toEqual(["configured Zed rules have multiple tokenjuice blocks; run tokenjuice install zed to repair"]);
  });
});
