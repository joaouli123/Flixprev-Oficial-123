export const TypingIndicator = () => {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex gap-1 items-center h-full">
        <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "0s" }}></span>
        <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }}></span>
        <span className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }}></span>
      </div>
      <span className="text-sm font-medium text-slate-500 ml-1">escrevendo</span>
    </div>
  );
};
