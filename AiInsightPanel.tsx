
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, BrainCircuit, CalendarClock, Copy, Check, Send, MessageSquare, Bot, User, Maximize2, Minimize2, Trash2, Cpu } from 'lucide-react';
import { ChartDataPoint, SectorDef } from '../types';
import { analyzeMarketTrend, AnalysisRange, restoreSession } from '../services/ai';
import { Chat } from '@google/genai';
import clsx from 'clsx';

interface Props {
  data: ChartDataPoint[];
  sectorName: string;
  capName: string;
  sectors: SectorDef[];
}

interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const RANGES: { value: AnalysisRange; label: string }[] = [
  { value: '1M', label: '1 Tháng' },
  { value: '3M', label: '3 Tháng' },
  { value: '6M', label: '6 Tháng' },
  { value: '1Y', label: '1 Năm' },
  { value: 'ALL', label: 'Tất cả' },
];

// Updated model list based on supported entities
const MODELS = [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
];

const STORAGE_KEY = 'MBA_AI_SESSION';

const AiInsightPanel: React.FC<Props> = ({ data, sectorName, capName, sectors }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<AnalysisRange>('3M');
  const [model, setModel] = useState(MODELS[0].id);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Chat State
  const chatSessionRef = useRef<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New state for chat message copy feedback
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.analysis) setAnalysis(parsed.analysis);
            if (parsed.chatMessages) setChatMessages(parsed.chatMessages);
            if (parsed.range) setRange(parsed.range as AnalysisRange);
            
            // Validate model - if the saved model is not in our current list, revert to default
            if (parsed.model && MODELS.some(m => m.id === parsed.model)) {
                setModel(parsed.model);
            }
        }
    } catch (e) {
        console.error("Failed to load session", e);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (analysis) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            analysis,
            chatMessages,
            range,
            model,
            timestamp: Date.now()
        }));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
  }, [analysis, chatMessages, range, model]);

  const scrollToBottom = () => {
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, analysis, isExpanded]);

  // Lock body scroll when expanded
  useEffect(() => {
    if (isExpanded) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isExpanded]);

  const handleAnalyze = async () => {
    setLoading(true);
    setAnalysis(null);
    setChatMessages([]);
    chatSessionRef.current = null;
    
    try {
      const result = await analyzeMarketTrend(data, sectorName, capName, range, sectors, model);
      setAnalysis(result.text);
      chatSessionRef.current = result.chatSession;
    } catch (e: any) {
      setAnalysis(e.message || "Đã xảy ra lỗi trong quá trình phân tích.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    setAnalysis(null);
    setChatMessages([]);
    chatSessionRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleCopy = () => {
    if (analysis) {
        navigator.clipboard.writeText(analysis);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageIndex(index);
    setTimeout(() => setCopiedMessageIndex(null), 2000);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userText = inputMessage;
    setInputMessage('');
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatLoading(true);

    try {
        // Lazy restore session if needed
        if (!chatSessionRef.current) {
            if (!analysis) throw new Error("No active analysis context");
            
            // Reconstruct the chat session with previous history
            chatSessionRef.current = await restoreSession(
                data, 
                sectorName, 
                capName, 
                range, 
                sectors, 
                analysis, 
                chatMessages, // Current history excluding the new message
                model
            );
        }

        const response = await chatSessionRef.current.sendMessage({ message: userText });
        const aiText = response.text || "Xin lỗi, tôi không thể trả lời lúc này.";
        setChatMessages(prev => [...prev, { role: 'model', text: aiText }]);
    } catch (error) {
        console.error(error);
        setChatMessages(prev => [...prev, { role: 'model', text: "Lỗi kết nối hoặc khôi phục phiên. Vui lòng thử lại." }]);
    } finally {
        setChatLoading(false);
    }
  };

  // Improved text rendering function with Markdown support
  const renderFormattedText = (text: string, isHeaderLarge: boolean = false) => {
    if (!text) return null;

    // Split by newlines to handle block elements
    const lines = text.split('\n');

    return lines.map((line, lineIndex) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return <div key={lineIndex} className="h-2"></div>; // Spacer for empty lines

        // Handle Headers (###)
        if (trimmedLine.startsWith('###')) {
            const content = trimmedLine.replace(/^###\s*/, '');
            return (
                <h3 key={lineIndex} className={clsx(
                    "font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mt-6 mb-3 uppercase tracking-wide border-b border-gray-800 pb-2",
                    isHeaderLarge ? "text-xl" : "text-base"
                )}>
                    {content}
                </h3>
            );
        }

        // Handle Bullet Points (- or *)
        const isBullet = trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ');
        const content = isBullet ? trimmedLine.substring(2) : trimmedLine;

        // Parse Bold (**text**) within the line
        const parts = content.split(/(\*\*.*?\*\*)/g);
        
        const renderedContent = parts.map((part, partIndex) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return (
                    <strong key={partIndex} className="text-yellow-400 font-bold">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            return <span key={partIndex}>{part}</span>;
        });

        if (isBullet) {
            return (
                <div key={lineIndex} className="flex gap-3 mb-2 pl-2">
                    <span className="text-purple-500 mt-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full flex-shrink-0" />
                    <p className={clsx("text-gray-300 leading-relaxed", isHeaderLarge ? "text-lg" : "text-sm")}>
                        {renderedContent}
                    </p>
                </div>
            );
        }

        return (
            <p key={lineIndex} className={clsx("text-gray-300 mb-2 leading-relaxed", isHeaderLarge ? "text-lg" : "text-sm")}>
                {renderedContent}
            </p>
        );
    });
  };

  const PanelContent = (
    <div className={clsx(
        "bg-[#131722] border-gray-800 flex flex-col overflow-hidden transition-all duration-200",
        isExpanded 
            ? "fixed inset-0 z-[9999] w-full h-[100dvh] border-none" 
            : "w-full h-full max-h-[600px] rounded-xl border shadow-lg"
    )}>
        {/* Header */}
        <div className={clsx(
            "flex flex-col gap-3 p-4 border-b border-gray-800 flex-none bg-[#131722] z-20 shadow-md",
            isExpanded ? "pt-4 px-6" : ""
        )}>
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                  <BrainCircuit size={isExpanded ? 24 : 18} className="text-purple-400" />
                  <h2 className={clsx("font-bold text-gray-200 uppercase tracking-wide", isExpanded ? "text-lg" : "text-sm")}>
                      AI Dự báo
                  </h2>
              </div>
              
              <div className="flex items-center gap-2">
                   {analysis && (
                       <button
                           onClick={handleClearHistory}
                           className="text-gray-500 hover:text-red-400 p-2 transition-colors"
                           title="Xóa lịch sử"
                       >
                           <Trash2 size={16} />
                       </button>
                   )}
                   <button 
                      onClick={() => setIsExpanded(!isExpanded)}
                      className={clsx(
                        "text-gray-400 hover:text-white p-2 rounded-lg transition-colors flex items-center justify-center",
                        isExpanded ? "bg-gray-800 hover:bg-gray-700" : ""
                      )}
                      title={isExpanded ? "Thu nhỏ" : "Phóng to"}
                  >
                      {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={16} />}
                  </button>
              </div>
          </div>
          
          <div className="grid grid-cols-10 gap-2">
              {/* Range Selector */}
              <div className="col-span-3 relative">
                  <CalendarClock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
                  <select 
                      value={range}
                      onChange={(e) => setRange(e.target.value as AnalysisRange)}
                      disabled={loading}
                      className="w-full bg-gray-950 border border-gray-800 text-gray-200 rounded pl-7 pr-1 py-2 text-[10px] focus:border-purple-500 outline-none appearance-none cursor-pointer hover:bg-gray-900 transition-colors"
                  >
                      {RANGES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                  </select>
              </div>

              {/* Model Selector */}
              <div className="col-span-4 relative">
                  <Cpu size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"/>
                  <select 
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={loading}
                      className="w-full bg-gray-950 border border-gray-800 text-gray-200 rounded pl-7 pr-1 py-2 text-[10px] focus:border-purple-500 outline-none appearance-none cursor-pointer hover:bg-gray-900 transition-colors truncate"
                  >
                      {MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
              </div>

              {/* Action Button */}
              <div className="col-span-3">
                <button 
                    onClick={handleAnalyze}
                    disabled={loading}
                    className="w-full h-full flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-500 text-white rounded transition-all shadow-lg shadow-purple-500/20 font-bold text-[10px] whitespace-nowrap active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Sparkles size={12} />
                    {loading ? '...' : 'Chạy'}
                </button>
              </div>
          </div>
        </div>

        {/* Content Area */}
        <div className={clsx("flex-grow overflow-hidden flex flex-col bg-[#131722]", isExpanded ? "pb-0" : "")}>
          <div className="flex-grow overflow-y-auto custom-scrollbar flex flex-col w-full">
            <div className={clsx("flex flex-col mx-auto w-full min-h-full", isExpanded ? "max-w-5xl px-6 py-4" : "")}>
                {loading ? (
                  <div className="flex flex-col items-center justify-center flex-grow text-gray-500 gap-4 animate-pulse min-h-[200px]">
                    <BrainCircuit size={48} className="animate-bounce text-purple-400" />
                    <span className={clsx("text-center", isExpanded ? "text-base" : "text-xs")}>
                        Đang đọc dữ liệu thị trường ({range})...<br/>
                        Sử dụng mô hình: {MODELS.find(m => m.id === model)?.name}
                    </span>
                  </div>
                ) : analysis ? (
                  <div className="flex flex-col flex-grow pb-4">
                      {/* Main Analysis Block */}
                      <div className="p-5 relative group">
                        <button 
                            onClick={handleCopy}
                            className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-md transition-all opacity-0 group-hover:opacity-100 z-10"
                            title="Copy Text"
                        >
                            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                        
                        {/* New Formatted Render */}
                        <div className="prose prose-invert prose-sm max-w-none">
                            {renderFormattedText(analysis, isExpanded)}
                        </div>
                      </div>

                      {/* Chat Divider */}
                      <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-800/50 bg-gray-900/30 mt-2">
                         <MessageSquare size={16} className="text-blue-400" />
                         <span className={clsx("font-bold uppercase tracking-wider text-gray-500", isExpanded ? "text-sm" : "text-xs")}>Hỏi đáp với AI</span>
                      </div>

                      {/* Chat History */}
                      <div className="px-5 py-4 space-y-5 bg-[#0F1219] flex-grow rounded-lg mx-4 mb-2 border border-gray-800/50">
                         {chatMessages.map((msg, idx) => (
                             <div key={idx} className={clsx("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "")}>
                                 <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center flex-none shadow-lg", 
                                     msg.role === 'model' ? "bg-purple-600/20 text-purple-400" : "bg-gray-700 text-gray-300"
                                 )}>
                                     {msg.role === 'model' ? <Bot size={18} /> : <User size={18} />}
                                 </div>
                                 <div className={clsx("px-5 py-3 rounded-2xl max-w-[85%] shadow-sm relative group/bubble",
                                     msg.role === 'model' ? "bg-gray-800 text-gray-200 rounded-tl-none" : "bg-blue-600/20 text-blue-100 border border-blue-500/20 rounded-tr-none",
                                 )}>
                                     {renderFormattedText(msg.text, isExpanded)}

                                     <button 
                                        onClick={() => handleCopyMessage(msg.text, idx)}
                                        className={clsx(
                                            "absolute p-1.5 rounded transition-all opacity-0 group-hover/bubble:opacity-100 focus:opacity-100",
                                            msg.role === 'user' 
                                                ? "top-2 left-2 text-blue-300 hover:text-white hover:bg-blue-500/30" 
                                                : "top-2 right-2 text-gray-500 hover:text-white hover:bg-gray-700"
                                        )}
                                        title="Copy"
                                     >
                                        {copiedMessageIndex === idx ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                     </button>
                                 </div>
                             </div>
                         ))}
                         {chatLoading && (
                             <div className="flex gap-4">
                                 <div className="w-9 h-9 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center"><Bot size={18} /></div>
                                 <div className="bg-gray-800 px-5 py-3 rounded-2xl rounded-tl-none flex gap-1.5 items-center h-12">
                                     <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                                     <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                                     <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                                 </div>
                             </div>
                         )}
                         <div ref={messagesEndRef} />
                      </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center flex-grow text-gray-500 gap-3 text-center p-4 min-h-[200px]">
                     <Sparkles size={isExpanded ? 32 : 24} className="text-gray-600" />
                     <p className={clsx(isExpanded ? "text-sm" : "text-xs")}>
                       Chọn khung thời gian, mô hình và nhấn "Chạy" để phân tích.
                     </p>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Chat Input */}
        {analysis && (
            <div className={clsx(
                "bg-[#131722] border-t border-gray-800 flex flex-col gap-2 flex-none z-30", 
                isExpanded ? "p-6 pb-8" : "p-4"
            )}>
                <div className={clsx("flex gap-3 w-full mx-auto", isExpanded ? "max-w-5xl" : "")}>
                  <input 
                      type="text" 
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Hỏi thêm về dữ liệu này..."
                      disabled={chatLoading}
                      className={clsx(
                          "flex-grow bg-gray-950 border border-gray-800 rounded-xl text-gray-200 focus:border-blue-500 outline-none transition-colors disabled:opacity-50",
                          isExpanded ? "px-5 py-4 text-base" : "px-4 py-2.5 text-sm"
                      )}
                  />
                  <button 
                      onClick={handleSendMessage}
                      disabled={chatLoading || !inputMessage.trim()}
                      className={clsx(
                          "bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-blue-500/20",
                          isExpanded ? "px-6" : "px-4"
                      )}
                  >
                      <Send size={isExpanded ? 20 : 18} />
                  </button>
                </div>
                {isExpanded && <div className="text-center text-gray-600 text-xs mt-1">Nhấn Enter để gửi</div>}
            </div>
        )}
    </div>
  );

  return (
    <>
      {isExpanded && <div className="w-full h-[600px] hidden lg:block bg-gray-900/20 rounded-xl border border-gray-800/50" />}
      {isExpanded ? createPortal(PanelContent, document.body) : PanelContent}
    </>
  );
};

export default AiInsightPanel;
