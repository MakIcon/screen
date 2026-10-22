import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RamAllocationWarning } from "./RamAllocationWarning";

describe("RAM allocation warning", () => {
  it.each([4, 32, 61, 61.6])("stays hidden for %s GB within usable RAM", (ramGb) => {
    expect(renderToStaticMarkup(<RamAllocationWarning ramGb={ramGb} usableRamGb={61.6} />)).toBe(
      "",
    );
  });

  it.each([62, 63, 64])("warns about system instability when selecting %s GB", (ramGb) => {
    const html = renderToStaticMarkup(<RamAllocationWarning ramGb={ramGb} usableRamGb={61.6} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("61.6");
    expect(html).toContain("нестабильную работу системы");
  });

  it("does not warn before the system memory measurement arrives", () => {
    expect(renderToStaticMarkup(<RamAllocationWarning ramGb={64} usableRamGb={null} />)).toBe("");
  });
});
