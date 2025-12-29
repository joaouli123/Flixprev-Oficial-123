interface FormattedMessageProps {
  content: string;
}

const renderFormattedText = (text: string) => {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;

  // Match bold text (**text**)
  const boldRegex = /\*\*(.*?)\*\*/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(<strong key={`bold-${match.index}`} className="font-semibold text-gray-900 dark:text-gray-100">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
};

export const FormattedMessage = ({ content }: FormattedMessageProps) => {
  // Split by double line breaks to create paragraphs
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

  return (
    <div className="space-y-0">
      {paragraphs.map((paragraph, pIdx) => {
        const lines = paragraph.split('\n').filter(l => l.trim());

        return (
          <div key={pIdx} className="mb-3 last:mb-0">
            {lines.map((line, lineIdx) => {
              const trimmedLine = line.trim();

              // Handle headers (# Header)
              if (/^#+\s+/.test(trimmedLine)) {
                const level = trimmedLine.match(/^#+/)?.[0].length || 1;
                const headerText = trimmedLine.replace(/^#+\s+/, '');
                const sizeClasses = {
                  1: "text-lg font-bold mb-2 mt-2",
                  2: "text-base font-bold mb-2 mt-1",
                  3: "font-semibold mb-1",
                };
                const className = sizeClasses[level as keyof typeof sizeClasses] || "font-semibold";
                return (
                  <div key={lineIdx} className={`${className} text-gray-900 dark:text-gray-100`}>
                    {renderFormattedText(headerText)}
                  </div>
                );
              }

              // Handle numbered lists (1., 2., etc.)
              if (/^\d+\.\s+/.test(trimmedLine)) {
                const match = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
                if (match) {
                  return (
                    <div key={lineIdx} className="flex gap-2 mb-2">
                      <span className="font-semibold text-blue-600 dark:text-blue-400 min-w-fit">{match[1]}.</span>
                      <span className="flex-1">{renderFormattedText(match[2])}</span>
                    </div>
                  );
                }
              }

              // Handle bullet points (-, *, •)
              if (/^[-*•]\s+/.test(trimmedLine)) {
                const text = trimmedLine.replace(/^[-*•]\s+/, '');
                return (
                  <div key={lineIdx} className="flex gap-2 mb-2">
                    <span className="text-blue-600 dark:text-blue-400 min-w-fit">•</span>
                    <span className="flex-1">{renderFormattedText(text)}</span>
                  </div>
                );
              }

              // Regular text with formatting
              if (trimmedLine) {
                return (
                  <p key={lineIdx} className="mb-1 text-gray-900 dark:text-gray-100">
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
