export function createStructuredMarkerInspector(
  beginMarker: string,
  endMarker: string,
  getStructureLines: (lines: readonly string[]) => string[],
) {
  function getStructuralMarkerLines(text: string, marker: string): { lines: string[]; markerLines: number[] } {
    const lines = text.split("\n");
    const structureLines = getStructureLines(lines);
    return {
      lines,
      markerLines: structureLines.flatMap((line, index) => (line.trim() === marker ? [index] : [])),
    };
  }

  function findTokenjuiceBlockLineRange(text: string): { lines: string[]; start: number; end: number } | undefined {
    const begin = getStructuralMarkerLines(text, beginMarker);
    const end = getStructuralMarkerLines(text, endMarker);
    if (begin.markerLines.length !== 1 || end.markerLines.length !== 1 || end.markerLines[0]! < begin.markerLines[0]!) {
      return undefined;
    }
    return {
      lines: begin.lines,
      start: begin.markerLines[0]!,
      end: end.markerLines[0]! + 1,
    };
  }

  function hasMalformedMarkerStructure(text: string): boolean {
    const begin = getStructuralMarkerLines(text, beginMarker);
    const end = getStructuralMarkerLines(text, endMarker);
    const beginCount = begin.markerLines.length;
    const endCount = end.markerLines.length;
    return beginCount !== endCount || beginCount > 1 || endCount > 1 || (beginCount === 1 && end.markerLines[0]! < begin.markerLines[0]!);
  }

  function hasStructuralTokenjuiceMarker(text: string): boolean {
    return getStructuralMarkerLines(text, beginMarker).markerLines.length > 0 || getStructuralMarkerLines(text, endMarker).markerLines.length > 0;
  }

  function hasTokenjuiceBlock(text: string): boolean {
    return Boolean(findTokenjuiceBlockLineRange(text));
  }

  function getTokenjuiceBlockText(text: string): string {
    const range = findTokenjuiceBlockLineRange(text);
    if (!range) {
      return "";
    }
    return range.lines.slice(range.start, range.end).join("\n");
  }

  return {
    findTokenjuiceBlockLineRange,
    hasMalformedMarkerStructure,
    hasStructuralTokenjuiceMarker,
    hasTokenjuiceBlock,
    getTokenjuiceBlockText,
  };
}
