import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FormattedMessageProps {
  content: string;
}

interface ParsedTable {
  header: string[];
  rows: string[][];
}

const renderFormattedText = (text: string) => {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;

  const inlineFormatRegex = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*)/g;
  let match;

  while ((match = inlineFormatRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[2] !== undefined) {
      parts.push(
        <strong key={`bold-${match.index}`} className="font-semibold text-slate-900">
          {match[2]}
        </strong>
      );
    } else {
      parts.push(
        <em key={`italic-${match.index}`} className="italic text-slate-600">
          {match[3]}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

const isPipeTableLine = (line: string) => {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) {
    return false;
  }

  const pipeCount = (trimmedLine.match(/\|/g) || []).length;
  return pipeCount >= 2;
};

const splitPipeTableRow = (line: string) => (
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
);

const isPipeTableSeparator = (line: string) => {
  if (!isPipeTableLine(line)) {
    return false;
  }

  const cells = splitPipeTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
};

const normalizePipeTableSpacing = (text: string) => {
  let normalizedText = text;
  let previous = "";

  while (normalizedText !== previous) {
    previous = normalizedText;
    normalizedText = normalizedText.replace(/(^\|[^\n]*?)\n\s*\n(?=\|)/gm, "$1\n");
  }

  return normalizedText;
};

const parsePipeTable = (lines: string[]): ParsedTable | null => {
  const tableLines = lines.map((line) => line.trim()).filter(Boolean);
  if (tableLines.length < 2 || !tableLines.every(isPipeTableLine)) {
    return null;
  }

  const separatorIndex = tableLines.findIndex(isPipeTableSeparator);
  const header = splitPipeTableRow(tableLines[0]);
  const dataStartIndex = separatorIndex === 1 ? 2 : 1;
  const rawRows = tableLines.slice(dataStartIndex).filter((line) => !isPipeTableSeparator(line));

  if (header.length < 2 || rawRows.length === 0) {
    return null;
  }

  const columnCount = header.length;
  const rows = rawRows.map((line) => {
    const cells = splitPipeTableRow(line);

    if (cells.length === columnCount) {
      return cells;
    }

    if (cells.length < columnCount) {
      return [...cells, ...Array.from({ length: columnCount - cells.length }, () => "")];
    }

    return [
      ...cells.slice(0, columnCount - 1),
      cells.slice(columnCount - 1).join(" | "),
    ];
  });

  return { header, rows };
};

export const FormattedMessage = ({ content }: FormattedMessageProps) => {
  const normalizedContent = normalizePipeTableSpacing(content);
  const paragraphs = normalizedContent.split(/\n\n+/).filter((paragraph) => paragraph.trim());

  return (
    <div className="space-y-0 text-slate-700">
      {paragraphs.map((paragraph, pIdx) => {
        const lines = paragraph.split("\n").filter((line) => line.trim());
        const parsedTable = parsePipeTable(lines);

        if (parsedTable) {
          return (
            <div key={pIdx} className="mb-4 last:mb-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
              <Table className="min-w-[620px] text-sm">
                <TableHeader className="bg-slate-100/90">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    {parsedTable.header.map((cell, cellIdx) => (
                      <TableHead
                        key={`head-${pIdx}-${cellIdx}`}
                        className="h-auto px-4 py-3 align-top text-xs font-semibold uppercase tracking-[0.08em] text-slate-600"
                      >
                        {renderFormattedText(cell)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedTable.rows.map((row, rowIdx) => (
                    <TableRow key={`row-${pIdx}-${rowIdx}`} className="border-slate-200 align-top hover:bg-slate-100/50">
                      {row.map((cell, cellIdx) => (
                        <TableCell
                          key={`cell-${pIdx}-${rowIdx}-${cellIdx}`}
                          className="px-4 py-3 align-top text-sm leading-relaxed whitespace-pre-wrap text-slate-700"
                        >
                          {renderFormattedText(cell)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        }

        return (
          <div key={pIdx} className="mb-4 last:mb-0">
            {lines.map((line, lineIdx) => {
              const trimmedLine = line.trim();

              if (/^([-*_])\1{2,}$/.test(trimmedLine.replace(/\s+/g, ""))) {
                return <hr key={lineIdx} className="my-4 border-slate-200" />;
              }

              // Handle headers (# Header)
              if (/^#+\s+/.test(trimmedLine)) {
                const level = trimmedLine.match(/^#+/)?.[0].length || 1;
                const headerText = trimmedLine.replace(/^#+\s+/, '');
                const sizeClasses = {
                  1: "text-xl font-bold mb-3 mt-4 text-slate-900",
                  2: "text-lg font-bold mb-2 mt-3 text-slate-800",
                  3: "text-base font-semibold mb-2 mt-2 text-slate-800",
                };
                const className = sizeClasses[level as keyof typeof sizeClasses] || "font-semibold text-slate-800";
                return (
                  <div key={lineIdx} className={`${className}`}>
                    {renderFormattedText(headerText)}
                  </div>
                );
              }

              // Handle numbered lists (1., 2., etc.)
              if (/^\d+\.\s+/.test(trimmedLine)) {
                const match = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
                if (match) {
                  return (
                    <div key={lineIdx} className="flex gap-3 mb-2 pl-1">
                      <span className="font-semibold text-indigo-600 min-w-[1.5rem]">{match[1]}.</span>
                      <span className="flex-1 leading-relaxed">{renderFormattedText(match[2])}</span>
                    </div>
                  );
                }
              }

              // Handle bullet points (-, *, •)
              if (/^[-*•]\s+/.test(trimmedLine)) {
                const text = trimmedLine.replace(/^[-*•]\s+/, '');
                return (
                  <div key={lineIdx} className="flex gap-3 mb-2 pl-1">
                    <span className="text-indigo-500 min-w-[1rem] flex justify-center items-center mt-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    </span>
                    <span className="flex-1 leading-relaxed">{renderFormattedText(text)}</span>
                  </div>
                );
              }

              // Regular text with formatting
              if (trimmedLine) {
                return (
                  <p key={lineIdx} className="mb-2 leading-relaxed">
                    {renderFormattedText(trimmedLine)}
                  </p>
                );
              }

              return null;
            })}
          </div>
        );
      })}
    </div>
  );
};
