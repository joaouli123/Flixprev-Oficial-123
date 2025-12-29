export const TypingIndicator = () => {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-600 dark:text-gray-400">Respondendo</span>
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0s" }}></span>
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }}></span>
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }}></span>
      </div>
    </div>
  );
};
