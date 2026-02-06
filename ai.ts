
import { GoogleGenAI, Chat } from "@google/genai";
import { ChartDataPoint, SectorDef } from "../types";
import { fetchVNIndexData } from "./api";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export type AnalysisRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

export interface AnalysisResult {
  text: string;
  chatSession: Chat;
}

// Helper to build the prompt and system instruction
const prepareAnalysisContext = async (
  data: ChartDataPoint[], 
  sectorName: string,
  capName: string,
  range: AnalysisRange,
  allSectors: SectorDef[]
) => {
  if (!data || data.length < 5) {
    throw new Error("Dữ liệu không đủ để phân tích. Vui lòng đảm bảo biểu đồ đã tải dữ liệu.");
  }

  // Determine slice count based on trading days
  let sliceCount = 0;
  switch (range) {
    case '1M': sliceCount = 22; break;
    case '3M': sliceCount = 65; break;
    case '6M': sliceCount = 130; break;
    case '1Y': sliceCount = 250; break;
    case 'ALL': sliceCount = data.length; break;
    default: sliceCount = 250;
  }

  const startIndex = Math.max(0, data.length - sliceCount);
  const recentData = data.slice(startIndex);
  
  const formatDateVN = (ts: number) => new Date(ts).toLocaleDateString('en-GB'); 
  const startDate = formatDateVN(recentData[0].timestamp);
  const endDate = formatDateVN(recentData[recentData.length - 1].timestamp);
  const startTs = recentData[0].timestamp;

  // --- Fetch All Sectors Performance (Parallel) ---
  let sectorPerformanceString = "Không có dữ liệu chi tiết các ngành.";
  
  if (allSectors.length > 0) {
      try {
          const sectorPromises = allSectors.map(async (sec) => {
              const url = `https://api.alphastock.vn/api/rrg/sector?code=${sec.code}&week=1`;
              const secData = await fetchVNIndexData(url);
              
              if (!secData || secData.length === 0) return null;

              const startPoint = secData.find(d => d.timestamp >= startTs);
              const endPoint = secData[secData.length - 1]; 

              if (startPoint && endPoint && endPoint.timestamp >= startTs) {
                  const pctChange = ((endPoint.close - startPoint.close) / startPoint.close) * 100;
                  return { name: sec.name, code: sec.code, change: pctChange };
              }
              return null;
          });

          const sectorResults = (await Promise.all(sectorPromises)).filter(s => s !== null) as {name: string, change: number}[];
          sectorResults.sort((a, b) => b.change - a.change);

          sectorPerformanceString = sectorResults.map((s, idx) => 
              `${idx + 1}. ${s.name}: ${s.change > 0 ? '+' : ''}${s.change.toFixed(1)}%`
          ).join('\n');

      } catch (err) {
          console.error("Error fetching sector summary:", err);
          sectorPerformanceString = "Lỗi khi tải dữ liệu so sánh ngành.";
      }
  }

  const dataString = recentData.map(d => 
    `${d.date}|VNI:${d.vnIndex?.toFixed(1) || '-'}|MA20%:${d.ma20?.toFixed(1)}|MA50%:${d.ma50?.toFixed(1)}|MA200%:${d.ma200?.toFixed(1)}|${capName}:${d.capVal?.toFixed(1) || '-'}|${sectorName}:${d.sectorVal?.toFixed(1) || '-'}`
  ).join('\n');

  const rangeLabels: Record<AnalysisRange, string> = {
      '1M': '1 Tháng gần nhất',
      '3M': '3 Tháng gần nhất',
      '6M': '6 Tháng gần nhất',
      '1Y': '1 Năm gần nhất',
      'ALL': 'Toàn bộ dữ liệu hiển thị'
  };
  const rangeText = rangeLabels[range];

  const systemInstruction = `
    Bạn là Chuyên gia Phân tích Kỹ thuật Định lượng (Quantitative Technical Analyst) cấp cao chuyên về thị trường chứng khoán Việt Nam.
    
    DỮ LIỆU THỊ TRƯỜNG (${recentData.length} phiên, ${startDate} - ${endDate}):
    Format: Date | VNINDEX | % > MA20 | % > MA50 | % > MA200 | ${capName} | ${sectorName}
    ----------------------------------------------------------------
    ${dataString}
    ----------------------------------------------------------------

    DỮ LIỆU HIỆU SUẤT TẤT CẢ CÁC NGÀNH TRONG GIAI ĐOẠN NÀY (${rangeText}):
    (Đã sắp xếp từ mạnh nhất đến yếu nhất)
    ----------------------------------------------------------------
    ${sectorPerformanceString}
    ----------------------------------------------------------------

    NHIỆM VỤ:
    1. Phân tích xu hướng dựa trên dữ liệu trên.
    2. QUAN TRỌNG: Đánh giá dòng tiền luân chuyển (Sector Rotation) dựa trên bảng xếp hạng hiệu suất ngành.
    3. Trả lời các câu hỏi follow-up của người dùng về dữ liệu này.
    
    LƯU Ý QUAN TRỌNG:
    - Sử dụng format Markdown chuẩn.
    - Dùng '###' cho các tiêu đề mục lớn.
    - Dùng dấu gạch ngang '-' cho các ý liệt kê.
    - Dùng '**' để bôi đậm các con số, xu hướng quan trọng.
  `;

  const prompt = `
  Phân tích xu hướng thị trường trong khung thời gian **${rangeText}**.

  YÊU CẦU ĐỊNH DẠNG (Bắt buộc tuân thủ), trả lời luôn như dưới(không chảo hỏi, intro,...)

  ### 📊 TỔNG QUAN THỊ TRƯỜNG (${startDate} - ${endDate})
  
  - **XU HƯỚNG (${rangeText}):** [Tăng / Giảm / Tích lũy / Phân hóa]
  - **ĐÁNH GIÁ RỦI RO:** [Thấp / Trung bình / Cao] - [Giải thích ngắn]

  ### 1. 📈 VNINDEX & DÒNG TIỀN
  [Nhận định xu hướng giá và động lượng]
  [Hỗ trợ/Kháng cự]

  ### 2. 🌊 ĐỘ RỘNG (MARKET BREADTH)
  [Sự đồng thuận của thị trường?]
  [Trạng thái Quá mua hay Quá bán?]
  [Các điểm giao cắt quan trọng đã hoặc mới xảy ra giữa các đường %>MA20/%>MA50/%>MA200]

  ### 3. 🔄 DÒNG TIỀN NGÀNH (SECTOR ROTATION)
  - **Nhóm Dẫn dắt (Leaders):** [Liệt kê tối đa 3 ngành mạnh nhất so với VNINDEX và nhận định, nếu tất cả các ngành đều xấu tương tự VNINDEX thì trả lời 'Không có Ngành vượt trội]
  - **Nhóm Suy yếu (Laggards):** [Liệt kê các nhóm yếu nhất]
  - **Nhận định về ${sectorName} và ${capName}:** [So sánh với thị trường chung dựa trên dữ liệu]

  ### 🎯 DỰ BÁO & HÀNH ĐỘNG
  - **Kịch bản chính:** [Mô tả kịch bản khả năng cao nhất]
  - **Hành động:** [Khuyến nghị mua/bán/nắm giữ và các mốc %>MA20/%>MA50/%>MA200 quan trọng cần theo dõi]
  `;

  return { systemInstruction, prompt };
};

export const analyzeMarketTrend = async (
  data: ChartDataPoint[], 
  sectorName: string,
  capName: string,
  range: AnalysisRange = '1Y',
  allSectors: SectorDef[] = [],
  model: string = 'gemini-3-pro-preview'
): Promise<AnalysisResult> => {
  try {
    const { systemInstruction, prompt } = await prepareAnalysisContext(data, sectorName, capName, range, allSectors);

    const chatSession = ai.chats.create({
        model: model,
        config: {
            temperature: 0.2,
            systemInstruction: systemInstruction,
        }
    });

    const response = await chatSession.sendMessage({ message: prompt });
    const text = response.text || "Không thể tạo nội dung phân tích.";

    return { text, chatSession };

  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error(error instanceof Error ? error.message : "Lỗi kết nối đến dịch vụ AI.");
  }
};

export const restoreSession = async (
    data: ChartDataPoint[], 
    sectorName: string, 
    capName: string, 
    range: AnalysisRange, 
    allSectors: SectorDef[],
    previousAnalysisText: string,
    chatMessages: {role: 'user' | 'model', text: string}[],
    model: string = 'gemini-3-pro-preview'
): Promise<Chat> => {
    try {
        const { systemInstruction, prompt: initialPrompt } = await prepareAnalysisContext(data, sectorName, capName, range, allSectors);

        const history = [
            { role: 'user', parts: [{ text: initialPrompt }] },
            { role: 'model', parts: [{ text: previousAnalysisText }] },
            ...chatMessages.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.text }]
            }))
        ];

        return ai.chats.create({
            model: model,
            config: {
                temperature: 0.2,
                systemInstruction: systemInstruction,
            },
            history: history
        });
    } catch (error) {
        console.error("Session Restore Error:", error);
        throw new Error("Không thể khôi phục phiên làm việc.");
    }
};
