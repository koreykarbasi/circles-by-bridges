import { readFileSync } from "fs";
import { join } from "path";

const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

test("legend shares the card's icon renderers, without the removed hangout action", () => {
  const legend = source("components/ContactSymbolLegend.tsx");
  const card = source("components/ContactCard.tsx");
  const move = source("components/CircleMoveButton.tsx");
  for (const symbol of ["ContactCardActionIcon", "ContactWarningGlyph", "ContactUrgencyDot"]) {
    expect(legend).toContain(symbol);
    expect(card).toContain(symbol);
  }
  expect(move).toContain('<ContactCardActionIcon action="move"');
  expect(legend).toContain('action="contacted"');
  expect(legend).toContain("SnoozeGlyph");
  expect(legend).not.toContain("calendar-outline");
  expect(legend).toContain("tap their card to open the contact edit page");
});

test("Circles has separate symbol-legend and selected-circle information controls", () => {
  const screen = source("app/(tabs)/circles.tsx");
  expect(screen).toContain('accessibilityLabel="Contact card symbol legend"');
  expect(screen).toContain("setSymbolLegendOpen(true)");
  expect(screen).toContain('accessibilityLabel={`About ${config.label}`}');
  expect(screen).toContain("color={circleColor(activeCircle)}");
  expect(screen).toContain('styles.searchTools');
});
