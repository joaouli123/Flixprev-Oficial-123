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
    parts.push(<strong key={`bold-${match.index}`} className="font-semibold text-slate-900">{match[1]}</strong>);
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
    <div className="space-y-0 text-slate-700">
      {paragraphs.map((paragraph, pIdx) => {
        const lines = paragraph.split('\n').filter(l => l.trim());

        return (
          <div key={pIdx} className="mb-4 last:mb-0">
            {lines.map((line, lineIdx) => {
              const trimmedLine = line.trim();

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
