import { parseDiffFromFile } from "@pierre/diffs";
import { type FileDiffMetadata } from "@pierre/diffs/react";
import { useMemo, useState } from "react";

interface DiffData {
  oldContent: string;
  newContent: string;
  fileName: string;
  fileStatus?: string;
}

/** Diff data: diff line count, diffData model(for <FileDiff /> component) */
export function useDiffData() {
  const [diffData, setDiffData] = useState<DiffData | null>(null);

  const oldFile = {
    name: diffData?.fileName || "",
    contents: diffData?.oldContent || "",
  };
  const newFile = {
    name: diffData?.fileName || "",
    contents: diffData?.newContent || "",
  };

  const fileDiff = useMemo<FileDiffMetadata>(() => {
    return parseDiffFromFile(oldFile, newFile);
  }, [diffData]);
  const diffLine = useMemo(() => {
    const { hunks = [] } = fileDiff || {};
    let additions = 0;
    let deletions = 0;

    for (const hunk of hunks) {
      const contents = hunk.hunkContent || [];
      for (const i of contents) {
        if (i.type === "change") {
          if (i?.additions?.length) {
            additions += i.additions.length;
          } else if (i?.deletions?.length) {
            deletions += i.deletions.length;
          }
        }
      }
    }
    return { additions, deletions };
  }, [fileDiff]);

  return {
    oldFile,
    newFile,
    fileDiff,
    diffLine,
    diffData,
    setDiffData,
  };
}

/** Diff style options: for <FileDiff /> component */
export function useDiffStyle(theme?: string) {
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");

  const toggleDiffStyle = () => {
    setDiffStyle((prev) => (prev === "split" ? "unified" : "split"));
  };

  return {
    diffStyle,
    toggleDiffStyle,
    options: {
      theme: theme === "dark" ? "pierre-dark" : "pierre-light",
      diffStyle,
      expandUnchanged: false,
      expansionLineCount: 20,
      tokenizeMaxLineLength: 500,
      disableFileHeader: true,
    },
  };
}
